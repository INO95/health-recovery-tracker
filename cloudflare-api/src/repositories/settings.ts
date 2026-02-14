import { isMissingTableError } from "../db-utils";
import type { Env } from "../types";

function nowIso(): string {
  return new Date().toISOString();
}

export async function getBodyweightSetting(env: Env): Promise<number> {
  try {
    const row = await env.DB
      .prepare("SELECT value FROM user_settings WHERE key = 'bodyweight_kg'")
      .first<{ value: string }>();
    if (!row) {
      return 70;
    }
    const parsed = Number(row.value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 70;
  } catch (error) {
    if (isMissingTableError(error, "user_settings")) {
      return 70;
    }
    throw error;
  }
}

export async function setBodyweightSetting(env: Env, value: number): Promise<number> {
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

