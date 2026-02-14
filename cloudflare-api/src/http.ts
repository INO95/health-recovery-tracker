const BASE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,x-request-id",
  "access-control-expose-headers":
    "x-request-id,retry-after,x-ratelimit-limit,x-ratelimit-remaining,x-ratelimit-window",
} as const;

type ErrorEnvelope = {
  detail: string;
  code: string;
  request_id: string;
};

type ExtraHeaders = Record<string, string>;

export function createRequestId(req: Request): string {
  const incoming = req.headers.get("x-request-id")?.trim();
  if (incoming && incoming.length <= 128) {
    return incoming;
  }
  return crypto.randomUUID();
}

function withRequestIdHeaders(requestId: string, extraHeaders?: ExtraHeaders): Headers {
  const headers = new Headers(BASE_HEADERS);
  headers.set("x-request-id", requestId);
  if (extraHeaders) {
    for (const [headerName, headerValue] of Object.entries(extraHeaders)) {
      headers.set(headerName, headerValue);
    }
  }
  return headers;
}

export function jsonResponse(data: unknown, requestId: string, status = 200, extraHeaders?: ExtraHeaders): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: withRequestIdHeaders(requestId, extraHeaders),
  });
}

export function errorResponse(
  status: number,
  detail: string,
  requestId: string,
  code = detail,
  extraHeaders?: ExtraHeaders
): Response {
  const payload: ErrorEnvelope = {
    detail,
    code,
    request_id: requestId,
  };
  return jsonResponse(payload, requestId, status, extraHeaders);
}

export function optionsResponse(requestId: string): Response {
  return new Response(null, {
    status: 204,
    headers: withRequestIdHeaders(requestId),
  });
}
