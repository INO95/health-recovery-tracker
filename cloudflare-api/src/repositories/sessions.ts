import { buildInClausePlaceholders, groupByExerciseId } from "../db-utils";
import type { Env } from "../types";

export type SessionSetRow = {
  id: string;
  exercise_id: string;
  set_index: number;
  weight_kg: number | null;
  reps: number;
};

export type CloneSetRow = {
  exercise_id: string;
  set_index: number;
  weight_kg: number | null;
  reps: number;
};

export async function loadSessionSets(env: Env, exerciseIds: string[]): Promise<Map<string, SessionSetRow[]>> {
  if (exerciseIds.length === 0) {
    return new Map<string, SessionSetRow[]>();
  }
  const placeholders = buildInClausePlaceholders(exerciseIds.length);
  const rows = await env.DB
    .prepare(
      `SELECT id, exercise_id, set_index, weight_kg, reps
       FROM sets
       WHERE exercise_id IN (${placeholders})
       ORDER BY exercise_id ASC, set_index ASC`
    )
    .bind(...exerciseIds)
    .all<SessionSetRow>();
  return groupByExerciseId(rows.results);
}

export async function loadCloneSourceSets(env: Env, exerciseIds: string[]): Promise<Map<string, CloneSetRow[]>> {
  if (exerciseIds.length === 0) {
    return new Map<string, CloneSetRow[]>();
  }
  const placeholders = buildInClausePlaceholders(exerciseIds.length);
  const rows = await env.DB
    .prepare(
      `SELECT exercise_id, set_index, weight_kg, reps
       FROM sets
       WHERE exercise_id IN (${placeholders})
       ORDER BY exercise_id ASC, set_index ASC`
    )
    .bind(...exerciseIds)
    .all<CloneSetRow>();
  return groupByExerciseId(rows.results);
}
