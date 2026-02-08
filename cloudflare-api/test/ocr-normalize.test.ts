import { describe, expect, it } from "vitest";
import { normalizeOcrText } from "../src/ocr-normalize";

describe("normalizeOcrText", () => {
  it("builds readable normalized OCR text", () => {
    const raw = `
2026.02.07
238 KCAL 54 min 7402 kg
바벨 플랫 벤치 프레스
20 40 60 60
12X 10X 5X 5X
`;

    const result = normalizeOcrText(raw);

    expect(result.normalized_text).toContain("[SUMMARY]");
    expect(result.normalized_text).toContain("weight_unit=kg");
    expect(result.normalized_text).toContain("date=2026-02-07");
    expect(result.normalized_text).toContain("[EXERCISE 1] 바벨 플랫 벤치 프레스");
    expect(result.normalized_text).toContain("set1: weight=20kg reps=12");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("returns warnings when summary info is missing", () => {
    const raw = `
풀 업
Total Reps: 30
10 10 10
`;

    const result = normalizeOcrText(raw);
    expect(result.needs_review).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("includes split and canonical exercise names for chest-triceps routine", () => {
    const raw = `
가슴 삼두
2026.02.01
185 KCAL 46 min 5268 kg
4 EXERCISES 15 sets 204 reps 114 kg/min
덤벨 인클라인 벤치 프레스
17.5 20 20 20
12X 12X 12X 12X
`;

    const result = normalizeOcrText(raw);
    expect(result.normalized_text).toContain("split=가슴/삼두");
    expect(result.normalized_text).toContain("[EXERCISE 1] 덤벨 인클라인 벤치 프레스");
  });

  it("filters noisy OCR lines and keeps chest-triceps exercises", () => {
    const raw = `
가슴 삼두
2026.02.01
AN ) 「 [그
네/ y \\ a\\ 는
49200 18510 46min 52681
WORKOUT CALORIES § DURATION VOLUME
4 15sets 204 eps 114 kg/min
EXERCISES SETS REPS INTENSITY
라잉 덤벨 풀오버
MAX Weight: 10kg | 1RM: 1418 }
8, "Oa
| 4 Pr
12X 12X 12X
덤벨 플랫 벤치 프레스 Top 30%
MAX Weight: 20kg | 1RM: 28kg
12X 12X 12X 12X 12X fs
덤벨 인클라인 벤치 프레스 Top 27%
MAX Weight: 20kg | 1RM: 28kg &
@
ys
175 20 20 20 ^
12X 12X 12X 12X
스미스 머신 클로즈 그립 벤치 프레스
MAX Weight: 20kg | 1RM: 33kg
ㅣ ai
015 20 더
20X 20X 20X +
`;

    const result = normalizeOcrText(raw);
    expect(result.normalized_text).toContain("split=가슴/삼두");
    expect(result.normalized_text).toContain("date=2026-02-01");
    expect(result.normalized_text).toContain("calories_kcal=185");
    expect(result.normalized_text).toContain("duration_min=46");
    expect(result.normalized_text).toContain("volume_kg=5268");
    expect(result.normalized_text).toContain("[EXERCISE 1] 라잉 덤벨 풀오버");
    expect(result.normalized_text).toContain("[EXERCISE 2] 덤벨 플랫 벤치 프레스");
    expect(result.normalized_text).toContain("[EXERCISE 3] 덤벨 인클라인 벤치 프레스");
    expect(result.normalized_text).toContain("[EXERCISE 4] 스미스 머신 클로즈 그립 벤치 프레스");
    expect(result.normalized_text).toContain("set1: weight=10kg reps=20");
    expect(result.normalized_text).toContain("set2: weight=15kg reps=20");
    expect(result.normalized_text).toContain("set3: weight=20kg reps=20");
    expect(result.normalized_text).not.toContain("[EXERCISE 1] ys");
  });
});
