import type { Env } from "./types";

const DEFAULT_MAX_REQUESTS = 120;
const DEFAULT_WINDOW_SECONDS = 60;
const MAX_TRACKED_KEYS = 5000;

type RateLimitCounter = {
  windowStartMs: number;
  count: number;
};

type CheckInput = {
  clientId: string;
  bucket: string;
  maxRequests: number;
  windowMs: number;
  nowMs?: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSec: number;
  remaining: number;
  limit: number;
};

export type RateLimitConfig = {
  enabled: boolean;
  maxRequests: number;
  windowMs: number;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseToggle(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function clampClientId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "anonymous";
  }
  return trimmed.slice(0, 128);
}

export function resolveRateLimitConfig(env: Env): RateLimitConfig {
  const enabled = parseToggle(env.RATE_LIMIT_ENABLED, true);
  const maxRequests = parsePositiveInt(env.RATE_LIMIT_MAX_PER_MINUTE, DEFAULT_MAX_REQUESTS);
  const windowSeconds = parsePositiveInt(env.RATE_LIMIT_WINDOW_SECONDS, DEFAULT_WINDOW_SECONDS);
  return {
    enabled,
    maxRequests,
    windowMs: windowSeconds * 1000,
  };
}

function bucketToEnvKey(bucket: string): string {
  return `RATE_LIMIT_MAX_${bucket.replace(/:/g, "_").toUpperCase()}`;
}

function bucketToWindowEnvKey(bucket: string): string {
  return `RATE_LIMIT_WINDOW_${bucket.replace(/:/g, "_").toUpperCase()}`;
}

export function resolveRateLimitMaxRequestsForBucket(
  env: Env,
  bucket: string,
  fallbackMaxRequests: number
): number {
  const key = bucketToEnvKey(bucket);
  const value = (env as Record<string, unknown>)[key];
  if (typeof value !== "string") {
    return fallbackMaxRequests;
  }
  return parsePositiveInt(value, fallbackMaxRequests);
}

export function resolveRateLimitWindowMsForBucket(env: Env, bucket: string, fallbackWindowMs: number): number {
  const key = bucketToWindowEnvKey(bucket);
  const value = (env as Record<string, unknown>)[key];
  if (typeof value !== "string") {
    return fallbackWindowMs;
  }
  const fallbackSeconds = Math.max(1, Math.floor(fallbackWindowMs / 1000));
  const seconds = parsePositiveInt(value, fallbackSeconds);
  return seconds * 1000;
}

export function resolveClientId(req: Request): string {
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return clampClientId(cfConnectingIp);
  }

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const [firstHop] = forwardedFor.split(",");
    return clampClientId(firstHop ?? "");
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return clampClientId(realIp);
  }

  return "anonymous";
}

export function resolveRateLimitBucket(req: Request, url: URL): string {
  const method = req.method.toUpperCase();
  const kind = method === "GET" || method === "HEAD" ? "read" : "write";
  const pathname = url.pathname;

  let scope = "misc";
  if (pathname === "/" || pathname === "/api/health") {
    scope = "health";
  } else if (pathname === "/api/uploads" || pathname === "/api/ocr/normalize") {
    scope = "upload";
  } else if (pathname.startsWith("/api/sessions")) {
    scope = "sessions";
  } else if (pathname.startsWith("/api/recovery")) {
    scope = "recovery";
  } else if (pathname.startsWith("/api/bodyweight")) {
    scope = "bodyweight";
  } else if (pathname.startsWith("/api/exercise-aliases")) {
    scope = "exercise_aliases";
  } else if (pathname.startsWith("/api/")) {
    scope = `api:${pathname.slice("/api/".length)}`;
  } else {
    scope = pathname;
  }

  return `${scope}:${kind}`;
}

export class InMemoryRateLimiter {
  private counters = new Map<string, RateLimitCounter>();

  check(input: CheckInput): RateLimitDecision {
    const nowMs = input.nowMs ?? Date.now();
    const maxRequests = Math.max(1, Math.floor(input.maxRequests));
    const windowMs = Math.max(1000, Math.floor(input.windowMs));
    const key = `${input.clientId}::${input.bucket}`;
    const existing = this.counters.get(key);

    if (!existing || nowMs - existing.windowStartMs >= windowMs) {
      this.counters.set(key, {
        windowStartMs: nowMs,
        count: 1,
      });
      this.compact(nowMs, windowMs);
      return {
        allowed: true,
        retryAfterSec: 0,
        remaining: Math.max(0, maxRequests - 1),
        limit: maxRequests,
      };
    }

    if (existing.count < maxRequests) {
      existing.count += 1;
      return {
        allowed: true,
        retryAfterSec: 0,
        remaining: Math.max(0, maxRequests - existing.count),
        limit: maxRequests,
      };
    }

    const retryAfterMs = Math.max(0, existing.windowStartMs + windowMs - nowMs);
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      remaining: 0,
      limit: maxRequests,
    };
  }

  private compact(nowMs: number, windowMs: number): void {
    if (this.counters.size <= MAX_TRACKED_KEYS) {
      return;
    }

    for (const [key, value] of this.counters.entries()) {
      if (nowMs - value.windowStartMs >= windowMs) {
        this.counters.delete(key);
      }
    }
  }
}
