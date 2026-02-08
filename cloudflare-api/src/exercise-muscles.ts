import { EXERCISE_NAME_ALIASES } from "./exercise-aliases";
import { normalizeNameKey } from "./parser";

export type MuscleWeight = { muscle_code: string; weight: number };
export const DEFAULT_BODYWEIGHT_KG = 70;

const CANONICAL_MUSCLE_MAP: Record<string, MuscleWeight[]> = {
  "바벨 플랫 벤치 프레스": [
    { muscle_code: "chest", weight: 0.6 },
    { muscle_code: "triceps", weight: 0.25 },
    { muscle_code: "shoulders", weight: 0.15 },
  ],
  "덤벨 플랫 벤치 프레스": [
    { muscle_code: "chest", weight: 0.6 },
    { muscle_code: "triceps", weight: 0.25 },
    { muscle_code: "shoulders", weight: 0.15 },
  ],
  "덤벨 인클라인 벤치 프레스": [
    { muscle_code: "chest", weight: 0.5 },
    { muscle_code: "shoulders", weight: 0.3 },
    { muscle_code: "triceps", weight: 0.2 },
  ],
  "스미스 머신 클로즈 그립 벤치 프레스": [
    { muscle_code: "triceps", weight: 0.6 },
    { muscle_code: "chest", weight: 0.25 },
    { muscle_code: "shoulders", weight: 0.15 },
  ],
  "라잉 덤벨 풀오버": [
    { muscle_code: "back", weight: 0.5 },
    { muscle_code: "chest", weight: 0.3 },
    { muscle_code: "core", weight: 0.2 },
  ],

  "풀 업": [
    { muscle_code: "back", weight: 0.7 },
    { muscle_code: "biceps", weight: 0.3 },
  ],
  "랫 풀다운": [
    { muscle_code: "back", weight: 0.75 },
    { muscle_code: "biceps", weight: 0.25 },
  ],
  "바벨 로우": [
    { muscle_code: "back", weight: 0.75 },
    { muscle_code: "biceps", weight: 0.2 },
    { muscle_code: "core", weight: 0.05 },
  ],
  "시티드 케이블 로우": [
    { muscle_code: "back", weight: 0.75 },
    { muscle_code: "biceps", weight: 0.25 },
  ],
  데드리프트: [
    { muscle_code: "legs", weight: 0.45 },
    { muscle_code: "back", weight: 0.3 },
    { muscle_code: "core", weight: 0.25 },
  ],
  "루마니안 데드리프트": [
    { muscle_code: "legs", weight: 0.6 },
    { muscle_code: "back", weight: 0.2 },
    { muscle_code: "core", weight: 0.2 },
  ],

  스쿼트: [
    { muscle_code: "legs", weight: 0.8 },
    { muscle_code: "core", weight: 0.2 },
  ],
  "레그 프레스": [{ muscle_code: "legs", weight: 1.0 }],
  "레그 익스텐션": [{ muscle_code: "legs", weight: 1.0 }],
  "레그 컬": [{ muscle_code: "legs", weight: 1.0 }],
  런지: [
    { muscle_code: "legs", weight: 0.9 },
    { muscle_code: "core", weight: 0.1 },
  ],
  "힙 쓰러스트": [
    { muscle_code: "legs", weight: 0.85 },
    { muscle_code: "core", weight: 0.15 },
  ],
  "카프 레이즈": [{ muscle_code: "legs", weight: 1.0 }],

  "숄더 프레스": [
    { muscle_code: "shoulders", weight: 0.7 },
    { muscle_code: "triceps", weight: 0.3 },
  ],
  "사이드 레터럴 레이즈": [{ muscle_code: "shoulders", weight: 1.0 }],
  "리어 델트 플라이": [
    { muscle_code: "shoulders", weight: 0.8 },
    { muscle_code: "back", weight: 0.2 },
  ],
  "업라이트 로우": [
    { muscle_code: "shoulders", weight: 0.6 },
    { muscle_code: "back", weight: 0.25 },
    { muscle_code: "biceps", weight: 0.15 },
  ],

  "덤벨 바이셉 컬": [{ muscle_code: "biceps", weight: 1.0 }],
  "해머 컬": [{ muscle_code: "biceps", weight: 1.0 }],
  "트라이셉 푸시다운": [{ muscle_code: "triceps", weight: 1.0 }],
  "오버헤드 트라이셉 익스텐션": [{ muscle_code: "triceps", weight: 1.0 }],

  크런치: [{ muscle_code: "core", weight: 1.0 }],
  플랭크: [{ muscle_code: "core", weight: 1.0 }],
  "레그 레이즈": [{ muscle_code: "core", weight: 1.0 }],

  런닝: [
    { muscle_code: "cardio", weight: 0.6 },
    { muscle_code: "legs", weight: 0.4 },
  ],
  사이클: [
    { muscle_code: "cardio", weight: 0.7 },
    { muscle_code: "legs", weight: 0.3 },
  ],
};

const KEY_TO_MAPPING = new Map<string, MuscleWeight[]>();
const BODYWEIGHT_FACTOR_BY_KEY = new Map<string, number>();
for (const [canonical, weights] of Object.entries(CANONICAL_MUSCLE_MAP)) {
  KEY_TO_MAPPING.set(normalizeNameKey(canonical), weights);
}
for (const alias of EXERCISE_NAME_ALIASES) {
  const canonicalWeights = CANONICAL_MUSCLE_MAP[alias.canonical];
  if (!canonicalWeights) continue;
  for (const key of alias.keys) {
    const normalized = normalizeNameKey(key);
    KEY_TO_MAPPING.set(normalized, canonicalWeights);
    if (alias.canonical === "풀 업") {
      BODYWEIGHT_FACTOR_BY_KEY.set(normalized, 1.0);
    }
  }
}

BODYWEIGHT_FACTOR_BY_KEY.set(normalizeNameKey("풀 업"), 1.0);
BODYWEIGHT_FACTOR_BY_KEY.set(normalizeNameKey("pull up"), 1.0);
BODYWEIGHT_FACTOR_BY_KEY.set(normalizeNameKey("chin up"), 1.0);

export function getExerciseMuscleMapping(rawName: string): MuscleWeight[] | null {
  const key = normalizeNameKey(rawName);
  const mapping = KEY_TO_MAPPING.get(key);
  return mapping ? [...mapping] : null;
}

export function getBodyweightLoadFactor(rawName: string): number | null {
  const key = normalizeNameKey(rawName);
  const factor = BODYWEIGHT_FACTOR_BY_KEY.get(key);
  return typeof factor === "number" ? factor : null;
}

export function inferEffectiveWeightKg(
  rawName: string,
  explicitWeightKg: number | null | undefined,
  bodyweightKg = DEFAULT_BODYWEIGHT_KG
): number {
  const bodyweightFactor = getBodyweightLoadFactor(rawName);
  if (typeof explicitWeightKg === "number" && Number.isFinite(explicitWeightKg) && explicitWeightKg > 0) {
    if (bodyweightFactor != null) {
      return Number((bodyweightKg * bodyweightFactor + explicitWeightKg).toFixed(2));
    }
    return explicitWeightKg;
  }
  if (bodyweightFactor == null) {
    return 0;
  }
  return Number((bodyweightKg * bodyweightFactor).toFixed(2));
}
