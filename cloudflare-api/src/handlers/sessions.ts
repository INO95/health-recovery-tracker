import { errorResponse, jsonResponse } from "../http";
import { getBodyweightSetting } from "../repositories/settings";
import { loadSessionSets } from "../repositories/sessions";
import {
  applySessionUpdate,
  cloneSessionTree,
  removeSessionWithChildren,
  resetNonSeedSessions,
  type NormalizedSessionPayload,
} from "../services/session-workflow";
import { normalizeSessionPayload } from "../session-mutations";
import type { RequestContext, Env } from "../types";

type SessionSummaryRow = {
  id: string;
  date: string;
  started_at: string | null;
  calories_kcal: number | null;
  duration_min: number | null;
  volume_kg: number | null;
  upload_id: string | null;
};

function defaultCloneDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listSessions(url: URL, env: Env, ctx: RequestContext): Promise<Response> {
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

  const rows = await env.DB.prepare(sql).bind(...binds).all<SessionSummaryRow>();
  return jsonResponse(rows.results, ctx.requestId);
}

export async function getSessionDetail(sessionId: string, env: Env, ctx: RequestContext): Promise<Response> {
  const sessionRow = await env.DB
    .prepare("SELECT id, date, started_at, calories_kcal, duration_min, volume_kg, upload_id FROM sessions WHERE id = ?1")
    .bind(sessionId)
    .first<SessionSummaryRow>();

  if (!sessionRow) {
    return errorResponse(404, "session_not_found", ctx.requestId);
  }

  const exerciseRows = await env.DB
    .prepare("SELECT id, raw_name, order_index FROM exercises WHERE session_id = ?1 ORDER BY order_index ASC")
    .bind(sessionId)
    .all<{ id: string; raw_name: string; order_index: number }>();

  const exerciseIds = exerciseRows.results.map((exercise) => exercise.id);
  const setsByExerciseId = await loadSessionSets(env, exerciseIds);

  const exercises = exerciseRows.results.map((exercise) => ({
    id: exercise.id,
    raw_name: exercise.raw_name,
    order_index: exercise.order_index,
    sets: setsByExerciseId.get(exercise.id) ?? [],
  }));

  return jsonResponse({ ...sessionRow, exercises }, ctx.requestId);
}

export async function updateSession(
  req: Request,
  sessionId: string,
  env: Env,
  ctx: RequestContext
): Promise<Response> {
  const existing = await env.DB.prepare("SELECT id FROM sessions WHERE id = ?1").bind(sessionId).first<{ id: string }>();
  if (!existing) {
    return errorResponse(404, "session_not_found", ctx.requestId);
  }

  let payloadRaw: unknown;
  try {
    payloadRaw = await req.json();
  } catch {
    return errorResponse(400, "invalid_json", ctx.requestId);
  }

  let payload;
  try {
    payload = normalizeSessionPayload(payloadRaw as never, { bodyweight_kg: await getBodyweightSetting(env) });
  } catch (error) {
    return errorResponse(400, error instanceof Error ? error.message : "invalid_payload", ctx.requestId);
  }

  try {
    await applySessionUpdate(env, sessionId, payload as NormalizedSessionPayload);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "session_update_failed",
        request_id: ctx.requestId,
        session_id: sessionId,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return errorResponse(400, "invalid_payload", ctx.requestId);
  }

  return getSessionDetail(sessionId, env, ctx);
}

export async function deleteSession(sessionId: string, env: Env, ctx: RequestContext): Promise<Response> {
  const existing = await env.DB.prepare("SELECT id FROM sessions WHERE id = ?1").bind(sessionId).first<{ id: string }>();
  if (!existing) {
    return errorResponse(404, "session_not_found", ctx.requestId);
  }

  await removeSessionWithChildren(env, sessionId);
  return jsonResponse({ ok: true, deleted_session_id: sessionId }, ctx.requestId);
}

export async function resetSessions(env: Env, ctx: RequestContext): Promise<Response> {
  const result = await resetNonSeedSessions(env);
  return jsonResponse(
    { ok: true, deleted_sessions: result.deletedSessions, deleted_uploads: result.deletedUploads },
    ctx.requestId
  );
}

export async function cloneSession(
  req: Request,
  sessionId: string,
  env: Env,
  ctx: RequestContext
): Promise<Response> {
  const source = await env.DB
    .prepare("SELECT id, date, started_at, calories_kcal, duration_min, volume_kg FROM sessions WHERE id = ?1")
    .bind(sessionId)
    .first<{
      id: string;
      date: string;
      started_at: string | null;
      calories_kcal: number | null;
      duration_min: number | null;
      volume_kg: number | null;
    }>();
  if (!source) {
    return errorResponse(404, "session_not_found", ctx.requestId);
  }

  let requestedDate = "";
  try {
    const body = (await req.json()) as { date?: string };
    requestedDate = String(body?.date || "").trim();
  } catch {
    requestedDate = "";
  }
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : defaultCloneDate();
  const newSessionId = await cloneSessionTree(env, source, targetDate);

  return getSessionDetail(newSessionId, env, ctx);
}

