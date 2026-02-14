import { isMissingTableError } from "../db-utils";
import { computeRecovery, listRecoverySettings, updateRecoverySetting } from "../recovery";
import { getBodyweightSetting, setBodyweightSetting } from "../repositories/settings";
import type { Env } from "../types";

export type RecoveryQuery = {
  days: number;
  from: string | null;
  to: string | null;
  referenceAt: string | null;
};

export type WorkflowError = {
  status: number;
  detail: string;
  code: string;
};

export function parseRecoveryQuery(url: URL): RecoveryQuery {
  const days = Number.parseInt(url.searchParams.get("days") || "7", 10);
  return {
    days: Number.isNaN(days) ? 7 : Math.max(1, Math.min(30, days)),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    referenceAt: url.searchParams.get("reference_at"),
  };
}

export async function computeRecoveryPayload(env: Env, query: RecoveryQuery): Promise<Record<string, unknown>> {
  const bodyweightKg = await getBodyweightSetting(env);
  return computeRecovery(env.DB, {
    days: query.days,
    from: query.from,
    to: query.to,
    reference_at: query.referenceAt,
    bodyweight_kg: bodyweightKg,
  });
}

export async function readBodyweightSetting(env: Env): Promise<number> {
  return getBodyweightSetting(env);
}

export function parseBodyweightValue(raw: unknown): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 30 || value > 250) {
    return null;
  }
  return value;
}

export async function saveBodyweightSetting(env: Env, value: number): Promise<number | WorkflowError> {
  try {
    return await setBodyweightSetting(env, value);
  } catch (error) {
    if (isMissingTableError(error, "user_settings")) {
      return { status: 500, detail: "schema_not_ready", code: "schema_not_ready" };
    }
    throw error;
  }
}

export async function readRecoverySettings(env: Env): Promise<Record<string, number>> {
  const muscleRows = await env.DB.prepare("SELECT code FROM muscle_groups ORDER BY code ASC").all<{ code: string }>();
  return listRecoverySettings(env.DB, muscleRows.results.map((row) => row.code));
}

export async function saveRecoverySettings(
  env: Env,
  settingsInput: Record<string, number>
): Promise<{ settings: Record<string, number> } | WorkflowError> {
  const entries = Object.entries(settingsInput);
  if (entries.length === 0) {
    return { status: 400, detail: "settings_required", code: "settings_required" };
  }

  const muscleRows = await env.DB.prepare("SELECT code FROM muscle_groups").all<{ code: string }>();
  const knownCodes = new Set(muscleRows.results.map((row) => row.code));

  for (const [muscleCode, restHoursRaw] of entries) {
    if (!knownCodes.has(muscleCode)) {
      return {
        status: 400,
        detail: `unknown_muscle_code:${muscleCode}`,
        code: "unknown_muscle_code",
      };
    }
    const restHours = Number(restHoursRaw);
    if (!Number.isFinite(restHours) || restHours <= 0 || restHours > 240) {
      return {
        status: 400,
        detail: `invalid_rest_hours:${muscleCode}`,
        code: "invalid_rest_hours",
      };
    }
    try {
      await updateRecoverySetting(env.DB, muscleCode, restHours);
    } catch (error) {
      if (isMissingTableError(error, "recovery_settings")) {
        return { status: 500, detail: "schema_not_ready", code: "schema_not_ready" };
      }
      throw error;
    }
  }

  const resolved = await listRecoverySettings(env.DB, Array.from(knownCodes));
  return { settings: resolved };
}
