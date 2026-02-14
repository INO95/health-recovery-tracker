import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_dev } from "wrangler";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const WRANGLER_BIN = resolve(PROJECT_ROOT, "node_modules/wrangler/bin/wrangler.js");
const SEED_SESSION_DATE = "1970-01-01";

type WorkerHandle = Awaited<ReturnType<typeof unstable_dev>>;
type WorkerRequestInit = Parameters<WorkerHandle["fetch"]>[1];
type WorkerResponse = Awaited<ReturnType<WorkerHandle["fetch"]>>;

type UploadResponse = {
  id: string;
  status: string;
  parse_warnings?: string[];
};

let persistTo = "";
let worker: WorkerHandle;

async function runWranglerCommand(args: string[]): Promise<void> {
  await execFileAsync("node", [WRANGLER_BIN, ...args], {
    cwd: PROJECT_ROOT,
    env: process.env,
    maxBuffer: 1024 * 1024 * 16,
  });
}

async function fetchJson(
  path: string,
  init?: WorkerRequestInit
): Promise<{ response: WorkerResponse; payload: unknown; rawText: string }> {
  const response = await worker.fetch(path, init);
  const rawText = await response.text();
  const payload = rawText ? (JSON.parse(rawText) as unknown) : null;
  return { response, payload, rawText };
}

function normalizedOcrText(params: { date?: string; exerciseName?: string; needsReview?: boolean; warnings?: string }): string {
  return [
    "[SUMMARY]",
    "split=가슴",
    "weight_unit=kg",
    `date=${params.date ?? "2026-02-11"}`,
    "calories_kcal=300",
    "duration_min=45",
    "volume_kg=1800",
    "exercises_count=1",
    "sets_total=2",
    "reps_total=20",
    "intensity_kg_per_min=40",
    "",
    `[EXERCISE 1] ${params.exerciseName ?? "풀 업"}`,
    "set1: weight=bodyweight reps=10",
    "set2: weight=10kg reps=10",
    "",
    "[META]",
    "confidence=0.93",
    `needs_review=${params.needsReview ? "true" : "false"}`,
    `warnings=${params.warnings ?? ""}`,
  ].join("\n");
}

async function createUpload(ocrTextRaw: string): Promise<UploadResponse> {
  const boundary = `----health-v2-${crypto.randomUUID()}`;
  const encoder = new TextEncoder();
  const fileBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts: Uint8Array[] = [];

  const pushText = (text: string): void => {
    parts.push(encoder.encode(text));
  };

  pushText(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.png"\r\nContent-Type: image/png\r\n\r\n`
  );
  parts.push(fileBytes);
  pushText("\r\n");

  const appendField = (name: string, value: string): void => {
    pushText(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  };
  appendField("ocr_text_raw", ocrTextRaw);
  appendField("ocr_engine_version", "tesseract-js");
  appendField("parser_version", "cf-parser-v1");
  pushText(`--${boundary}--\r\n`);

  const totalSize = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const body = new Uint8Array(totalSize);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.byteLength;
  }

  const { response, payload } = await fetchJson("/api/uploads", {
    method: "POST",
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  expect(response.status).toBe(201);
  expect(response.headers.get("x-request-id")).toBeTruthy();

  return payload as UploadResponse;
}

async function listNonSeedSessions(): Promise<Array<{ id: string; upload_id: string | null; date: string }>> {
  const { response, payload } = await fetchJson("/api/sessions?limit=200");
  expect(response.status).toBe(200);
  return (payload as Array<{ id: string; upload_id: string | null; date: string }>).filter(
    (session) => session.date !== SEED_SESSION_DATE
  );
}

async function sessionPayloadForUpdate(sessionId: string): Promise<{
  date: string;
  started_at: string | null;
  calories_kcal: number | null;
  duration_min: number | null;
  volume_kg: number | null;
  exercises: Array<{
    raw_name: string;
    order_index: number;
    sets: Array<{ set_index: number; weight_kg: number | null; reps: number }>;
  }>;
}> {
  const { response, payload } = await fetchJson(`/api/sessions/${sessionId}`);
  expect(response.status).toBe(200);
  const detail = payload as {
    date: string;
    started_at: string | null;
    calories_kcal: number | null;
    duration_min: number | null;
    volume_kg: number | null;
    exercises: Array<{
      raw_name: string;
      order_index: number;
      sets: Array<{ set_index: number; weight_kg: number | null; reps: number }>;
    }>;
  };
  return {
    date: detail.date,
    started_at: detail.started_at,
    calories_kcal: detail.calories_kcal,
    duration_min: detail.duration_min,
    volume_kg: detail.volume_kg,
    exercises: detail.exercises.map((exercise) => ({
      raw_name: exercise.raw_name,
      order_index: exercise.order_index,
      sets: exercise.sets.map((setRow) => ({
        set_index: setRow.set_index,
        weight_kg: setRow.weight_kg,
        reps: setRow.reps,
      })),
    })),
  };
}

describe("api integration contract", () => {
  beforeAll(async () => {
    persistTo = await mkdtemp(join(tmpdir(), "health-v2-api-int-"));
    await runWranglerCommand([
      "d1",
      "execute",
      "health-v2-db",
      "--local",
      "--persist-to",
      persistTo,
      "--file=./migrations/0001_init.sql",
    ]);
    await runWranglerCommand([
      "d1",
      "execute",
      "health-v2-db",
      "--local",
      "--persist-to",
      persistTo,
      "--file=./migrations/0002_runtime_tables.sql",
    ]);

    worker = await unstable_dev("src/index.ts", {
      config: "wrangler.toml",
      local: true,
      persistTo,
      experimental: {
        disableExperimentalWarning: true,
        testMode: true,
      },
    });
  }, 120_000);

  afterAll(async () => {
    await worker.stop();
    if (persistTo) {
      await rm(persistTo, { recursive: true, force: true });
    }
  });

  it("exposes request id header and structured error contract", async () => {
    const { response } = await fetchJson("/api/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(Number.parseInt(response.headers.get("x-ratelimit-limit") || "0", 10)).toBeGreaterThan(0);
    expect(Number.parseInt(response.headers.get("x-ratelimit-remaining") || "-1", 10)).toBeGreaterThanOrEqual(0);
    expect(Number.parseInt(response.headers.get("x-ratelimit-window") || "0", 10)).toBeGreaterThan(0);

    const forwardedRequestId = `it-${crypto.randomUUID()}`;
    const forwarded = await fetchJson("/api/health", {
      headers: {
        "x-request-id": forwardedRequestId,
      },
    });
    expect(forwarded.response.status).toBe(200);
    expect(forwarded.response.headers.get("x-request-id")).toBe(forwardedRequestId);

    const badRequest = await fetchJson("/api/bodyweight", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bodyweight_kg: 10 }),
    });
    expect(badRequest.response.status).toBe(400);
    expect(badRequest.response.headers.get("x-request-id")).toBeTruthy();
    expect(badRequest.payload).toMatchObject({
      detail: "invalid_bodyweight_kg",
      code: "invalid_bodyweight_kg",
    });
    expect((badRequest.payload as { request_id?: string }).request_id).toBeTruthy();

    const notFound = await fetchJson("/api/unknown-route");
    expect(notFound.response.status).toBe(404);
    expect(notFound.response.headers.get("x-request-id")).toBeTruthy();
    expect(notFound.payload).toMatchObject({
      detail: "not_found",
      code: "not_found",
    });
    expect((notFound.payload as { request_id?: string }).request_id).toBeTruthy();
  });

  it("returns retry-after header and rate-limited contract on burst requests", async () => {
    const clientIp = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
    let rateLimited:
      | {
          response: WorkerResponse;
          payload: unknown;
          rawText: string;
        }
      | null = null;

    for (let i = 0; i < 200; i += 1) {
      const current = await fetchJson("/api/health", {
        headers: {
          "x-forwarded-for": clientIp,
        },
      });

      if (current.response.status === 429) {
        rateLimited = current;
        break;
      }

      expect(current.response.status).toBe(200);
    }

    expect(rateLimited).toBeTruthy();
    if (!rateLimited) {
      return;
    }

    expect(rateLimited.response.headers.get("x-request-id")).toBeTruthy();
    expect(Number.parseInt(rateLimited.response.headers.get("x-ratelimit-limit") || "0", 10)).toBeGreaterThan(0);
    expect(Number.parseInt(rateLimited.response.headers.get("x-ratelimit-remaining") || "-1", 10)).toBe(0);
    expect(Number.parseInt(rateLimited.response.headers.get("x-ratelimit-window") || "0", 10)).toBeGreaterThan(0);
    const retryAfterRaw = rateLimited.response.headers.get("retry-after");
    expect(retryAfterRaw).toBeTruthy();
    expect(Number.parseInt(retryAfterRaw || "0", 10)).toBeGreaterThan(0);
    expect(rateLimited.payload).toMatchObject({
      detail: "rate_limited",
      code: "rate_limited",
    });
    expect((rateLimited.payload as { request_id?: string }).request_id).toBeTruthy();
  });

  it("applies bucket-specific max override when configured", async () => {
    const sessions = await fetchJson("/api/sessions?limit=5");
    expect(sessions.response.status).toBe(200);

    const sessionsLimit = Number.parseInt(sessions.response.headers.get("x-ratelimit-limit") || "0", 10);
    const sessionsWindow = Number.parseInt(sessions.response.headers.get("x-ratelimit-window") || "0", 10);
    expect(sessionsLimit).toBe(100);
    expect(sessionsWindow).toBe(45);
  });

  it("handles upload fixtures for normal, summary-missing, needs-review, and unmapped cases", async () => {
    const beforeCount = (await listNonSeedSessions()).length;

    const normal = await createUpload(normalizedOcrText({ date: "2026-02-11" }));
    expect(normal.status).toBe("parsed");

    const summaryMissing = await createUpload(normalizedOcrText({ date: "unknown" }));
    expect(summaryMissing.status).toBe("failed");
    expect(summaryMissing.parse_warnings?.some((warning) => warning.startsWith("summary_missing:"))).toBe(true);

    const needsReview = await createUpload(
      normalizedOcrText({
        date: "2026-02-12",
        needsReview: true,
        warnings: "low_confidence",
      })
    );
    expect(needsReview.status).toBe("parsed");
    expect(needsReview.parse_warnings).toContain("low_confidence");

    const unmapped = await createUpload(
      normalizedOcrText({
        date: "2026-02-13",
        exerciseName: "Mystery Lift Alpha",
      })
    );
    expect(unmapped.status).toBe("parsed");

    const sessionsAfter = await listNonSeedSessions();
    expect(sessionsAfter.length).toBe(beforeCount + 3);

    const recovery = await fetchJson("/api/recovery?days=30");
    expect(recovery.response.status).toBe(200);
    const unmappedExercises = (recovery.payload as { unmapped_exercises: Array<{ raw_name: string; count: number }> })
      .unmapped_exercises;
    expect(unmappedExercises.some((entry) => entry.raw_name === "Mystery Lift Alpha" && entry.count >= 1)).toBe(true);
  });

  it("preserves session data when patch fails mid-flight and still supports clone", async () => {
    const upload = await createUpload(normalizedOcrText({ date: "2026-02-14" }));
    expect(upload.status).toBe("parsed");

    const sessions = await listNonSeedSessions();
    const target = sessions.find((session) => session.upload_id === upload.id);
    expect(target).toBeTruthy();
    const sessionId = String(target?.id);

    const baseline = await sessionPayloadForUpdate(sessionId);
    expect(baseline.exercises.length).toBeGreaterThan(0);

    const invalidPatchPayload = {
      ...baseline,
      exercises: baseline.exercises.map((exercise, exerciseIndex) => ({
        ...exercise,
        sets: exercise.sets.map((setRow, setIndex) => ({
          ...setRow,
          reps: exerciseIndex === 0 && setIndex === 0 ? ("bad-reps" as unknown as number) : setRow.reps,
        })),
      })),
    };

    const patchResponse = await fetchJson(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(invalidPatchPayload),
    });
    expect(patchResponse.response.status).toBe(400);
    expect(patchResponse.payload).toMatchObject({
      detail: "invalid_payload",
      code: "invalid_payload",
    });

    const afterFailedPatch = await sessionPayloadForUpdate(sessionId);
    expect(afterFailedPatch.exercises[0].sets[0].weight_kg).toBe(baseline.exercises[0].sets[0].weight_kg);
    expect(afterFailedPatch.exercises.length).toBe(baseline.exercises.length);

    const cloneResponse = await fetchJson(`/api/sessions/${sessionId}/clone`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: "2026-02-15" }),
    });
    expect(cloneResponse.response.status).toBe(200);
    const cloned = cloneResponse.payload as { id: string; date: string; exercises: unknown[] };
    expect(cloned.id).not.toBe(sessionId);
    expect(cloned.date).toBe("2026-02-15");
    expect(cloned.exercises.length).toBe(baseline.exercises.length);
  });

  it("returns deterministic recovery output for same reference_at", async () => {
    const targetPath = "/api/recovery?days=30&reference_at=2026-02-16T12:00:00.000Z";
    const first = await fetchJson(targetPath);
    expect(first.response.status).toBe(200);

    const second = await fetchJson(targetPath);
    expect(second.response.status).toBe(200);

    expect(second.payload).toEqual(first.payload);
  });

  it("reflects bodyweight and recovery-setting updates in recovery output", async () => {
    const putBodyweight = await fetchJson("/api/bodyweight", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bodyweight_kg: 82 }),
    });
    expect(putBodyweight.response.status).toBe(200);
    expect(putBodyweight.payload).toMatchObject({ ok: true, bodyweight_kg: 82 });

    const putSettings = await fetchJson("/api/recovery/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings: { back: 72 } }),
    });
    expect(putSettings.response.status).toBe(200);
    expect(putSettings.payload).toMatchObject({ ok: true });

    const recovery = await fetchJson("/api/recovery?days=30&reference_at=2026-02-16T12:00:00.000Z");
    expect(recovery.response.status).toBe(200);
    expect(recovery.payload).toMatchObject({
      bodyweight_kg: 82,
    });
    const typed = recovery.payload as { recovery_settings: Record<string, number> };
    expect(typed.recovery_settings.back).toBe(72);
  });
});
