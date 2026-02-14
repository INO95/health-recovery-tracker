import { describe, expect, it } from "vitest";
import {
  InMemoryRateLimiter,
  resolveClientId,
  resolveRateLimitBucket,
  resolveRateLimitConfig,
  resolveRateLimitMaxRequestsForBucket,
  resolveRateLimitWindowMsForBucket,
} from "../src/rate-limit";
import type { Env } from "../src/types";

describe("rate limit", () => {
  it("blocks after configured limit and reports retry-after", () => {
    const limiter = new InMemoryRateLimiter();
    const base = 1_000;
    const config = {
      clientId: "198.51.100.10",
      bucket: "GET /api/health",
      maxRequests: 2,
      windowMs: 60_000,
    };

    const first = limiter.check({ ...config, nowMs: base });
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);

    const second = limiter.check({ ...config, nowMs: base + 10 });
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);

    const blocked = limiter.check({ ...config, nowMs: base + 100 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("resets window after expiration", () => {
    const limiter = new InMemoryRateLimiter();
    const config = {
      clientId: "203.0.113.11",
      bucket: "GET /api/recovery",
      maxRequests: 1,
      windowMs: 1_000,
    };
    const t0 = 10_000;
    const blockedAt = 10_100;
    const resetAt = 11_500;

    expect(limiter.check({ ...config, nowMs: t0 }).allowed).toBe(true);
    expect(limiter.check({ ...config, nowMs: blockedAt }).allowed).toBe(false);
    expect(limiter.check({ ...config, nowMs: resetAt }).allowed).toBe(true);
  });

  it("resolves client id and bucket from request", () => {
    const req = new Request("https://example.test/api/sessions?limit=5", {
      method: "GET",
      headers: {
        "x-forwarded-for": "198.51.100.20, 10.0.0.1",
      },
    });
    const url = new URL(req.url);

    expect(resolveClientId(req)).toBe("198.51.100.20");
    expect(resolveRateLimitBucket(req, url)).toBe("sessions:read");
  });

  it("groups write endpoints into write bucket", () => {
    const req = new Request("https://example.test/api/sessions/11111111-1111-4111-8111-111111111111/clone", {
      method: "POST",
    });
    const url = new URL(req.url);
    expect(resolveRateLimitBucket(req, url)).toBe("sessions:write");
  });

  it("parses env config with safe defaults", () => {
    const env = {
      DB: {} as unknown,
      UPLOADS: {} as unknown,
      RATE_LIMIT_ENABLED: "0",
      RATE_LIMIT_MAX_PER_MINUTE: "45",
      RATE_LIMIT_WINDOW_SECONDS: "30",
    } as Env;

    const config = resolveRateLimitConfig(env);
    expect(config.enabled).toBe(false);
    expect(config.maxRequests).toBe(45);
    expect(config.windowMs).toBe(30_000);
  });

  it("supports per-bucket max override from env", () => {
    const env = {
      DB: {} as unknown,
      UPLOADS: {} as unknown,
      RATE_LIMIT_MAX_PER_MINUTE: "120",
      RATE_LIMIT_MAX_SESSIONS_READ: "200",
      RATE_LIMIT_MAX_RECOVERY_WRITE: "30",
    } as Env;

    expect(resolveRateLimitMaxRequestsForBucket(env, "sessions:read", 120)).toBe(200);
    expect(resolveRateLimitMaxRequestsForBucket(env, "recovery:write", 120)).toBe(30);
    expect(resolveRateLimitMaxRequestsForBucket(env, "upload:write", 120)).toBe(120);
  });

  it("supports per-bucket window override from env", () => {
    const env = {
      DB: {} as unknown,
      UPLOADS: {} as unknown,
      RATE_LIMIT_WINDOW_SECONDS: "60",
      RATE_LIMIT_WINDOW_SESSIONS_READ: "15",
      RATE_LIMIT_WINDOW_RECOVERY_WRITE: "120",
    } as Env;

    expect(resolveRateLimitWindowMsForBucket(env, "sessions:read", 60_000)).toBe(15_000);
    expect(resolveRateLimitWindowMsForBucket(env, "recovery:write", 60_000)).toBe(120_000);
    expect(resolveRateLimitWindowMsForBucket(env, "upload:write", 60_000)).toBe(60_000);
  });
});
