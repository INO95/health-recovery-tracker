import { describe, expect, it } from "vitest";
import { normalizeSessionPayload } from "../src/session-mutations";

describe("normalizeSessionPayload", () => {
  it("recomputes volume from exercises when omitted", () => {
    const payload = normalizeSessionPayload({
      date: "2026-02-08",
      started_at: "2026-02-08T09:30:00.000Z",
      calories_kcal: 320,
      duration_min: 60,
      exercises: [
        {
          raw_name: "덤벨 플랫 벤치 프레스",
          sets: [
            { weight_kg: 20, reps: 10 },
            { weight_kg: 20, reps: 10 },
          ],
        },
      ],
    });

    expect(payload.volume_kg).toBe(400);
    expect(payload.started_at).toBe("2026-02-08T09:30:00.000Z");
    expect(payload.exercises[0].sets[0].set_index).toBe(1);
  });

  it("infers bodyweight volume for pull-up when weight is omitted", () => {
    const payload = normalizeSessionPayload({
      date: "2026-02-09",
      exercises: [
        {
          raw_name: "풀업",
          sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }],
        },
      ],
    });

    // 70kg(default bodyweight) * 30 reps
    expect(payload.volume_kg).toBe(2100);
  });

  it("uses bodyweight + added load for weighted pull-up", () => {
    const payload = normalizeSessionPayload(
      {
        date: "2026-02-09",
        exercises: [
          {
            raw_name: "풀업",
            sets: [{ weight_kg: 10, reps: 10 }],
          },
        ],
      },
      { bodyweight_kg: 80 }
    );

    expect(payload.volume_kg).toBe(900);
  });
});
