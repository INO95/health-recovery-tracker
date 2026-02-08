import type { RecoveryResponse, SessionDetail, SessionListItem, UploadResponse } from "../types";

const API_BASE_OVERRIDE_KEY = "health_v2_api_base_url";

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  const envValue = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
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
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`API ${response.status}: ${message || response.statusText}`);
  }
  return (await response.json()) as T;
}

export async function uploadScreenshot(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return request<UploadResponse>("/api/uploads", {
    method: "POST",
    body: formData,
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

export async function fetchRecovery(params: {
  days?: number;
  from?: string;
  to?: string;
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
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return request<RecoveryResponse>(`/api/recovery${suffix}`);
}
