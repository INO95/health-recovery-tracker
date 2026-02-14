import { isMissingTableError } from "../db-utils";
import { errorResponse, jsonResponse } from "../http";
import { normalizeNameKey } from "../parser";
import { listAliasOverrides } from "../repositories/aliases";
import type { RequestContext, Env } from "../types";

function nowIso(): string {
  return new Date().toISOString();
}

export async function getAliasOverrides(env: Env, ctx: RequestContext): Promise<Response> {
  return jsonResponse(await listAliasOverrides(env), ctx.requestId);
}

export async function createAliasOverride(req: Request, env: Env, ctx: RequestContext): Promise<Response> {
  let payload: { alias_raw?: string; canonical_name?: string };
  try {
    payload = (await req.json()) as { alias_raw?: string; canonical_name?: string };
  } catch {
    return errorResponse(400, "invalid_json", ctx.requestId);
  }

  const aliasRaw = String(payload.alias_raw || "").trim();
  const canonicalName = String(payload.canonical_name || "").trim();
  if (!aliasRaw || !canonicalName) {
    return errorResponse(400, "alias_and_canonical_required", ctx.requestId);
  }

  const aliasKey = normalizeNameKey(aliasRaw);
  const id = crypto.randomUUID();
  try {
    await env.DB
      .prepare(
        `INSERT INTO exercise_alias_overrides (id, alias_raw, alias_key, canonical_name, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(alias_key) DO UPDATE SET canonical_name = excluded.canonical_name, alias_raw = excluded.alias_raw`
      )
      .bind(id, aliasRaw, aliasKey, canonicalName, nowIso())
      .run();
  } catch (error) {
    if (isMissingTableError(error, "exercise_alias_overrides")) {
      return errorResponse(500, "schema_not_ready", ctx.requestId);
    }
    throw error;
  }

  return jsonResponse({ ok: true, alias_raw: aliasRaw, alias_key: aliasKey, canonical_name: canonicalName }, ctx.requestId);
}

export async function deleteAliasOverride(aliasId: string, env: Env, ctx: RequestContext): Promise<Response> {
  try {
    await env.DB.prepare("DELETE FROM exercise_alias_overrides WHERE id = ?1").bind(aliasId).run();
  } catch (error) {
    if (isMissingTableError(error, "exercise_alias_overrides")) {
      return errorResponse(500, "schema_not_ready", ctx.requestId);
    }
    throw error;
  }
  return jsonResponse({ ok: true, deleted_alias_id: aliasId }, ctx.requestId);
}

