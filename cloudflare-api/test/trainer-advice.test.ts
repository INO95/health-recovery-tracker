import { describe, expect, it } from "vitest";
import { buildTrainerAdvice } from "../src/trainer-advice";

describe("buildTrainerAdvice", () => {
  it("returns rest/train recommendations and timing message", () => {
    const advice = buildTrainerAdvice(
      {
        chest: { name: "Chest", recovery: 86, status: "green", remaining_hours: 0, next_train_at: null },
        legs: {
          name: "Legs",
          recovery: 35,
          status: "red",
          remaining_hours: 52.1,
          next_train_at: "2026-02-11T16:00:00.000Z",
        },
        shoulders: { name: "Shoulders", recovery: 62, status: "yellow", remaining_hours: 12.4, next_train_at: "2026-02-09T12:00:00.000Z" },
      },
      "2026-02-09T20:00:00.000Z"
    );

    expect(advice.recommend_train).toContain("chest");
    expect(advice.recommend_rest).toContain("legs");
    expect(advice.recommend_light).toHaveLength(0);
    expect(advice.message_timing).toContain("하체 완전 회복까지");
  });
});
