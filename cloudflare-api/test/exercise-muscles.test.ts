import { describe, expect, it } from "vitest";
import { getBodyweightLoadFactor, getExerciseMuscleMapping, inferEffectiveWeightKg } from "../src/exercise-muscles";

describe("getExerciseMuscleMapping", () => {
  it("maps pull-up variants to back(main) and biceps(sub)", () => {
    const mappedKo = getExerciseMuscleMapping("풀업");
    const mappedEn = getExerciseMuscleMapping("pull up");

    expect(mappedKo).not.toBeNull();
    expect(mappedEn).not.toBeNull();

    const byCode = new Map((mappedKo || []).map((m) => [m.muscle_code, m.weight]));
    expect(byCode.get("back")).toBe(0.7);
    expect(byCode.get("biceps")).toBe(0.3);
  });

  it("returns null for unknown exercise", () => {
    expect(getExerciseMuscleMapping("없는운동명")).toBeNull();
  });

  it("infers effective weight for bodyweight pull-up", () => {
    expect(getBodyweightLoadFactor("풀업")).toBe(1);
    expect(inferEffectiveWeightKg("풀업", null)).toBe(70);
    expect(inferEffectiveWeightKg("풀업", 0)).toBe(70);
    expect(inferEffectiveWeightKg("풀업", 0, 82)).toBe(82);
    expect(inferEffectiveWeightKg("풀업", 10, 82.5)).toBe(92.5);
  });
});
