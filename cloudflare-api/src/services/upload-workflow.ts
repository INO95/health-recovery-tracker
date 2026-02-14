import { parseFleekOcrV1 } from "../parser";
import { applyAliasOverrides, listAliasOverrides } from "../repositories/aliases";
import { shouldRejectOnNeedsReview } from "../upload-policy";
import type { Env } from "../types";

function nowIso(): string {
  return new Date().toISOString();
}

export type UploadWorkflowInput = {
  uploadId: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number;
  storagePath: string;
  parserVersion: string;
  ocrEngineVersion: string;
  ocrTextRaw: string;
  createdAt: string;
};

export async function persistUploadWorkflow(
  env: Env,
  input: UploadWorkflowInput
): Promise<{ parseWarnings: string[] }> {
  const statements: D1PreparedStatement[] = [];
  const parseWarnings: string[] = [];

  statements.push(
    env.DB
      .prepare(
        `INSERT INTO uploads (
          id, filename, original_filename, content_type, size_bytes, status, storage_path,
          parser_version, queue_job_id, error_message, ocr_text_raw, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, 'processing', ?6, ?7, NULL, NULL, ?8, ?9, ?9)`
      )
      .bind(
        input.uploadId,
        input.filename,
        input.filename,
        input.contentType,
        input.sizeBytes,
        input.storagePath,
        `${input.parserVersion}:${input.ocrEngineVersion}`,
        input.ocrTextRaw,
        input.createdAt
      )
  );

  if (!input.ocrTextRaw) {
    statements.push(
      env.DB
        .prepare("UPDATE uploads SET status='failed', error_message=?2, updated_at=?3 WHERE id=?1")
        .bind(input.uploadId, "no ocr text", nowIso())
    );
    await env.DB.batch(statements);
    return { parseWarnings };
  }

  const aliasRows = await listAliasOverrides(env);
  const parsed = applyAliasOverrides(parseFleekOcrV1(input.ocrTextRaw), aliasRows);
  parseWarnings.push(...parsed.meta.warnings);

  if (!parsed.summary.date) {
    statements.push(
      env.DB
        .prepare("UPDATE uploads SET status='failed', error_message=?2, updated_at=?3 WHERE id=?1")
        .bind(input.uploadId, "summary_date_missing", nowIso())
    );
    await env.DB.batch(statements);
    return { parseWarnings };
  }

  if (shouldRejectOnNeedsReview(parsed)) {
    const warningText = parsed.meta.warnings.join(", ");
    const errorMessage = warningText ? `needs review: ${warningText}` : "needs review";
    statements.push(
      env.DB
        .prepare("UPDATE uploads SET status='failed', error_message=?2, updated_at=?3 WHERE id=?1")
        .bind(input.uploadId, errorMessage.slice(0, 500), nowIso())
    );
    await env.DB.batch(statements);
    return { parseWarnings };
  }

  const sessionId = crypto.randomUUID();
  statements.push(
    env.DB
      .prepare(
        `INSERT INTO sessions (id, upload_id, date, started_at, calories_kcal, duration_min, volume_kg, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      )
      .bind(
        sessionId,
        input.uploadId,
        parsed.summary.date,
        `${parsed.summary.date}T12:00:00.000Z`,
        parsed.summary.calories_kcal,
        parsed.summary.duration_min,
        parsed.summary.volume_kg,
        input.createdAt
      )
  );

  for (let i = 0; i < parsed.exercises.length; i += 1) {
    const exercise = parsed.exercises[i];
    const exerciseId = crypto.randomUUID();
    statements.push(
      env.DB
        .prepare("INSERT INTO exercises (id, session_id, raw_name, order_index) VALUES (?1, ?2, ?3, ?4)")
        .bind(exerciseId, sessionId, exercise.raw_name, i + 1)
    );

    for (let j = 0; j < exercise.sets.length; j += 1) {
      const setItem = exercise.sets[j];
      statements.push(
        env.DB
          .prepare("INSERT INTO sets (id, exercise_id, set_index, weight_kg, reps) VALUES (?1, ?2, ?3, ?4, ?5)")
          .bind(crypto.randomUUID(), exerciseId, j + 1, setItem.weight_kg, setItem.reps)
      );
    }
  }

  const warningText = parsed.meta.warnings.join(", ").slice(0, 500);
  statements.push(
    env.DB
      .prepare("UPDATE uploads SET status='parsed', error_message=?2, updated_at=?3 WHERE id=?1")
      .bind(input.uploadId, warningText || null, nowIso())
  );

  await env.DB.batch(statements);
  return { parseWarnings };
}

