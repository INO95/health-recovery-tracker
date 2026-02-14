import { errorResponse, jsonResponse } from "../http";
import { normalizeParsedResult } from "../ocr-normalize";
import { parseFleekOcrV1 } from "../parser";
import { applyAliasOverrides, listAliasOverrides } from "../repositories/aliases";
import { persistUploadWorkflow } from "../services/upload-workflow";
import type { RequestContext, Env } from "../types";

function nowIso(): string {
  return new Date().toISOString();
}

function fileExtension(filename: string): string {
  const i = filename.lastIndexOf(".");
  if (i < 0) return "";
  return filename.slice(i).toLowerCase();
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function createUpload(req: Request, env: Env, ctx: RequestContext): Promise<Response> {
  const formData = await req.formData();
  const file = formData.get("file");
  const parserVersion = String(formData.get("parser_version") || "cf-parser-v1");
  const ocrEngineVersion = String(formData.get("ocr_engine_version") || "tesseract-js");
  const ocrTextRaw = String(formData.get("ocr_text_raw") || "").trim();

  if (!(file instanceof File)) {
    return errorResponse(400, "file_required", ctx.requestId);
  }
  if (!file.name) {
    return errorResponse(400, "filename_required", ctx.requestId);
  }

  const uploadId = crypto.randomUUID();
  const key = `uploads/${uploadId}${fileExtension(file.name) || ".bin"}`;
  const createdAt = nowIso();

  const fileBuffer = await file.arrayBuffer();
  await env.UPLOADS.put(key, fileBuffer, {
    httpMetadata: {
      contentType: file.type || "application/octet-stream",
    },
    customMetadata: {
      originalFilename: sanitizeFilename(file.name),
    },
  });

  let parseWarnings: string[] = [];
  try {
    const result = await persistUploadWorkflow(env, {
      uploadId,
      filename: file.name,
      contentType: file.type || null,
      sizeBytes: file.size,
      storagePath: key,
      parserVersion,
      ocrEngineVersion,
      ocrTextRaw,
      createdAt,
    });
    parseWarnings = result.parseWarnings;
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "upload_transaction_failed",
        request_id: ctx.requestId,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    await env.UPLOADS.delete(key);
    return errorResponse(500, "upload_persist_failed", ctx.requestId);
  }

  const row = await env.DB.prepare("SELECT * FROM uploads WHERE id = ?1").bind(uploadId).first<Record<string, unknown>>();
  return jsonResponse({ ...row, parse_warnings: parseWarnings }, ctx.requestId, 201);
}

export async function normalizeOcr(req: Request, env: Env, ctx: RequestContext): Promise<Response> {
  let payload: { raw_text?: string };
  try {
    payload = (await req.json()) as { raw_text?: string };
  } catch {
    return errorResponse(400, "invalid_json", ctx.requestId);
  }

  const rawText = String(payload.raw_text || "").trim();
  if (!rawText) {
    return errorResponse(400, "raw_text_required", ctx.requestId);
  }

  const aliasRows = await listAliasOverrides(env);
  const parsed = applyAliasOverrides(parseFleekOcrV1(rawText), aliasRows);
  return jsonResponse(normalizeParsedResult(parsed, rawText), ctx.requestId);
}
