import { describe, expect, it } from "vitest";
import { extractRouteParam, ROUTE_PATTERNS } from "../src/route-patterns";

describe("route patterns", () => {
  it("matches valid session detail path and extracts id", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const value = extractRouteParam(`/api/sessions/${id}`, ROUTE_PATTERNS.sessionDetail);
    expect(value).toBe(id);
  });

  it("matches valid clone path and extracts id", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const value = extractRouteParam(`/api/sessions/${id}/clone`, ROUTE_PATTERNS.sessionClone);
    expect(value).toBe(id);
  });

  it("matches valid alias delete path and extracts id", () => {
    const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const value = extractRouteParam(`/api/exercise-aliases/${id}`, ROUTE_PATTERNS.aliasDelete);
    expect(value).toBe(id);
  });

  it("rejects malformed or unrelated paths", () => {
    expect(extractRouteParam("/api/sessions/not-a-uuid", ROUTE_PATTERNS.sessionDetail)).toBeNull();
    expect(extractRouteParam("/api/sessions/123/clone", ROUTE_PATTERNS.sessionClone)).toBeNull();
    expect(extractRouteParam("/api/exercise-aliases", ROUTE_PATTERNS.aliasDelete)).toBeNull();
  });
});

