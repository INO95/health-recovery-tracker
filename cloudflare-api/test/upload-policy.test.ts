import { describe, expect, it } from "vitest";
import { shouldRejectOnNeedsReview } from "../src/upload-policy";

describe("shouldRejectOnNeedsReview", () => {
  it("rejects when summary date is missing", () => {
    const reject = shouldRejectOnNeedsReview({
      summary: { date: null },
      exercises: [{ raw_name: "덤벨 플랫 벤치 프레스", sets: [{ weight_kg: 20, reps: 12 }] }],
      meta: { needs_review: true, warnings: ["summary_missing:date"] },
    });
    expect(reject).toBe(true);
  });

  it("rejects when no exercises parsed", () => {
    const reject = shouldRejectOnNeedsReview({
      summary: { date: "2026-02-01" },
      exercises: [],
      meta: { needs_review: true, warnings: ["sets_count_mismatch:foo"] },
    });
    expect(reject).toBe(true);
  });

  it("allows upload when warning-only and core data exists", () => {
    const reject = shouldRejectOnNeedsReview({
      summary: { date: "2026-02-01" },
      exercises: [
        { raw_name: "스미스 머신 클로즈 그립 벤치 프레스", sets: [{ weight_kg: 10, reps: 20 }] },
      ],
      meta: { needs_review: true, warnings: ["sets_count_mismatch:)겨 J a"] },
    });
    expect(reject).toBe(false);
  });
});
