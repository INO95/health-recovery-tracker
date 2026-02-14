import type { ApiRateLimitInfo } from "../api/client";

type RateLimitNoticeOptions = {
  pathPrefix?: string;
  minRemaining?: number;
  minRemainingRatio?: number;
  maxAgeMs?: number;
};

type RateLimitCooldownOptions = {
  pathPrefix?: string;
  maxAgeMs?: number;
  minRemainingForCooldown?: number;
};

function matchesPathPrefix(info: ApiRateLimitInfo, pathPrefix?: string): boolean {
  if (!pathPrefix) {
    return true;
  }
  return info.path.startsWith(pathPrefix);
}

function isFresh(info: ApiRateLimitInfo, maxAgeMs: number): boolean {
  return Date.now() - info.updatedAt <= maxAgeMs;
}

export function buildRateLimitNotice(
  info: ApiRateLimitInfo | null,
  options: RateLimitNoticeOptions = {}
): string {
  if (!info || info.limit <= 0) {
    return "";
  }

  const pathPrefix = options.pathPrefix;
  if (!matchesPathPrefix(info, pathPrefix)) {
    return "";
  }

  const maxAgeMs = Math.max(0, options.maxAgeMs ?? 120_000);
  if (!isFresh(info, maxAgeMs)) {
    return "";
  }

  const minRemaining = Math.max(0, options.minRemaining ?? 5);
  const minRemainingRatio = Math.max(0, Math.min(1, options.minRemainingRatio ?? 0.1));
  const remainingRatio = info.remaining / info.limit;

  if (info.remaining > minRemaining && remainingRatio > minRemainingRatio) {
    return "";
  }

  return `요청 한도가 낮습니다. 남은 요청 ${info.remaining}/${info.limit} (약 ${info.windowSec}초 윈도우).`;
}

export function getRateLimitCooldownMs(
  info: ApiRateLimitInfo | null,
  options: RateLimitCooldownOptions = {}
): number {
  if (!info || info.limit <= 0) {
    return 0;
  }

  const pathPrefix = options.pathPrefix;
  if (!matchesPathPrefix(info, pathPrefix)) {
    return 0;
  }

  const maxAgeMs = Math.max(0, options.maxAgeMs ?? 120_000);
  if (!isFresh(info, maxAgeMs)) {
    return 0;
  }

  const minRemainingForCooldown = Math.max(0, options.minRemainingForCooldown ?? 0);
  if (info.remaining > minRemainingForCooldown) {
    return 0;
  }

  return Math.max(0, info.windowSec * 1000);
}
