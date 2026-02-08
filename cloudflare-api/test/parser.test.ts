import { describe, expect, it } from "vitest";
import { parseFleekOcrV1 } from "../src/parser";

const FIXTURE_TEXT = `
가슴 이두
2026.02.07
493rd 238 KCAL 54 min 7402 kg
6 EXERCISES 22 sets 254 reps 137 kg/min

바벨 플랫 벤치 프레스
MAX Weight: 60kg | 1RM: 81kg
20 40 60 60
12X 10X 5X 5X
Top 34%

풀 업
Total Reps: 45
15 15 15
Top 12%
`;

describe("parseFleekOcrV1", () => {
  it("extracts summary and exercises", () => {
    const parsed = parseFleekOcrV1(FIXTURE_TEXT);
    expect(parsed.summary.date).toBe("2026-02-07");
    expect(parsed.summary.calories_kcal).toBe(238);
    expect(parsed.summary.duration_min).toBe(54);
    expect(parsed.exercises.length).toBeGreaterThan(0);

    const pullUp = parsed.exercises.find((item) => item.raw_name === "풀 업");
    expect(pullUp).toBeTruthy();
    expect(pullUp?.sets.map((set) => set.reps)).toEqual([15, 15, 15]);
  });

  it("marks needs_review on set count mismatch", () => {
    const parsed = parseFleekOcrV1(`
2026.02.07
200 KCAL 40 min 3000 kg
3 EXERCISES 10 sets 100 reps 75 kg/min
스쿼트
20 40 60
12X 10X
`);
    expect(parsed.meta.needs_review).toBe(true);
    expect(parsed.meta.warnings.some((warning) => warning.includes("mismatch"))).toBe(true);
  });

  it("parses chest-triceps routine screenshot style text", () => {
    const parsed = parseFleekOcrV1(`
가슴 삼두
2026.02.01
185 KCAL 46 min 5268 kg
4 EXERCISES 15 sets 204 reps 114 kg/min

라잉 덤벨 풀오버
MAX Weight: 10kg | 1RM: 14kg
6 8 10
12X 12X 12X

덤벨 플랫 벤치 프레스
MAX Weight: 20kg | 1RM: 28kg
15 17.5 20 20 20
12X 12X 12X 12X 12X

덤벨 인클라인 벤치 프레스
MAX Weight: 20kg | 1RM: 28kg
17.5 20 20 20
12X 12X 12X 12X

스미스 머신 클로즈 그립 벤치 프레스
MAX Weight: 20kg | 1RM: 33kg
10 15 20
20X 20X 20X
`);

    expect(parsed.summary.date).toBe("2026-02-01");
    expect(parsed.summary.volume_kg).toBe(5268);
    expect(parsed.exercises.length).toBe(4);

    const names = parsed.exercises.map((exercise) => exercise.raw_name);
    expect(names).toEqual([
      "라잉 덤벨 풀오버",
      "덤벨 플랫 벤치 프레스",
      "덤벨 인클라인 벤치 프레스",
      "스미스 머신 클로즈 그립 벤치 프레스",
    ]);

    expect(parsed.exercises[0].sets).toHaveLength(3);
    expect(parsed.exercises[1].sets).toHaveLength(5);
    expect(parsed.exercises[2].sets).toHaveLength(4);
    expect(parsed.exercises[3].sets).toHaveLength(3);

    expect(parsed.exercises[1].sets[1]).toEqual({ weight_kg: 17.5, reps: 12 });
    expect(parsed.exercises[3].sets[0]).toEqual({ weight_kg: 10, reps: 20 });
  });

  it("parses AI-normalized text format for upload pipeline", () => {
    const parsed = parseFleekOcrV1(`
[SUMMARY]
split=가슴/삼두
weight_unit=kg
date=2026-02-01
calories_kcal=185
duration_min=46
volume_kg=5268
exercises_count=4
sets_total=15
reps_total=204
intensity_kg_per_min=114

[EXERCISE 1] 라잉 덤벨 풀오버
set1: weight=6kg reps=12
set2: weight=8kg reps=12
set3: weight=10kg reps=12

[EXERCISE 2] 덤벨 플랫 벤치 프레스
set1: weight=15kg reps=12
set2: weight=17.5kg reps=12
set3: weight=20kg reps=12
set4: weight=20kg reps=12
set5: weight=20kg reps=12

[EXERCISE 3] 덤벨 인클라인 벤치 프레스
set1: weight=17.5kg reps=12
set2: weight=20kg reps=12
set3: weight=20kg reps=12
set4: weight=20kg reps=12

[EXERCISE 4] 스미스 머신 클로즈 그립 벤치 프레스
set1: weight=10kg reps=20
set2: weight=15kg reps=20
set3: weight=20kg reps=20

[META]
confidence=0.92
needs_review=true
warnings=sets_count_mismatch:)겨 J a
`);

    expect(parsed.summary.date).toBe("2026-02-01");
    expect(parsed.summary.calories_kcal).toBe(185);
    expect(parsed.summary.duration_min).toBe(46);
    expect(parsed.summary.volume_kg).toBe(5268);
    expect(parsed.exercises.length).toBe(4);
    expect(parsed.exercises[3].raw_name).toBe("스미스 머신 클로즈 그립 벤치 프레스");
    expect(parsed.exercises[3].sets).toEqual([
      { weight_kg: 10, reps: 20 },
      { weight_kg: 15, reps: 20 },
      { weight_kg: 20, reps: 20 },
    ]);
    expect(parsed.meta.needs_review).toBe(true);
    expect(parsed.meta.warnings).toContain("sets_count_mismatch:)겨 J a");
    expect(parsed.meta.warnings.some((w) => w.startsWith("summary_missing"))).toBe(false);
  });

  it("parses pull-up reps-only line with noisy suffix and normalizes duration from metric row", () => {
    const parsed = parseFleekOcrV1(`
February 7, Evening Workout
2026.02.07
493 23841 5401 7402kg
WORKOUT CALORIES DURATION VOLUME
4 16 sets 185 reps 136 kg/min
EXERCISES SETS REPS INTENSITY
풀업 ㄱ
Total Reps: 45X
덤벨 인클라인 벤치 프레스
15 20 22.5 22.5 22.5
12X 12X 12X 12X 12X
`);

    expect(parsed.summary.date).toBe("2026-02-07");
    expect(parsed.summary.calories_kcal).toBe(238);
    expect(parsed.summary.duration_min).toBe(54);
    expect(parsed.summary.volume_kg).toBe(7402);

    const pullup = parsed.exercises.find((exercise) => exercise.raw_name === "풀 업");
    expect(pullup).toBeTruthy();
    expect(pullup?.sets).toHaveLength(3);
    expect(pullup?.sets.map((setRow) => setRow.reps)).toEqual([15, 15, 15]);
    expect(pullup?.sets.every((setRow) => setRow.weight_kg == null)).toBe(true);
  });
});
