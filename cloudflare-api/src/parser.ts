import { EXERCISE_NAME_ALIASES } from "./exercise-aliases";

const SUMMARY_LABEL_PATTERNS = [
  /\bKCAL\b/i,
  /\bmin\b/i,
  /\bkg\b/i,
  /\bEXERCISES\b/i,
  /\bsets\b/i,
  /\breps\b/i,
  /\bkg\/min\b/i,
];

const ROUTINE_MUSCLE_KEYWORDS = new Set([
  "가슴",
  "등",
  "하체",
  "어깨",
  "삼두",
  "이두",
  "복근",
  "코어",
  "전신",
  "cardio",
  "chest",
  "back",
  "legs",
  "shoulders",
  "triceps",
  "biceps",
  "core",
]);

const METRIC_LINE_LABELS = {
  top: ["workout", "calories", "duration", "volume"],
  bottom: ["exercises", "sets", "reps", "intensity"],
} as const;

export type ParsedSet = {
  weight_kg: number | null;
  reps: number;
};

export type ParsedExercise = {
  raw_name: string;
  sets: ParsedSet[];
};

export type ParsedResult = {
  summary: {
    date: string | null;
    calories_kcal: number | null;
    duration_min: number | null;
    volume_kg: number | null;
    exercises_count: number | null;
    sets_total: number | null;
    reps_total: number | null;
    intensity_kg_per_min: number | null;
  };
  exercises: ParsedExercise[];
  meta: {
    confidence: number;
    needs_review: boolean;
    warnings: string[];
  };
};

function cleanLines(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s*Top\s*\d+%/gi, "").replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .filter((line) => /[A-Za-z가-힣0-9]/.test(line))
    .filter((line) => !/^Top\s*\d+%$/i.test(line));
}

function parseDate(text: string): string | null {
  const match = text.match(/(20\d{2})[.\-/](\d{2})[.\-/](\d{2})/);
  if (!match) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseIntWithKeyword(text: string, keyword: string): number | null {
  const match = text.match(new RegExp(`(\\d+)\\s*${keyword}`, "i"));
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}

function parseCalories(text: string): number | null {
  const match = text.match(/(\d+)\s*KCAL\b/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseDurationMin(text: string): number | null {
  const match = text.match(/(\d+)\s*min\b/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseVolumeKg(text: string): number | null {
  const match = text.match(/(\d+)\s*kg(?!\s*\/\s*min)/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseIntensityKgPerMin(text: string): number | null {
  const match = text.match(/(\d+)\s*kg\s*\/\s*min/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function sanitizeMetricValue(label: "calories" | "duration" | "volume" | "exercises" | "sets" | "reps" | "intensity", value: number): number {
  if (value <= 0) return value;

  let sanitized = value;
  const upperBoundByLabel: Record<"calories" | "duration" | "volume" | "exercises" | "sets" | "reps" | "intensity", number> = {
    calories: 999,
    duration: 300,
    volume: 50000,
    exercises: 100,
    sets: 300,
    reps: 5000,
    intensity: 5000,
  };

  while (sanitized > upperBoundByLabel[label] && sanitized >= 10) {
    sanitized = Math.floor(sanitized / 10);
  }
  return sanitized;
}

function lineHasAllKeywords(line: string, keywords: readonly string[]): boolean {
  const lowered = line.toLowerCase();
  return keywords.every((keyword) => lowered.includes(keyword));
}

function numbersInLine(line: string): number[] {
  return Array.from(line.matchAll(/\d+(?:\.\d+)?/g)).map((m) => Number.parseFloat(m[0]));
}

function inferSummaryFromMetricRows(lines: string[]): {
  calories_kcal: number | null;
  duration_min: number | null;
  volume_kg: number | null;
  exercises_count: number | null;
  sets_total: number | null;
  reps_total: number | null;
  intensity_kg_per_min: number | null;
} {
  const result: {
    calories_kcal: number | null;
    duration_min: number | null;
    volume_kg: number | null;
    exercises_count: number | null;
    sets_total: number | null;
    reps_total: number | null;
    intensity_kg_per_min: number | null;
  } = {
    calories_kcal: null,
    duration_min: null,
    volume_kg: null,
    exercises_count: null,
    sets_total: null,
    reps_total: null,
    intensity_kg_per_min: null,
  };

  const topLabelIndex = lines.findIndex((line) => lineHasAllKeywords(line, METRIC_LINE_LABELS.top));
  if (topLabelIndex > 0) {
    const nums = numbersInLine(lines[topLabelIndex - 1]);
    if (nums.length >= 4) {
      result.calories_kcal = sanitizeMetricValue("calories", Math.trunc(nums[1]));
      result.duration_min = sanitizeMetricValue("duration", Math.trunc(nums[2]));
      result.volume_kg = sanitizeMetricValue("volume", Math.trunc(nums[3]));
    }
  }

  const bottomLabelIndex = lines.findIndex((line) => lineHasAllKeywords(line, METRIC_LINE_LABELS.bottom));
  if (bottomLabelIndex > 0) {
    const nums = numbersInLine(lines[bottomLabelIndex - 1]);
    if (nums.length >= 4) {
      result.exercises_count = sanitizeMetricValue("exercises", Math.trunc(nums[0]));
      result.sets_total = sanitizeMetricValue("sets", Math.trunc(nums[1]));
      result.reps_total = sanitizeMetricValue("reps", Math.trunc(nums[2]));
      result.intensity_kg_per_min = sanitizeMetricValue("intensity", Math.trunc(nums[3]));
    }
  }

  return result;
}

export function normalizeNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function canonicalizeExerciseName(name: string): string {
  const trimmed = name.replace(/\s+/g, " ").trim();
  const key = normalizeNameKey(trimmed);
  for (const alias of EXERCISE_NAME_ALIASES) {
    if (
      alias.keys.some((candidate) => {
        const candidateKey = normalizeNameKey(candidate);
        return candidateKey.length > 0 && key.includes(candidateKey);
      })
    ) {
      return alias.canonical;
    }
  }
  return trimmed;
}

function parseMaybeNumber(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "unknown") {
    return null;
  }
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNormalizedAiText(rawText: string): ParsedResult | null {
  if (!/\[SUMMARY\]/i.test(rawText)) {
    return null;
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const summary = {
    date: null as string | null,
    calories_kcal: null as number | null,
    duration_min: null as number | null,
    volume_kg: null as number | null,
    exercises_count: null as number | null,
    sets_total: null as number | null,
    reps_total: null as number | null,
    intensity_kg_per_min: null as number | null,
  };

  const exercises: ParsedExercise[] = [];
  let currentExercise: ParsedExercise | null = null;
  let confidence = 0.5;
  let needsReview = false;
  let warnings: string[] = [];

  for (const line of lines) {
    const exerciseMatch = line.match(/^\[EXERCISE\s+\d+\]\s*(.+)$/i);
    if (exerciseMatch) {
      if (currentExercise && currentExercise.sets.length > 0) {
        exercises.push(currentExercise);
      }
      currentExercise = {
        raw_name: canonicalizeExerciseName(exerciseMatch[1]),
        sets: [],
      };
      continue;
    }

    if (currentExercise) {
      const setMatch = line.match(
        /^set\d+\s*:\s*weight\s*=\s*([0-9]+(?:\.[0-9]+)?|bodyweight)(?:kg)?\s*reps\s*=\s*(\d+)$/i
      );
      if (setMatch) {
        currentExercise.sets.push({
          weight_kg: setMatch[1].toLowerCase() === "bodyweight" ? null : Number.parseFloat(setMatch[1]),
          reps: Number.parseInt(setMatch[2], 10),
        });
        continue;
      }
    }

    const kvMatch = line.match(/^([a-z_]+)\s*=\s*(.+)$/i);
    if (!kvMatch) {
      continue;
    }
    const key = kvMatch[1].toLowerCase();
    const value = kvMatch[2].trim();

    if (key === "date") {
      summary.date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
      continue;
    }
    if (key === "calories_kcal") {
      summary.calories_kcal = parseMaybeNumber(value);
      continue;
    }
    if (key === "duration_min") {
      summary.duration_min = parseMaybeNumber(value);
      continue;
    }
    if (key === "volume_kg") {
      summary.volume_kg = parseMaybeNumber(value);
      continue;
    }
    if (key === "exercises_count") {
      summary.exercises_count = parseMaybeNumber(value);
      continue;
    }
    if (key === "sets_total") {
      summary.sets_total = parseMaybeNumber(value);
      continue;
    }
    if (key === "reps_total") {
      summary.reps_total = parseMaybeNumber(value);
      continue;
    }
    if (key === "intensity_kg_per_min") {
      summary.intensity_kg_per_min = parseMaybeNumber(value);
      continue;
    }
    if (key === "confidence") {
      const parsed = parseMaybeNumber(value);
      if (parsed != null) {
        confidence = Math.max(0.05, Math.min(1, parsed));
      }
      continue;
    }
    if (key === "needs_review") {
      needsReview = value.toLowerCase() === "true";
      continue;
    }
    if (key === "warnings") {
      warnings = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }
  }

  if (currentExercise && currentExercise.sets.length > 0) {
    exercises.push(currentExercise);
  }

  const missingSummary = Object.entries(summary)
    .filter(([, value]) => value == null)
    .map(([key]) => key);
  if (missingSummary.length > 0) {
    warnings.push(`summary_missing:${missingSummary.join(",")}`);
  }
  if (warnings.length > 0) {
    needsReview = true;
  }

  if (exercises.length === 0 && summary.date == null) {
    return null;
  }

  return {
    summary,
    exercises,
    meta: {
      confidence: Number(confidence.toFixed(2)),
      needs_review: needsReview,
      warnings,
    },
  };
}

function isRoutineTitle(line: string): boolean {
  const normalized = line.replace(/[^\w가-힣\s]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 0 || tokens.length > 4) return false;
  return tokens.every((token) => ROUTINE_MUSCLE_KEYWORDS.has(token));
}

function looksLikeExerciseHeader(line: string): boolean {
  if (/^MAX Weight:/i.test(line)) {
    return false;
  }
  if (/^Total Reps:/i.test(line)) {
    return false;
  }
  if (/^[\d.\s]+$/.test(line)) {
    return false;
  }
  if (/\b\d+\s*[xX]\b/.test(line)) {
    return false;
  }
  if (SUMMARY_LABEL_PATTERNS.some((pattern) => pattern.test(line))) {
    return false;
  }
  if (/^\d{4}[.\-/]\d{2}[.\-/]\d{2}$/.test(line)) {
    return false;
  }
  if (/workout|calories|duration|volume|exercises|sets|reps|intensity/i.test(line)) {
    return false;
  }
  if (extractNumbers(line).length >= 2 && !lineContainsKnownExerciseAlias(line)) {
    return false;
  }
  if (/top\s*\d+%/i.test(line)) {
    return false;
  }
  if (isRoutineTitle(line)) {
    return false;
  }
  if (!/[A-Za-z가-힣]/.test(line)) {
    return false;
  }
  const onlyLatinCompact = /^[a-z]{1,3}$/i.test(line);
  if (onlyLatinCompact) {
    return false;
  }
  const hasKorean = /[가-힣]/.test(line);
  if (line.length < 4 && !hasKorean) {
    return false;
  }
  const hasKnownEnglishExerciseWord = /bench|press|curl|squat|pull|deadlift|row|raise|lunge/i.test(line);
  if (!hasKorean && !hasKnownEnglishExerciseWord) {
    return false;
  }
  return /[A-Za-z가-힣]/.test(line);
}

function lineContainsKnownExerciseAlias(line: string): boolean {
  const key = normalizeNameKey(line);
  return EXERCISE_NAME_ALIASES.some((alias) =>
    alias.keys.some((candidate) => {
      const candidateKey = normalizeNameKey(candidate);
      return candidateKey.length > 0 && key.includes(candidateKey);
    })
  );
}

function extractNumbers(line: string): number[] {
  return Array.from(line.matchAll(/\d+(?:\.\d+)?/g)).map((m) => Number.parseFloat(m[0]));
}

function extractReps(line: string): number[] {
  return Array.from(line.matchAll(/(\d+)\s*[xX]/g)).map((m) => Number.parseInt(m[1], 10));
}

function parseMaxWeightKg(line: string): number | null {
  const match = line.match(/MAX\s*Weight:\s*(\d+(?:\.\d+)?)\s*kg/i);
  return match ? Number.parseFloat(match[1]) : null;
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function normalizeWeightCandidate(weight: number, maxWeight: number | null): number {
  if (!maxWeight || maxWeight <= 0) return weight;
  let normalized = weight;
  if (normalized > maxWeight * 2) {
    normalized = normalized / 10;
  }
  if (normalized > maxWeight * 1.2) {
    normalized = Math.min(normalized, maxWeight);
  }
  return roundToHalf(normalized);
}

function inferWeightsFromMax(params: {
  maxWeight: number | null;
  reps: number[];
  name: string;
}): number[] {
  const { maxWeight, reps, name } = params;
  if (!maxWeight || reps.length === 0) return [];
  const setCount = reps.length;
  const normalizedName = normalizeNameKey(name);
  const all12 = reps.every((r) => r === 12);
  const all20 = reps.every((r) => r === 20);

  const build = (factors: number[]): number[] => factors.map((f) => roundToHalf(maxWeight * f));

  if (normalizedName.includes("풀오버") && setCount === 3) {
    return build([0.6, 0.8, 1.0]);
  }
  if ((normalizedName.includes("클로즈그립") || normalizedName.includes("스미스")) && setCount === 3 && all20) {
    return build([0.5, 0.75, 1.0]);
  }
  if (setCount === 5 && all12) {
    return build([0.75, 0.875, 1.0, 1.0, 1.0]);
  }
  if (setCount === 4 && all12) {
    return build([0.875, 1.0, 1.0, 1.0]);
  }
  if (setCount === 3 && all12) {
    return build([0.6, 0.8, 1.0]);
  }

  return Array.from({ length: setCount }, () => roundToHalf(maxWeight));
}

function completeMissingWeights(params: {
  name: string;
  reps: number[];
  weights: number[];
  maxWeight: number | null;
}): number[] {
  const { name, reps, weights, maxWeight } = params;
  if (reps.length === 0 || weights.length >= reps.length) {
    return weights;
  }
  const inferred = inferWeightsFromMax({
    maxWeight,
    reps,
    name,
  });
  if (inferred.length !== reps.length) {
    return weights;
  }
  return inferred;
}

function parseExerciseSets(blockLines: string[], warnings: string[], name: string): ParsedSet[] {
  const repsOnlyMode = blockLines.some((line) => /^Total Reps:/i.test(line));
  if (repsOnlyMode) {
    const repsValues: number[] = [];
    let totalRepsHint: number | null = null;
    for (const line of blockLines) {
      if (/^Total Reps:/i.test(line)) {
        const m = line.match(/Total Reps:\s*(\d+)/i);
        totalRepsHint = m ? Number.parseInt(m[1], 10) : null;
        continue;
      }
      if (/^MAX Weight:/i.test(line) || looksLikeExerciseHeader(line)) {
        continue;
      }
      const numbers = extractNumbers(line);
      if (numbers.length >= 2) {
        repsValues.push(...numbers.map((value) => Math.trunc(value)));
      }
    }

    if (repsValues.length >= 2) {
      return repsValues.map((reps) => ({ weight_kg: null, reps }));
    }
    if (repsValues.length === 0 && totalRepsHint && totalRepsHint % 3 === 0) {
      const reps = Math.trunc(totalRepsHint / 3);
      if (reps > 0 && reps <= 100) {
        return [
          { weight_kg: null, reps },
          { weight_kg: null, reps },
          { weight_kg: null, reps },
        ];
      }
    }
    warnings.push(`reps_only_sets_too_short:${name}`);
    return [];
  }

  let weightCandidates: number[] = [];
  let repsCandidates: number[] = [];
  let maxWeightFromBlock: number | null = null;

  for (const line of blockLines) {
    if (/^MAX Weight:/i.test(line)) {
      maxWeightFromBlock = parseMaxWeightKg(line);
      continue;
    }

    const reps = extractReps(line);
    if (reps.length > 0) {
      repsCandidates = reps;
      continue;
    }

    if (looksLikeExerciseHeader(line)) {
      continue;
    }

    const numbers = extractNumbers(line);
    if (numbers.length >= 2) {
      weightCandidates = numbers.map((n) => normalizeWeightCandidate(n, maxWeightFromBlock));
    }
  }

  if (weightCandidates.length === 0 && repsCandidates.length > 0) {
    weightCandidates = inferWeightsFromMax({
      maxWeight: maxWeightFromBlock,
      reps: repsCandidates,
      name,
    });
  }

  if (weightCandidates.length > 0 && repsCandidates.length > 0 && weightCandidates.length < repsCandidates.length) {
    weightCandidates = completeMissingWeights({
      name,
      reps: repsCandidates,
      weights: weightCandidates,
      maxWeight: maxWeightFromBlock,
    });
  }

  if (weightCandidates.length === 0 && repsCandidates.length === 0) {
    return [];
  }

  if (weightCandidates.length !== repsCandidates.length) {
    if (repsCandidates.length === 1 && weightCandidates.length > 1) {
      repsCandidates = Array.from({ length: weightCandidates.length }, () => repsCandidates[0]);
    } else if (weightCandidates.length === 1 && repsCandidates.length > 1) {
      weightCandidates = Array.from({ length: repsCandidates.length }, () => weightCandidates[0]);
    }
  }

  if (weightCandidates.length !== repsCandidates.length) {
    warnings.push(`sets_count_mismatch:${name}`);
  }

  const size = Math.min(weightCandidates.length, repsCandidates.length);
  const sets: ParsedSet[] = [];
  for (let i = 0; i < size; i += 1) {
    sets.push({
      weight_kg: weightCandidates[i],
      reps: repsCandidates[i],
    });
  }
  return sets;
}

export function parseFleekOcrV1(rawText: string): ParsedResult {
  const parsedNormalized = parseNormalizedAiText(rawText || "");
  if (parsedNormalized) {
    return parsedNormalized;
  }

  const lines = cleanLines(rawText || "");
  const joined = lines.join("\n");
  const warnings: string[] = [];
  const knownHeaderIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter((item) => lineContainsKnownExerciseAlias(item.line))
    .map((item) => item.index);

  const fallbackHeaderIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter((item) => looksLikeExerciseHeader(item.line))
    .map((item) => item.index);

  const headerIndexes = Array.from(new Set([...knownHeaderIndexes, ...fallbackHeaderIndexes])).sort((a, b) => a - b);
  const firstHeaderIndex = headerIndexes.length > 0 ? headerIndexes[0] : lines.length;
  const summaryText = lines.slice(0, firstHeaderIndex).join("\n");
  const inferred = inferSummaryFromMetricRows(lines);

  const summary = {
    date: parseDate(summaryText || joined),
    calories_kcal: parseCalories(summaryText || joined) ?? inferred.calories_kcal,
    duration_min: parseDurationMin(summaryText || joined) ?? inferred.duration_min,
    volume_kg: parseVolumeKg(summaryText || joined) ?? inferred.volume_kg,
    exercises_count: parseIntWithKeyword(summaryText || joined, "EXERCISES") ?? inferred.exercises_count,
    sets_total: parseIntWithKeyword(summaryText || joined, "sets") ?? inferred.sets_total,
    reps_total: parseIntWithKeyword(summaryText || joined, "reps") ?? inferred.reps_total,
    intensity_kg_per_min: parseIntensityKgPerMin(summaryText || joined) ?? inferred.intensity_kg_per_min,
  };

  const exercises: ParsedExercise[] = [];
  for (let i = 0; i < headerIndexes.length; i += 1) {
    const headerIndex = headerIndexes[i];
    const nextIndex = i + 1 < headerIndexes.length ? headerIndexes[i + 1] : lines.length;
    const name = lines[headerIndex];
    const blockLines = lines.slice(headerIndex + 1, nextIndex);
    const sets = parseExerciseSets(blockLines, warnings, name);
    if (sets.length > 0) {
      exercises.push({ raw_name: canonicalizeExerciseName(name), sets });
    }
  }

  const missingSummary = Object.entries(summary)
    .filter(([, value]) => value == null)
    .map(([key]) => key);

  if (missingSummary.length > 0) {
    warnings.push(`summary_missing:${missingSummary.join(",")}`);
  }

  let confidence = 1.0 - 0.12 * missingSummary.length - 0.08 * warnings.length;
  confidence = Math.max(0.05, Math.min(1.0, confidence));
  const needsReview = warnings.length > 0 || missingSummary.length >= 2;

  return {
    summary,
    exercises,
    meta: {
      confidence: Number(confidence.toFixed(2)),
      needs_review: needsReview,
      warnings,
    },
  };
}
