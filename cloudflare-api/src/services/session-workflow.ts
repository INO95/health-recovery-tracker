import { buildInClausePlaceholders } from "../db-utils";
import { loadCloneSourceSets } from "../repositories/sessions";
import type { Env } from "../types";

function nowIso(): string {
  return new Date().toISOString();
}

export type NormalizedSessionPayload = {
  date: string;
  started_at: string;
  calories_kcal: number | null;
  duration_min: number | null;
  volume_kg: number;
  exercises: Array<{
    raw_name: string;
    order_index: number;
    sets: Array<{
      set_index: number;
      weight_kg: number | null;
      reps: number;
    }>;
  }>;
};

export async function applySessionUpdate(
  env: Env,
  sessionId: string,
  payload: NormalizedSessionPayload
): Promise<void> {
  const existingExerciseRows = await env.DB
    .prepare("SELECT id FROM exercises WHERE session_id = ?1")
    .bind(sessionId)
    .all<{ id: string }>();
  const existingExerciseIds = existingExerciseRows.results.map((row) => row.id);

  const statements: D1PreparedStatement[] = [];
  statements.push(
    env.DB
      .prepare("UPDATE sessions SET date=?2, started_at=?3, calories_kcal=?4, duration_min=?5, volume_kg=?6 WHERE id=?1")
      .bind(sessionId, payload.date, payload.started_at, payload.calories_kcal, payload.duration_min, payload.volume_kg)
  );
  if (existingExerciseIds.length > 0) {
    const placeholders = buildInClausePlaceholders(existingExerciseIds.length);
    statements.push(env.DB.prepare(`DELETE FROM sets WHERE exercise_id IN (${placeholders})`).bind(...existingExerciseIds));
  }
  statements.push(env.DB.prepare("DELETE FROM exercises WHERE session_id = ?1").bind(sessionId));

  for (const exercise of payload.exercises) {
    const exerciseId = crypto.randomUUID();
    statements.push(
      env.DB
        .prepare("INSERT INTO exercises (id, session_id, raw_name, order_index) VALUES (?1, ?2, ?3, ?4)")
        .bind(exerciseId, sessionId, exercise.raw_name, exercise.order_index)
    );
    for (const setRow of exercise.sets) {
      statements.push(
        env.DB
          .prepare("INSERT INTO sets (id, exercise_id, set_index, weight_kg, reps) VALUES (?1, ?2, ?3, ?4, ?5)")
          .bind(crypto.randomUUID(), exerciseId, setRow.set_index, setRow.weight_kg, setRow.reps)
      );
    }
  }

  await env.DB.batch(statements);
}

export async function removeSessionWithChildren(env: Env, sessionId: string): Promise<void> {
  const exerciseRows = await env.DB
    .prepare("SELECT id FROM exercises WHERE session_id = ?1")
    .bind(sessionId)
    .all<{ id: string }>();
  const exerciseIds = exerciseRows.results.map((row) => row.id);

  const statements: D1PreparedStatement[] = [];
  if (exerciseIds.length > 0) {
    const placeholders = buildInClausePlaceholders(exerciseIds.length);
    statements.push(env.DB.prepare(`DELETE FROM sets WHERE exercise_id IN (${placeholders})`).bind(...exerciseIds));
  }
  statements.push(env.DB.prepare("DELETE FROM exercises WHERE session_id = ?1").bind(sessionId));
  statements.push(env.DB.prepare("DELETE FROM sessions WHERE id = ?1").bind(sessionId));

  await env.DB.batch(statements);
}

export async function resetNonSeedSessions(
  env: Env
): Promise<{ deletedSessions: number; deletedUploads: number }> {
  const nonSeedSessions = await env.DB
    .prepare("SELECT id, upload_id FROM sessions WHERE date != '1970-01-01'")
    .all<{ id: string; upload_id: string | null }>();

  const sessionIds = nonSeedSessions.results.map((row) => row.id);
  const uploadIds = nonSeedSessions.results.map((row) => row.upload_id).filter((v): v is string => Boolean(v));
  const statements: D1PreparedStatement[] = [];

  if (sessionIds.length > 0) {
    const placeholders = buildInClausePlaceholders(sessionIds.length);
    const exerciseRows = await env.DB
      .prepare(`SELECT id FROM exercises WHERE session_id IN (${placeholders})`)
      .bind(...sessionIds)
      .all<{ id: string }>();
    const exerciseIds = exerciseRows.results.map((ex) => ex.id);
    if (exerciseIds.length > 0) {
      const setPlaceholders = buildInClausePlaceholders(exerciseIds.length);
      statements.push(env.DB.prepare(`DELETE FROM sets WHERE exercise_id IN (${setPlaceholders})`).bind(...exerciseIds));
    }
    statements.push(env.DB.prepare(`DELETE FROM exercises WHERE session_id IN (${placeholders})`).bind(...sessionIds));
    statements.push(env.DB.prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`).bind(...sessionIds));
  }

  if (uploadIds.length > 0) {
    const placeholders = buildInClausePlaceholders(uploadIds.length);
    statements.push(env.DB.prepare(`DELETE FROM uploads WHERE id IN (${placeholders})`).bind(...uploadIds));
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  return {
    deletedSessions: sessionIds.length,
    deletedUploads: uploadIds.length,
  };
}

export async function cloneSessionTree(
  env: Env,
  source: {
    id: string;
    date: string;
    started_at: string | null;
    calories_kcal: number | null;
    duration_min: number | null;
    volume_kg: number | null;
  },
  targetDate: string
): Promise<string> {
  const sourceStartedAt = source.started_at ? new Date(source.started_at) : null;
  const timePart = sourceStartedAt && !Number.isNaN(sourceStartedAt.getTime())
    ? sourceStartedAt.toISOString().slice(11, 19)
    : "12:00:00";
  const targetStartedAt = `${targetDate}T${timePart}.000Z`;

  const sourceExercises = await env.DB
    .prepare("SELECT id, raw_name, order_index FROM exercises WHERE session_id = ?1 ORDER BY order_index ASC")
    .bind(source.id)
    .all<{ id: string; raw_name: string; order_index: number }>();
  const sourceExerciseIds = sourceExercises.results.map((exercise) => exercise.id);
  const sourceSetsByExerciseId = await loadCloneSourceSets(env, sourceExerciseIds);

  const newSessionId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];
  statements.push(
    env.DB
      .prepare(
        "INSERT INTO sessions (id, upload_id, date, started_at, calories_kcal, duration_min, volume_kg, created_at) VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, ?7)"
      )
      .bind(newSessionId, targetDate, targetStartedAt, source.calories_kcal, source.duration_min, source.volume_kg, nowIso())
  );

  for (const sourceExercise of sourceExercises.results) {
    const newExerciseId = crypto.randomUUID();
    statements.push(
      env.DB
        .prepare("INSERT INTO exercises (id, session_id, raw_name, order_index) VALUES (?1, ?2, ?3, ?4)")
        .bind(newExerciseId, newSessionId, sourceExercise.raw_name, sourceExercise.order_index)
    );
    const sets = sourceSetsByExerciseId.get(sourceExercise.id) ?? [];
    for (const setRow of sets) {
      statements.push(
        env.DB
          .prepare("INSERT INTO sets (id, exercise_id, set_index, weight_kg, reps) VALUES (?1, ?2, ?3, ?4, ?5)")
          .bind(crypto.randomUUID(), newExerciseId, setRow.set_index, setRow.weight_kg, setRow.reps)
      );
    }
  }

  await env.DB.batch(statements);
  return newSessionId;
}

