import { normalizeNameKey, parseFleekOcrV1 } from "./parser";
import { normalizeParsedResult } from "./ocr-normalize";
import { computeRecovery, listRecoverySettings, updateRecoverySetting } from "./recovery";
import { shouldRejectOnNeedsReview } from "./upload-policy";
import { normalizeSessionPayload } from "./session-mutations";

type Env = {
  DB: D1Database;
  UPLOADS: R2Bucket;
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function nowIso(): string {
  return new Date().toISOString();
}

function errorResponse(status: number, detail: string): Response {
  return json({ detail }, status);
}

function fileExtension(filename: string): string {
  const i = filename.lastIndexOf(".");
  if (i < 0) return "";
  return filename.slice(i).toLowerCase();
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function ensureUserSettingsTable(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS user_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  ).run();
}

async function getBodyweightSetting(env: Env): Promise<number> {
  await ensureUserSettingsTable(env);
  const row = await env.DB
    .prepare("SELECT value FROM user_settings WHERE key = 'bodyweight_kg'")
    .first<{ value: string }>();
  if (!row) {
    await env.DB
      .prepare("INSERT INTO user_settings (key, value, updated_at) VALUES ('bodyweight_kg', ?1, ?2)")
      .bind("70", nowIso())
      .run();
    return 70;
  }
  const parsed = Number(row.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 70;
}

async function setBodyweightSetting(env: Env, value: number): Promise<number> {
  await ensureUserSettingsTable(env);
  const normalized = Number.isFinite(value) && value > 0 ? Number(value.toFixed(2)) : 70;
  await env.DB
    .prepare(
      `INSERT INTO user_settings (key, value, updated_at)
       VALUES ('bodyweight_kg', ?1, ?2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(String(normalized), nowIso())
    .run();
  return normalized;
}

async function ensureSessionStartedAtColumn(env: Env): Promise<void> {
  const columns = await env.DB.prepare("PRAGMA table_info(sessions)").all<{ name: string }>();
  const hasStartedAt = columns.results.some((col) => col.name === "started_at");
  if (!hasStartedAt) {
    await env.DB.prepare("ALTER TABLE sessions ADD COLUMN started_at TEXT").run();
  }
  await env.DB.prepare("UPDATE sessions SET started_at = date || 'T12:00:00.000Z' WHERE started_at IS NULL").run();
}

async function ensureAliasTable(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS exercise_alias_overrides (
      id TEXT PRIMARY KEY,
      alias_raw TEXT NOT NULL,
      alias_key TEXT NOT NULL UNIQUE,
      canonical_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  ).run();
}

async function listAliasOverrides(env: Env): Promise<Array<{ id: string; alias_raw: string; alias_key: string; canonical_name: string; created_at: string }>> {
  await ensureAliasTable(env);
  const rows = await env.DB
    .prepare("SELECT id, alias_raw, alias_key, canonical_name, created_at FROM exercise_alias_overrides ORDER BY created_at DESC")
    .all<{ id: string; alias_raw: string; alias_key: string; canonical_name: string; created_at: string }>();
  return rows.results;
}

function applyAliasOverrides(
  parsed: ReturnType<typeof parseFleekOcrV1>,
  aliasRows: Array<{ alias_key: string; canonical_name: string }>
): ReturnType<typeof parseFleekOcrV1> {
  if (aliasRows.length === 0) {
    return parsed;
  }
  const byKey = new Map(aliasRows.map((row) => [row.alias_key, row.canonical_name]));
  const exercises = parsed.exercises.map((exercise) => {
    const mapped = byKey.get(normalizeNameKey(exercise.raw_name));
    if (!mapped) return exercise;
    return { ...exercise, raw_name: mapped };
  });
  return { ...parsed, exercises };
}

async function createUpload(req: Request, env: Env): Promise<Response> {
  await ensureSessionStartedAtColumn(env);
  const formData = await req.formData();
  const file = formData.get("file");
  const parserVersion = String(formData.get("parser_version") || "cf-parser-v1");
  const ocrEngineVersion = String(formData.get("ocr_engine_version") || "tesseract-js");
  const ocrTextRaw = String(formData.get("ocr_text_raw") || "").trim();

  if (!(file instanceof File)) {
    return errorResponse(400, "file_required");
  }
  if (!file.name) {
    return errorResponse(400, "filename_required");
  }

  const uploadId = crypto.randomUUID();
  const key = `uploads/${uploadId}${fileExtension(file.name) || ".bin"}`;
  const fileBuffer = await file.arrayBuffer();
  await env.UPLOADS.put(key, fileBuffer, {
    httpMetadata: {
      contentType: file.type || "application/octet-stream",
    },
    customMetadata: {
      originalFilename: sanitizeFilename(file.name),
    },
  });

  const createdAt = nowIso();

  await env.DB.prepare(
    `INSERT INTO uploads (
      id, filename, original_filename, content_type, size_bytes, status, storage_path,
      parser_version, queue_job_id, error_message, ocr_text_raw, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, 'processing', ?6, ?7, NULL, NULL, ?8, ?9, ?9)`
  )
    .bind(
      uploadId,
      file.name,
      file.name,
      file.type || null,
      file.size,
      key,
      `${parserVersion}:${ocrEngineVersion}`,
      ocrTextRaw,
      createdAt
    )
    .run();

  if (!ocrTextRaw) {
    await env.DB.prepare("UPDATE uploads SET status='failed', error_message=?2, updated_at=?3 WHERE id=?1")
      .bind(uploadId, "no ocr text", nowIso())
      .run();

    const row = await env.DB.prepare("SELECT * FROM uploads WHERE id = ?1").bind(uploadId).first<Record<string, unknown>>();
    return json(row, 201);
  }

  const aliasRows = await listAliasOverrides(env);
  const parsed = applyAliasOverrides(parseFleekOcrV1(ocrTextRaw), aliasRows);
  if (!parsed.summary.date) {
    await env.DB.prepare("UPDATE uploads SET status='failed', error_message=?2, updated_at=?3 WHERE id=?1")
      .bind(uploadId, "summary_date_missing", nowIso())
      .run();
    const row = await env.DB.prepare("SELECT * FROM uploads WHERE id = ?1").bind(uploadId).first<Record<string, unknown>>();
    return json({ ...row, parse_warnings: parsed.meta.warnings }, 201);
  }

  if (shouldRejectOnNeedsReview(parsed)) {
    const warningText = parsed.meta.warnings.join(", ");
    const errorMessage = warningText ? `needs review: ${warningText}` : "needs review";
    await env.DB.prepare("UPDATE uploads SET status='failed', error_message=?2, updated_at=?3 WHERE id=?1")
      .bind(uploadId, errorMessage.slice(0, 500), nowIso())
      .run();
    const row = await env.DB.prepare("SELECT * FROM uploads WHERE id = ?1").bind(uploadId).first<Record<string, unknown>>();
    return json({ ...row, parse_warnings: parsed.meta.warnings }, 201);
  }

  const sessionId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO sessions (id, upload_id, date, started_at, calories_kcal, duration_min, volume_kg, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  )
    .bind(
      sessionId,
      uploadId,
      parsed.summary.date,
      `${parsed.summary.date}T12:00:00.000Z`,
      parsed.summary.calories_kcal,
      parsed.summary.duration_min,
      parsed.summary.volume_kg,
      createdAt
    )
    .run();

  for (let i = 0; i < parsed.exercises.length; i += 1) {
    const exercise = parsed.exercises[i];
    const exerciseId = crypto.randomUUID();

    await env.DB.prepare("INSERT INTO exercises (id, session_id, raw_name, order_index) VALUES (?1, ?2, ?3, ?4)")
      .bind(exerciseId, sessionId, exercise.raw_name, i + 1)
      .run();

    for (let j = 0; j < exercise.sets.length; j += 1) {
      const setItem = exercise.sets[j];
      await env.DB.prepare(
        "INSERT INTO sets (id, exercise_id, set_index, weight_kg, reps) VALUES (?1, ?2, ?3, ?4, ?5)"
      )
        .bind(crypto.randomUUID(), exerciseId, j + 1, setItem.weight_kg, setItem.reps)
        .run();
    }
  }

  const warningText = parsed.meta.warnings.join(", ").slice(0, 500);
  await env.DB.prepare("UPDATE uploads SET status='parsed', error_message=?2, updated_at=?3 WHERE id=?1")
    .bind(uploadId, warningText || null, nowIso())
    .run();

  const row = await env.DB.prepare("SELECT * FROM uploads WHERE id = ?1").bind(uploadId).first<Record<string, unknown>>();
  return json({ ...row, parse_warnings: parsed.meta.warnings }, 201);
}

async function listSessions(url: URL, env: Env): Promise<Response> {
  await ensureSessionStartedAtColumn(env);
  const fromDate = url.searchParams.get("from");
  const toDate = url.searchParams.get("to");
  const limit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
  const boundedLimit = Number.isNaN(limit) ? 50 : Math.max(1, Math.min(200, limit));

  const clauses: string[] = [];
  const binds: Array<string | number> = [];

  if (fromDate) {
    clauses.push("date >= ?");
    binds.push(fromDate);
  }
  if (toDate) {
    clauses.push("date <= ?");
    binds.push(toDate);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const sql = `
    SELECT id, date, started_at, calories_kcal, duration_min, volume_kg, upload_id
    FROM sessions
    ${whereSql}
    ORDER BY date DESC, created_at DESC
    LIMIT ?
  `;
  binds.push(boundedLimit);

  const rows = await env.DB.prepare(sql).bind(...binds).all<Record<string, unknown>>();
  return json(rows.results);
}

async function getSessionDetail(sessionId: string, env: Env): Promise<Response> {
  await ensureSessionStartedAtColumn(env);
  const sessionRow = await env.DB.prepare(
    "SELECT id, date, started_at, calories_kcal, duration_min, volume_kg, upload_id FROM sessions WHERE id = ?1"
  )
    .bind(sessionId)
    .first<Record<string, unknown>>();

  if (!sessionRow) {
    return errorResponse(404, "session_not_found");
  }

  const exerciseRows = await env.DB.prepare(
    "SELECT id, raw_name, order_index FROM exercises WHERE session_id = ?1 ORDER BY order_index ASC"
  )
    .bind(sessionId)
    .all<{ id: string; raw_name: string; order_index: number }>();

  const exercises = [];
  for (const exercise of exerciseRows.results) {
    const sets = await env.DB.prepare(
      "SELECT id, set_index, weight_kg, reps FROM sets WHERE exercise_id = ?1 ORDER BY set_index ASC"
    )
      .bind(exercise.id)
      .all<Record<string, unknown>>();

    exercises.push({
      id: exercise.id,
      raw_name: exercise.raw_name,
      order_index: exercise.order_index,
      sets: sets.results,
    });
  }

  return json({ ...sessionRow, exercises });
}

async function updateSession(req: Request, sessionId: string, env: Env): Promise<Response> {
  await ensureSessionStartedAtColumn(env);
  const existing = await env.DB.prepare("SELECT id FROM sessions WHERE id = ?1").bind(sessionId).first<{ id: string }>();
  if (!existing) {
    return errorResponse(404, "session_not_found");
  }

  let payloadRaw: unknown;
  try {
    payloadRaw = await req.json();
  } catch {
    return errorResponse(400, "invalid_json");
  }

  let payload;
  try {
    payload = normalizeSessionPayload(payloadRaw as never, { bodyweight_kg: await getBodyweightSetting(env) });
  } catch (error) {
    return errorResponse(400, error instanceof Error ? error.message : "invalid_payload");
  }

  await env.DB.prepare(
    "UPDATE sessions SET date=?2, started_at=?3, calories_kcal=?4, duration_min=?5, volume_kg=?6 WHERE id=?1"
  )
    .bind(sessionId, payload.date, payload.started_at, payload.calories_kcal, payload.duration_min, payload.volume_kg)
    .run();

  const existingExerciseRows = await env.DB.prepare("SELECT id FROM exercises WHERE session_id = ?1").bind(sessionId).all<{ id: string }>();
  for (const row of existingExerciseRows.results) {
    await env.DB.prepare("DELETE FROM sets WHERE exercise_id = ?1").bind(row.id).run();
  }
  await env.DB.prepare("DELETE FROM exercises WHERE session_id = ?1").bind(sessionId).run();

  for (const exercise of payload.exercises) {
    const exerciseId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO exercises (id, session_id, raw_name, order_index) VALUES (?1, ?2, ?3, ?4)")
      .bind(exerciseId, sessionId, exercise.raw_name, exercise.order_index)
      .run();
    for (const setRow of exercise.sets) {
      await env.DB.prepare("INSERT INTO sets (id, exercise_id, set_index, weight_kg, reps) VALUES (?1, ?2, ?3, ?4, ?5)")
        .bind(crypto.randomUUID(), exerciseId, setRow.set_index, setRow.weight_kg, setRow.reps)
        .run();
    }
  }

  return getSessionDetail(sessionId, env);
}

async function deleteSession(sessionId: string, env: Env): Promise<Response> {
  const existing = await env.DB.prepare("SELECT id FROM sessions WHERE id = ?1").bind(sessionId).first<{ id: string }>();
  if (!existing) {
    return errorResponse(404, "session_not_found");
  }

  const exerciseRows = await env.DB.prepare("SELECT id FROM exercises WHERE session_id = ?1").bind(sessionId).all<{ id: string }>();
  for (const row of exerciseRows.results) {
    await env.DB.prepare("DELETE FROM sets WHERE exercise_id = ?1").bind(row.id).run();
  }
  await env.DB.prepare("DELETE FROM exercises WHERE session_id = ?1").bind(sessionId).run();
  await env.DB.prepare("DELETE FROM sessions WHERE id = ?1").bind(sessionId).run();
  return json({ ok: true, deleted_session_id: sessionId });
}

async function resetSessions(env: Env): Promise<Response> {
  const nonSeedSessions = await env.DB
    .prepare("SELECT id, upload_id FROM sessions WHERE date != '1970-01-01'")
    .all<{ id: string; upload_id: string | null }>();
  const sessionIds = nonSeedSessions.results.map((row) => row.id);

  if (sessionIds.length > 0) {
    const placeholders = sessionIds.map(() => "?").join(",");
    const exerciseRows = await env.DB
      .prepare(`SELECT id FROM exercises WHERE session_id IN (${placeholders})`)
      .bind(...sessionIds)
      .all<{ id: string }>();
    for (const ex of exerciseRows.results) {
      await env.DB.prepare("DELETE FROM sets WHERE exercise_id = ?1").bind(ex.id).run();
    }
    await env.DB.prepare(`DELETE FROM exercises WHERE session_id IN (${placeholders})`).bind(...sessionIds).run();
    await env.DB.prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`).bind(...sessionIds).run();
  }

  const uploadIds = nonSeedSessions.results.map((row) => row.upload_id).filter((v): v is string => Boolean(v));
  if (uploadIds.length > 0) {
    const placeholders = uploadIds.map(() => "?").join(",");
    await env.DB.prepare(`DELETE FROM uploads WHERE id IN (${placeholders})`).bind(...uploadIds).run();
  }

  return json({ ok: true, deleted_sessions: sessionIds.length, deleted_uploads: uploadIds.length });
}

async function cloneSession(req: Request, sessionId: string, env: Env): Promise<Response> {
  await ensureSessionStartedAtColumn(env);
  const source = await env.DB
    .prepare("SELECT id, date, started_at, calories_kcal, duration_min, volume_kg FROM sessions WHERE id = ?1")
    .bind(sessionId)
    .first<{ id: string; date: string; started_at: string | null; calories_kcal: number | null; duration_min: number | null; volume_kg: number | null }>();
  if (!source) {
    return errorResponse(404, "session_not_found");
  }

  let requestedDate = "";
  try {
    const body = (await req.json()) as { date?: string };
    requestedDate = String(body?.date || "").trim();
  } catch {
    requestedDate = "";
  }
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : new Date().toISOString().slice(0, 10);
  const sourceStartedAt = source.started_at ? new Date(source.started_at) : null;
  const timePart = sourceStartedAt && !Number.isNaN(sourceStartedAt.getTime())
    ? sourceStartedAt.toISOString().slice(11, 19)
    : "12:00:00";
  const targetStartedAt = `${targetDate}T${timePart}.000Z`;
  const newSessionId = crypto.randomUUID();
  await env.DB
    .prepare("INSERT INTO sessions (id, upload_id, date, started_at, calories_kcal, duration_min, volume_kg, created_at) VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, ?7)")
    .bind(newSessionId, targetDate, targetStartedAt, source.calories_kcal, source.duration_min, source.volume_kg, nowIso())
    .run();

  const sourceExercises = await env.DB
    .prepare("SELECT id, raw_name, order_index FROM exercises WHERE session_id = ?1 ORDER BY order_index ASC")
    .bind(sessionId)
    .all<{ id: string; raw_name: string; order_index: number }>();

  for (const sourceExercise of sourceExercises.results) {
    const newExerciseId = crypto.randomUUID();
    await env.DB
      .prepare("INSERT INTO exercises (id, session_id, raw_name, order_index) VALUES (?1, ?2, ?3, ?4)")
      .bind(newExerciseId, newSessionId, sourceExercise.raw_name, sourceExercise.order_index)
      .run();
    const sets = await env.DB
      .prepare("SELECT set_index, weight_kg, reps FROM sets WHERE exercise_id = ?1 ORDER BY set_index ASC")
      .bind(sourceExercise.id)
      .all<{ set_index: number; weight_kg: number | null; reps: number }>();
    for (const setRow of sets.results) {
      await env.DB
        .prepare("INSERT INTO sets (id, exercise_id, set_index, weight_kg, reps) VALUES (?1, ?2, ?3, ?4, ?5)")
        .bind(crypto.randomUUID(), newExerciseId, setRow.set_index, setRow.weight_kg, setRow.reps)
        .run();
    }
  }

  return getSessionDetail(newSessionId, env);
}

async function createAliasOverride(req: Request, env: Env): Promise<Response> {
  let payload: { alias_raw?: string; canonical_name?: string };
  try {
    payload = (await req.json()) as { alias_raw?: string; canonical_name?: string };
  } catch {
    return errorResponse(400, "invalid_json");
  }

  const aliasRaw = String(payload.alias_raw || "").trim();
  const canonicalName = String(payload.canonical_name || "").trim();
  if (!aliasRaw || !canonicalName) {
    return errorResponse(400, "alias_and_canonical_required");
  }

  await ensureAliasTable(env);
  const aliasKey = normalizeNameKey(aliasRaw);
  const id = crypto.randomUUID();
  await env.DB
    .prepare(
      `INSERT INTO exercise_alias_overrides (id, alias_raw, alias_key, canonical_name, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(alias_key) DO UPDATE SET canonical_name = excluded.canonical_name, alias_raw = excluded.alias_raw`
    )
    .bind(id, aliasRaw, aliasKey, canonicalName, nowIso())
    .run();

  return json({ ok: true, alias_raw: aliasRaw, alias_key: aliasKey, canonical_name: canonicalName });
}

async function deleteAliasOverride(aliasId: string, env: Env): Promise<Response> {
  await ensureAliasTable(env);
  await env.DB.prepare("DELETE FROM exercise_alias_overrides WHERE id = ?1").bind(aliasId).run();
  return json({ ok: true, deleted_alias_id: aliasId });
}

async function getRecovery(url: URL, env: Env): Promise<Response> {
  await ensureSessionStartedAtColumn(env);
  const days = Number.parseInt(url.searchParams.get("days") || "7", 10);
  const fromDate = url.searchParams.get("from");
  const toDate = url.searchParams.get("to");
  const referenceAt = url.searchParams.get("reference_at");

  try {
    const bodyweightKg = await getBodyweightSetting(env);
    const payload = await computeRecovery(env.DB, {
      days: Number.isNaN(days) ? 7 : Math.max(1, Math.min(30, days)),
      from: fromDate,
      to: toDate,
      reference_at: referenceAt,
      bodyweight_kg: bodyweightKg,
    });
    return json(payload);
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_time_window") {
      return errorResponse(400, "invalid_time_window");
    }
    if (error instanceof Error && error.message === "invalid_reference_time") {
      return errorResponse(400, "invalid_reference_time");
    }
    return errorResponse(500, "recovery_compute_failed");
  }
}

async function getBodyweight(env: Env): Promise<Response> {
  return json({ bodyweight_kg: await getBodyweightSetting(env) });
}

async function putBodyweight(req: Request, env: Env): Promise<Response> {
  let payload: { bodyweight_kg?: number };
  try {
    payload = (await req.json()) as { bodyweight_kg?: number };
  } catch {
    return errorResponse(400, "invalid_json");
  }
  const value = Number(payload.bodyweight_kg);
  if (!Number.isFinite(value) || value < 30 || value > 250) {
    return errorResponse(400, "invalid_bodyweight_kg");
  }
  const saved = await setBodyweightSetting(env, value);
  return json({ ok: true, bodyweight_kg: saved });
}

async function getRecoverySettings(env: Env): Promise<Response> {
  const muscleRows = await env.DB
    .prepare("SELECT code FROM muscle_groups ORDER BY code ASC")
    .all<{ code: string }>();
  const settings = await listRecoverySettings(env.DB, muscleRows.results.map((row) => row.code));
  return json({ settings });
}

async function putRecoverySettings(req: Request, env: Env): Promise<Response> {
  let payload: { settings?: Record<string, number> };
  try {
    payload = (await req.json()) as { settings?: Record<string, number> };
  } catch {
    return errorResponse(400, "invalid_json");
  }

  const settings = payload.settings ?? {};
  const entries = Object.entries(settings);
  if (entries.length === 0) {
    return errorResponse(400, "settings_required");
  }

  const muscleRows = await env.DB
    .prepare("SELECT code FROM muscle_groups")
    .all<{ code: string }>();
  const knownCodes = new Set(muscleRows.results.map((row) => row.code));

  for (const [muscleCode, restHoursRaw] of entries) {
    if (!knownCodes.has(muscleCode)) {
      return errorResponse(400, `unknown_muscle_code:${muscleCode}`);
    }
    const restHours = Number(restHoursRaw);
    if (!Number.isFinite(restHours) || restHours <= 0 || restHours > 240) {
      return errorResponse(400, `invalid_rest_hours:${muscleCode}`);
    }
    await updateRecoverySetting(env.DB, muscleCode, restHours);
  }

  const resolved = await listRecoverySettings(env.DB, Array.from(knownCodes));
  return json({ ok: true, settings: resolved });
}

async function normalizeOcr(req: Request, env: Env): Promise<Response> {
  let payload: { raw_text?: string };
  try {
    payload = (await req.json()) as { raw_text?: string };
  } catch {
    return errorResponse(400, "invalid_json");
  }

  const rawText = String(payload.raw_text || "").trim();
  if (!rawText) {
    return errorResponse(400, "raw_text_required");
  }

  const aliasRows = await listAliasOverrides(env);
  const parsed = applyAliasOverrides(parseFleekOcrV1(rawText), aliasRows);
  return json(normalizeParsedResult(parsed, rawText));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    await ensureSessionStartedAtColumn(env);
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      return json({ status: "ok" });
    }

    if (req.method === "POST" && url.pathname === "/api/uploads") {
      return createUpload(req, env);
    }

    if (req.method === "POST" && url.pathname === "/api/ocr/normalize") {
      return normalizeOcr(req, env);
    }

    if (req.method === "GET" && url.pathname === "/api/sessions") {
      return listSessions(url, env);
    }
    if (req.method === "POST" && url.pathname === "/api/sessions/reset") {
      return resetSessions(env);
    }

    const sessionDetailMatch = url.pathname.match(/^\/api\/sessions\/([0-9a-fA-F-]{36})$/);
    if (req.method === "GET" && sessionDetailMatch) {
      return getSessionDetail(sessionDetailMatch[1], env);
    }
    if (req.method === "PATCH" && sessionDetailMatch) {
      return updateSession(req, sessionDetailMatch[1], env);
    }
    if (req.method === "DELETE" && sessionDetailMatch) {
      return deleteSession(sessionDetailMatch[1], env);
    }

    const cloneMatch = url.pathname.match(/^\/api\/sessions\/([0-9a-fA-F-]{36})\/clone$/);
    if (req.method === "POST" && cloneMatch) {
      return cloneSession(req, cloneMatch[1], env);
    }

    if (req.method === "GET" && url.pathname === "/api/exercise-aliases") {
      return json(await listAliasOverrides(env));
    }
    if (req.method === "POST" && url.pathname === "/api/exercise-aliases") {
      return createAliasOverride(req, env);
    }
    const aliasDeleteMatch = url.pathname.match(/^\/api\/exercise-aliases\/([0-9a-fA-F-]{36})$/);
    if (req.method === "DELETE" && aliasDeleteMatch) {
      return deleteAliasOverride(aliasDeleteMatch[1], env);
    }

    if (req.method === "GET" && url.pathname === "/api/recovery") {
      return getRecovery(url, env);
    }
    if (req.method === "GET" && url.pathname === "/api/recovery/settings") {
      return getRecoverySettings(env);
    }
    if (req.method === "PUT" && url.pathname === "/api/recovery/settings") {
      return putRecoverySettings(req, env);
    }
    if (req.method === "GET" && url.pathname === "/api/bodyweight") {
      return getBodyweight(env);
    }
    if (req.method === "PUT" && url.pathname === "/api/bodyweight") {
      return putBodyweight(req, env);
    }

    return errorResponse(404, "not_found");
  },
};
