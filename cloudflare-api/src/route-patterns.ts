export const ROUTE_PATTERNS = {
  sessionDetail: /^\/api\/sessions\/([0-9a-fA-F-]{36})$/,
  sessionClone: /^\/api\/sessions\/([0-9a-fA-F-]{36})\/clone$/,
  aliasDelete: /^\/api\/exercise-aliases\/([0-9a-fA-F-]{36})$/,
} as const;

export function extractRouteParam(pathname: string, pattern: RegExp): string | null {
  const match = pathname.match(pattern);
  if (!match || match.length < 2) {
    return null;
  }
  return match[1];
}

