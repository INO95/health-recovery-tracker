import { createAliasOverride, deleteAliasOverride, getAliasOverrides } from "./handlers/aliases";
import { getBodyweight, getRecovery, getRecoverySettings, putBodyweight, putRecoverySettings } from "./handlers/recovery";
import {
  cloneSession,
  deleteSession,
  getSessionDetail,
  listSessions,
  resetSessions,
  updateSession,
} from "./handlers/sessions";
import { createUpload, normalizeOcr } from "./handlers/uploads";
import { createRequestId, errorResponse, jsonResponse, optionsResponse } from "./http";
import {
  InMemoryRateLimiter,
  type RateLimitDecision,
  resolveClientId,
  resolveRateLimitBucket,
  resolveRateLimitConfig,
  resolveRateLimitMaxRequestsForBucket,
  resolveRateLimitWindowMsForBucket,
} from "./rate-limit";
import { ROUTE_PATTERNS } from "./route-patterns";
import type { Env, RequestContext } from "./types";

type RouteInput = {
  req: Request;
  env: Env;
  url: URL;
  ctx: RequestContext;
};

type StaticRoute = {
  method: string;
  path: string;
  handler: (input: RouteInput) => Promise<Response> | Response;
};

type DynamicRoute = {
  method: string;
  pattern: RegExp;
  handler: (input: RouteInput, match: RegExpMatchArray) => Promise<Response> | Response;
};

const STATIC_ROUTES: StaticRoute[] = [
  {
    method: "GET",
    path: "/",
    handler: ({ ctx }) =>
      jsonResponse(
        {
          service: "health-v2-api",
          status: "ok",
          health: "/api/health",
        },
        ctx.requestId
      ),
  },
  {
    method: "GET",
    path: "/api/health",
    handler: ({ ctx }) => jsonResponse({ status: "ok" }, ctx.requestId),
  },
  {
    method: "POST",
    path: "/api/uploads",
    handler: ({ req, env, ctx }) => createUpload(req, env, ctx),
  },
  {
    method: "POST",
    path: "/api/ocr/normalize",
    handler: ({ req, env, ctx }) => normalizeOcr(req, env, ctx),
  },
  {
    method: "GET",
    path: "/api/sessions",
    handler: ({ url, env, ctx }) => listSessions(url, env, ctx),
  },
  {
    method: "POST",
    path: "/api/sessions/reset",
    handler: ({ env, ctx }) => resetSessions(env, ctx),
  },
  {
    method: "GET",
    path: "/api/exercise-aliases",
    handler: ({ env, ctx }) => getAliasOverrides(env, ctx),
  },
  {
    method: "POST",
    path: "/api/exercise-aliases",
    handler: ({ req, env, ctx }) => createAliasOverride(req, env, ctx),
  },
  {
    method: "GET",
    path: "/api/recovery",
    handler: ({ url, env, ctx }) => getRecovery(url, env, ctx),
  },
  {
    method: "GET",
    path: "/api/recovery/settings",
    handler: ({ env, ctx }) => getRecoverySettings(env, ctx),
  },
  {
    method: "PUT",
    path: "/api/recovery/settings",
    handler: ({ req, env, ctx }) => putRecoverySettings(req, env, ctx),
  },
  {
    method: "GET",
    path: "/api/bodyweight",
    handler: ({ env, ctx }) => getBodyweight(env, ctx),
  },
  {
    method: "PUT",
    path: "/api/bodyweight",
    handler: ({ req, env, ctx }) => putBodyweight(req, env, ctx),
  },
];

const DYNAMIC_ROUTES: DynamicRoute[] = [
  {
    method: "GET",
    pattern: ROUTE_PATTERNS.sessionDetail,
    handler: ({ env, ctx }, match) => getSessionDetail(match[1], env, ctx),
  },
  {
    method: "PATCH",
    pattern: ROUTE_PATTERNS.sessionDetail,
    handler: ({ req, env, ctx }, match) => updateSession(req, match[1], env, ctx),
  },
  {
    method: "DELETE",
    pattern: ROUTE_PATTERNS.sessionDetail,
    handler: ({ env, ctx }, match) => deleteSession(match[1], env, ctx),
  },
  {
    method: "POST",
    pattern: ROUTE_PATTERNS.sessionClone,
    handler: ({ req, env, ctx }, match) => cloneSession(req, match[1], env, ctx),
  },
  {
    method: "DELETE",
    pattern: ROUTE_PATTERNS.aliasDelete,
    handler: ({ env, ctx }, match) => deleteAliasOverride(match[1], env, ctx),
  },
];

const rateLimiter = new InMemoryRateLimiter();

function buildRateLimitHeaders(decision: RateLimitDecision, windowMs: number): Record<string, string> {
  return {
    "x-ratelimit-limit": String(decision.limit),
    "x-ratelimit-remaining": String(decision.remaining),
    "x-ratelimit-window": String(Math.max(1, Math.ceil(windowMs / 1000))),
  };
}

function withExtraHeaders(response: Response, extraHeaders?: Record<string, string>): Response {
  if (!extraHeaders || Object.keys(extraHeaders).length === 0) {
    return response;
  }

  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(extraHeaders)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function dispatchRoute(input: RouteInput): Promise<Response> {
  const { req, url, ctx } = input;

  for (const route of STATIC_ROUTES) {
    if (req.method === route.method && url.pathname === route.path) {
      return await route.handler(input);
    }
  }

  for (const route of DYNAMIC_ROUTES) {
    if (req.method !== route.method) continue;
    const match = url.pathname.match(route.pattern);
    if (!match) continue;
    return await route.handler(input, match);
  }

  return errorResponse(404, "not_found", ctx.requestId);
}

function logRequestCompleted(req: Request, url: URL, ctx: RequestContext, res: Response, startedAtMs: number): void {
  console.log(
    JSON.stringify({
      level: "info",
      message: "request_completed",
      request_id: ctx.requestId,
      method: req.method,
      path: url.pathname,
      status: res.status,
      duration_ms: Date.now() - startedAtMs,
    })
  );
}

export async function handleRequest(req: Request, env: Env): Promise<Response> {
  const ctx: RequestContext = { requestId: createRequestId(req) };
  const url = new URL(req.url);
  const startedAtMs = Date.now();
  let rateLimitHeaders: Record<string, string> | undefined;

  if (req.method === "OPTIONS") {
    const res = optionsResponse(ctx.requestId);
    logRequestCompleted(req, url, ctx, res, startedAtMs);
    return res;
  }

  const rateLimit = resolveRateLimitConfig(env);
  if (rateLimit.enabled) {
    const clientId = resolveClientId(req);
    const bucket = resolveRateLimitBucket(req, url);
    const maxRequestsForBucket = resolveRateLimitMaxRequestsForBucket(env, bucket, rateLimit.maxRequests);
    const windowMsForBucket = resolveRateLimitWindowMsForBucket(env, bucket, rateLimit.windowMs);
    const decision = rateLimiter.check({
      clientId,
      bucket,
      maxRequests: maxRequestsForBucket,
      windowMs: windowMsForBucket,
    });

    rateLimitHeaders = buildRateLimitHeaders(decision, windowMsForBucket);

    if (!decision.allowed) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "rate_limited",
          request_id: ctx.requestId,
          method: req.method,
          path: url.pathname,
          client_id: clientId,
          bucket,
          retry_after_sec: decision.retryAfterSec,
          limit: decision.limit,
          window_sec: Math.max(1, Math.ceil(windowMsForBucket / 1000)),
        })
      );
      const res = errorResponse(429, "rate_limited", ctx.requestId, "rate_limited", {
        ...rateLimitHeaders,
        "retry-after": String(decision.retryAfterSec),
      });
      logRequestCompleted(req, url, ctx, res, startedAtMs);
      return res;
    }
  }

  let response: Response;
  try {
    response = await dispatchRoute({ req, env, url, ctx });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "unhandled_exception",
        request_id: ctx.requestId,
        method: req.method,
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    response = errorResponse(500, "internal_error", ctx.requestId);
  }

  const finalResponse = withExtraHeaders(response, rateLimitHeaders);
  logRequestCompleted(req, url, ctx, finalResponse, startedAtMs);
  return finalResponse;
}
