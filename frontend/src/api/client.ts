import type {
  ApiErrorResponse,
  BodyweightResponse,
  ExerciseAliasOverride,
  OcrNormalizeResponse,
  RecoverySettingsResponse,
  RecoveryResponse,
  SessionDetail,
  SessionListItem,
  SessionUpdatePayload,
  UploadResponse,
} from "../types";

const API_BASE_OVERRIDE_KEY = "health_v2_api_base_url";

export type ApiRateLimitInfo = {
  limit: number;
  remaining: number;
  windowSec: number;
  status: number;
  path: string;
  updatedAt: number;
};

let lastApiRateLimitInfo: ApiRateLimitInfo | null = null;

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseNonNegativeInt(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const asSeconds = Number(trimmed);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.round(asSeconds * 1000);
  }

  const asDate = Date.parse(trimmed);
  if (Number.isNaN(asDate)) {
    return null;
  }
  return Math.max(0, asDate - Date.now());
}

function captureRateLimitInfo(path: string, response: Response): void {
  const limit = parseNonNegativeInt(response.headers.get("x-ratelimit-limit"));
  const remaining = parseNonNegativeInt(response.headers.get("x-ratelimit-remaining"));
  const windowSec = parseNonNegativeInt(response.headers.get("x-ratelimit-window"));
  if (limit == null || remaining == null || windowSec == null) {
    return;
  }

  lastApiRateLimitInfo = {
    limit,
    remaining,
    windowSec,
    status: response.status,
    path,
    updatedAt: Date.now(),
  };
}

export function getLastApiRateLimitInfo(): ApiRateLimitInfo | null {
  return lastApiRateLimitInfo;
}

export class ApiClientError extends Error {
  status: number;
  detail: string;
  code: string;
  requestId: string | null;
  retryAfterMs: number | null;

  constructor(params: {
    status: number;
    detail: string;
    code?: string;
    requestId?: string | null;
    retryAfterMs?: number | null;
  }) {
    const code = params.code || "api_error";
    super(`[${code}] ${params.detail}`);
    this.name = "ApiClientError";
    this.status = params.status;
    this.detail = params.detail;
    this.code = code;
    this.requestId = params.requestId ?? null;
    this.retryAfterMs = params.retryAfterMs ?? null;
  }
}

export function getApiBaseUrl(): string {
  const envValue = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8787";
  if (typeof window === "undefined") {
    return normalizeBaseUrl(envValue);
  }
  const stored = window.localStorage.getItem(API_BASE_OVERRIDE_KEY);
  return normalizeBaseUrl(stored || envValue);
}

export function setApiBaseUrl(value: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(API_BASE_OVERRIDE_KEY, normalizeBaseUrl(value));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, init);
  captureRateLimitInfo(path, response);
  if (!response.ok) {
    const rawText = await response.text();
    let parsed: ApiErrorResponse | null = null;
    try {
      parsed = rawText ? (JSON.parse(rawText) as ApiErrorResponse) : null;
    } catch {
      parsed = null;
    }

    const detail = parsed?.detail || rawText || response.statusText || "request_failed";
    const code = parsed?.code || "request_failed";
    const requestId = parsed?.request_id || response.headers.get("x-request-id");
    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
    throw new ApiClientError({
      status: response.status,
      detail,
      code,
      requestId,
      retryAfterMs,
    });
  }
  return (await response.json()) as T;
}

export async function uploadScreenshot(params: {
  file: File;
  ocrTextRaw: string;
  ocrEngineVersion?: string;
  parserVersion?: string;
}): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", params.file);
  formData.append("ocr_text_raw", params.ocrTextRaw);
  formData.append("ocr_engine_version", params.ocrEngineVersion || "tesseract-js");
  formData.append("parser_version", params.parserVersion || "cf-parser-v1");

  return request<UploadResponse>("/api/uploads", {
    method: "POST",
    body: formData,
  });
}

export async function normalizeOcrText(rawText: string): Promise<OcrNormalizeResponse> {
  return request<OcrNormalizeResponse>("/api/ocr/normalize", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ raw_text: rawText }),
  });
}

export async function fetchSessions(params: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<SessionListItem[]> {
  const query = new URLSearchParams();
  if (params.from) {
    query.set("from", params.from);
  }
  if (params.to) {
    query.set("to", params.to);
  }
  query.set("limit", String(params.limit ?? 5));
  return request<SessionListItem[]>(`/api/sessions?${query.toString()}`);
}

export async function fetchSessionDetail(id: string): Promise<SessionDetail> {
  return request<SessionDetail>(`/api/sessions/${id}`);
}

export async function updateSession(id: string, payload: SessionUpdatePayload): Promise<SessionDetail> {
  return request<SessionDetail>(`/api/sessions/${id}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function deleteSession(id: string): Promise<{ ok: boolean; deleted_session_id: string }> {
  return request<{ ok: boolean; deleted_session_id: string }>(`/api/sessions/${id}`, {
    method: "DELETE",
  });
}

export async function resetSessions(): Promise<{ ok: boolean; deleted_sessions: number; deleted_uploads: number }> {
  return request<{ ok: boolean; deleted_sessions: number; deleted_uploads: number }>("/api/sessions/reset", {
    method: "POST",
  });
}

export async function cloneSession(id: string, date?: string): Promise<SessionDetail> {
  return request<SessionDetail>(`/api/sessions/${id}/clone`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ date }),
  });
}

export async function fetchExerciseAliases(): Promise<ExerciseAliasOverride[]> {
  return request<ExerciseAliasOverride[]>("/api/exercise-aliases");
}

export async function createExerciseAlias(payload: {
  alias_raw: string;
  canonical_name: string;
}): Promise<{ ok: boolean; alias_raw: string; alias_key: string; canonical_name: string }> {
  return request<{ ok: boolean; alias_raw: string; alias_key: string; canonical_name: string }>("/api/exercise-aliases", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function deleteExerciseAlias(id: string): Promise<{ ok: boolean; deleted_alias_id: string }> {
  return request<{ ok: boolean; deleted_alias_id: string }>(`/api/exercise-aliases/${id}`, {
    method: "DELETE",
  });
}

export async function fetchRecovery(params: {
  days?: number;
  from?: string;
  to?: string;
  referenceAt?: string;
} = {}): Promise<RecoveryResponse> {
  const query = new URLSearchParams();
  if (params.days != null) {
    query.set("days", String(params.days));
  }
  if (params.from) {
    query.set("from", params.from);
  }
  if (params.to) {
    query.set("to", params.to);
  }
  if (params.referenceAt) {
    query.set("reference_at", params.referenceAt);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return request<RecoveryResponse>(`/api/recovery${suffix}`);
}

export async function fetchRecoverySettings(): Promise<RecoverySettingsResponse> {
  return request<RecoverySettingsResponse>("/api/recovery/settings");
}

export async function updateRecoverySettings(settings: Record<string, number>): Promise<RecoverySettingsResponse & { ok: boolean }> {
  return request<RecoverySettingsResponse & { ok: boolean }>("/api/recovery/settings", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ settings }),
  });
}

export async function fetchBodyweight(): Promise<BodyweightResponse> {
  return request<BodyweightResponse>("/api/bodyweight");
}

export async function updateBodyweight(bodyweightKg: number): Promise<BodyweightResponse & { ok: boolean }> {
  return request<BodyweightResponse & { ok: boolean }>("/api/bodyweight", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ bodyweight_kg: bodyweightKg }),
  });
}
