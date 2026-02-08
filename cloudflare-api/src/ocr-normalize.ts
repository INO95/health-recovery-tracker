import { parseFleekOcrV1 } from "./parser";

export type NormalizeOcrResult = {
  normalized_text: string;
  confidence: number;
  needs_review: boolean;
  warnings: string[];
};

function fmtNum(value: number | null): string {
  if (value == null) {
    return "unknown";
  }
  return String(value);
}

function detectSplit(rawText: string): string {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const routineLine = lines.find((line) => /가슴|등|하체|어깨|삼두|이두|복근|코어/i.test(line));
  if (!routineLine) {
    return "unknown";
  }
  return routineLine.replace(/\s+/g, "/");
}

export function normalizeOcrText(rawText: string): NormalizeOcrResult {
  const parsed = parseFleekOcrV1(rawText || "");
  return normalizeParsedResult(parsed, rawText);
}

export function normalizeParsedResult(parsed: ReturnType<typeof parseFleekOcrV1>, rawText = ""): NormalizeOcrResult {
  const lines: string[] = [];

  lines.push("[SUMMARY]");
  lines.push(`split=${detectSplit(rawText)}`);
  lines.push("weight_unit=kg");
  lines.push(`date=${parsed.summary.date ?? "unknown"}`);
  lines.push(`calories_kcal=${fmtNum(parsed.summary.calories_kcal)}`);
  lines.push(`duration_min=${fmtNum(parsed.summary.duration_min)}`);
  lines.push(`volume_kg=${fmtNum(parsed.summary.volume_kg)}`);
  lines.push(`exercises_count=${fmtNum(parsed.summary.exercises_count)}`);
  lines.push(`sets_total=${fmtNum(parsed.summary.sets_total)}`);
  lines.push(`reps_total=${fmtNum(parsed.summary.reps_total)}`);
  lines.push(`intensity_kg_per_min=${fmtNum(parsed.summary.intensity_kg_per_min)}`);
  lines.push("");

  parsed.exercises.forEach((exercise, index) => {
    lines.push(`[EXERCISE ${index + 1}] ${exercise.raw_name}`);
    exercise.sets.forEach((setItem, setIndex) => {
      const weight = setItem.weight_kg == null ? "bodyweight" : `${setItem.weight_kg}kg`;
      lines.push(`set${setIndex + 1}: weight=${weight} reps=${setItem.reps}`);
    });
    lines.push("");
  });

  lines.push("[META]");
  lines.push(`confidence=${parsed.meta.confidence}`);
  lines.push(`needs_review=${parsed.meta.needs_review ? "true" : "false"}`);
  lines.push(`warnings=${parsed.meta.warnings.join(",")}`);

  return {
    normalized_text: lines.join("\n").trim(),
    confidence: parsed.meta.confidence,
    needs_review: parsed.meta.needs_review,
    warnings: parsed.meta.warnings,
  };
}
