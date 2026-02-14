import { errorResponse, jsonResponse } from "../http";
import {
  computeRecoveryPayload,
  parseBodyweightValue,
  parseRecoveryQuery,
  readBodyweightSetting,
  readRecoverySettings,
  saveBodyweightSetting,
  saveRecoverySettings,
} from "../services/recovery-workflow";
import type { RequestContext, Env } from "../types";

export async function getRecovery(url: URL, env: Env, ctx: RequestContext): Promise<Response> {
  const query = parseRecoveryQuery(url);
  try {
    const payload = await computeRecoveryPayload(env, query);
    return jsonResponse(payload, ctx.requestId);
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_time_window") {
      return errorResponse(400, "invalid_time_window", ctx.requestId);
    }
    if (error instanceof Error && error.message === "invalid_reference_time") {
      return errorResponse(400, "invalid_reference_time", ctx.requestId);
    }
    return errorResponse(500, "recovery_compute_failed", ctx.requestId);
  }
}

export async function getBodyweight(env: Env, ctx: RequestContext): Promise<Response> {
  return jsonResponse({ bodyweight_kg: await readBodyweightSetting(env) }, ctx.requestId);
}

export async function putBodyweight(req: Request, env: Env, ctx: RequestContext): Promise<Response> {
  let payload: { bodyweight_kg?: number };
  try {
    payload = (await req.json()) as { bodyweight_kg?: number };
  } catch {
    return errorResponse(400, "invalid_json", ctx.requestId);
  }

  const value = parseBodyweightValue(payload.bodyweight_kg);
  if (value == null) {
    return errorResponse(400, "invalid_bodyweight_kg", ctx.requestId);
  }

  const saved = await saveBodyweightSetting(env, value);
  if (typeof saved !== "number") {
    return errorResponse(saved.status, saved.detail, ctx.requestId, saved.code);
  }
  return jsonResponse({ ok: true, bodyweight_kg: saved }, ctx.requestId);
}

export async function getRecoverySettings(env: Env, ctx: RequestContext): Promise<Response> {
  const settings = await readRecoverySettings(env);
  return jsonResponse({ settings }, ctx.requestId);
}

export async function putRecoverySettings(req: Request, env: Env, ctx: RequestContext): Promise<Response> {
  let payload: { settings?: Record<string, number> };
  try {
    payload = (await req.json()) as { settings?: Record<string, number> };
  } catch {
    return errorResponse(400, "invalid_json", ctx.requestId);
  }

  const result = await saveRecoverySettings(env, payload.settings ?? {});
  if ("status" in result) {
    return errorResponse(result.status, result.detail, ctx.requestId, result.code);
  }

  return jsonResponse({ ok: true, settings: result.settings }, ctx.requestId);
}
