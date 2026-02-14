import { ApiClientError } from "../api/client";

export function formatClientError(stage: string, error: unknown): string {
  if (error instanceof ApiClientError) {
    const requestIdSuffix = error.requestId ? ` (request_id: ${error.requestId})` : "";
    return `${stage}: ${error.detail} [${error.code}]${requestIdSuffix}`;
  }
  if (error instanceof Error) {
    return `${stage}: ${error.message}`;
  }
  return `${stage}: 알 수 없는 오류가 발생했습니다.`;
}

