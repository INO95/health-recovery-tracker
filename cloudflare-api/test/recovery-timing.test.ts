import { describe, expect, it } from "vitest";

describe("recovery timing model", () => {
  it("uses date-based session reference (12:00Z) for stable remaining-hour calculations", () => {
    const sessionRef = new Date("2026-02-09T12:00:00.000Z");
    const referenceAt = new Date("2026-02-09T20:00:00.000Z");
    const restHours = 60;

    const nextTrainAt = new Date(sessionRef.getTime() + restHours * 60 * 60 * 1000);
    const remaining = (nextTrainAt.getTime() - referenceAt.getTime()) / (1000 * 60 * 60);

    expect(remaining).toBe(52);
    expect(nextTrainAt.toISOString()).toBe("2026-02-12T00:00:00.000Z");
  });
});
