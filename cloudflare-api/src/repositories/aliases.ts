import { isMissingTableError } from "../db-utils";
import { normalizeNameKey, parseFleekOcrV1 } from "../parser";
import type { Env } from "../types";

export type AliasOverrideRow = {
  id: string;
  alias_raw: string;
  alias_key: string;
  canonical_name: string;
  created_at: string;
};

export async function listAliasOverrides(env: Env): Promise<AliasOverrideRow[]> {
  try {
    const rows = await env.DB
      .prepare(
        "SELECT id, alias_raw, alias_key, canonical_name, created_at FROM exercise_alias_overrides ORDER BY created_at DESC"
      )
      .all<AliasOverrideRow>();
    return rows.results;
  } catch (error) {
    if (isMissingTableError(error, "exercise_alias_overrides")) {
      return [];
    }
    throw error;
  }
}

export function applyAliasOverrides(
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

