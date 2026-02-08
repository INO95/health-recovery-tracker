export type NormalizedSet = {
  weight_kg: number | null;
  reps: number;
};

export type NormalizedExercise = {
  raw_name: string;
  sets: NormalizedSet[];
};

export type NormalizedWorkout = {
  summary: {
    split: string;
    weight_unit: string;
    date: string;
    calories_kcal: number | null;
    duration_min: number | null;
    volume_kg: number | null;
    exercises_count: number;
    sets_total: number;
    reps_total: number;
    intensity_kg_per_min: number | null;
  };
  exercises: NormalizedExercise[];
  meta: {
    confidence: number;
    needs_review: boolean;
    warnings: string[];
  };
};

function parseNumber(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "unknown") return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseIntValue(value: string): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

export function parseNormalizedWorkoutText(text: string): NormalizedWorkout | null {
  if (!text.includes("[SUMMARY]")) {
    return null;
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const summary = {
    split: "unknown",
    weight_unit: "kg",
    date: "",
    calories_kcal: null as number | null,
    duration_min: null as number | null,
    volume_kg: null as number | null,
    exercises_count: 0,
    sets_total: 0,
    reps_total: 0,
    intensity_kg_per_min: null as number | null,
  };

  const exercises: NormalizedExercise[] = [];
  let currentExercise: NormalizedExercise | null = null;
  const meta = {
    confidence: 0.5,
    needs_review: false,
    warnings: [] as string[],
  };

  for (const line of lines) {
    const exMatch = line.match(/^\[EXERCISE\s+\d+\]\s*(.+)$/i);
    if (exMatch) {
      if (currentExercise) {
        exercises.push(currentExercise);
      }
      currentExercise = { raw_name: exMatch[1], sets: [] };
      continue;
    }

    if (currentExercise) {
      const setMatch = line.match(/^set\d+\s*:\s*weight\s*=\s*([0-9]+(?:\.[0-9]+)?|bodyweight)(?:kg)?\s*reps\s*=\s*(\d+)$/i);
      if (setMatch) {
        currentExercise.sets.push({
          weight_kg: setMatch[1].toLowerCase() === "bodyweight" ? null : Number.parseFloat(setMatch[1]),
          reps: Number.parseInt(setMatch[2], 10),
        });
        continue;
      }
    }

    const kv = line.match(/^([a-z_]+)\s*=\s*(.+)$/i);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const value = kv[2].trim();

    if (key === "split") summary.split = value;
    if (key === "weight_unit") summary.weight_unit = value;
    if (key === "date") summary.date = value;
    if (key === "calories_kcal") summary.calories_kcal = parseNumber(value);
    if (key === "duration_min") summary.duration_min = parseNumber(value);
    if (key === "volume_kg") summary.volume_kg = parseNumber(value);
    if (key === "exercises_count") summary.exercises_count = parseIntValue(value);
    if (key === "sets_total") summary.sets_total = parseIntValue(value);
    if (key === "reps_total") summary.reps_total = parseIntValue(value);
    if (key === "intensity_kg_per_min") summary.intensity_kg_per_min = parseNumber(value);
    if (key === "confidence") meta.confidence = parseNumber(value) ?? 0.5;
    if (key === "needs_review") meta.needs_review = value.toLowerCase() === "true";
    if (key === "warnings") meta.warnings = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
  }

  if (currentExercise) {
    exercises.push(currentExercise);
  }

  if (!summary.date) {
    return null;
  }

  return { summary, exercises, meta };
}

function recomputeSummary(workout: NormalizedWorkout): void {
  workout.summary.exercises_count = workout.exercises.length;
  workout.summary.sets_total = workout.exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
  workout.summary.reps_total = workout.exercises.reduce(
    (acc, ex) => acc + ex.sets.reduce((sAcc, setRow) => sAcc + (setRow.reps || 0), 0),
    0
  );
  if (workout.summary.duration_min && workout.summary.volume_kg != null && workout.summary.duration_min > 0) {
    workout.summary.intensity_kg_per_min = Number((workout.summary.volume_kg / workout.summary.duration_min).toFixed(0));
  }
}

function fmt(value: number | null): string {
  return value == null ? "unknown" : String(value);
}

export function buildNormalizedWorkoutText(workout: NormalizedWorkout): string {
  recomputeSummary(workout);

  const lines: string[] = [];
  lines.push("[SUMMARY]");
  lines.push(`split=${workout.summary.split || "unknown"}`);
  lines.push(`weight_unit=${workout.summary.weight_unit || "kg"}`);
  lines.push(`date=${workout.summary.date || "unknown"}`);
  lines.push(`calories_kcal=${fmt(workout.summary.calories_kcal)}`);
  lines.push(`duration_min=${fmt(workout.summary.duration_min)}`);
  lines.push(`volume_kg=${fmt(workout.summary.volume_kg)}`);
  lines.push(`exercises_count=${workout.summary.exercises_count}`);
  lines.push(`sets_total=${workout.summary.sets_total}`);
  lines.push(`reps_total=${workout.summary.reps_total}`);
  lines.push(`intensity_kg_per_min=${fmt(workout.summary.intensity_kg_per_min)}`);
  lines.push("");

  workout.exercises.forEach((exercise, exIdx) => {
    lines.push(`[EXERCISE ${exIdx + 1}] ${exercise.raw_name}`);
    exercise.sets.forEach((setRow, setIdx) => {
      const weight = setRow.weight_kg == null ? "bodyweight" : `${setRow.weight_kg}`;
      lines.push(`set${setIdx + 1}: weight=${weight}kg reps=${setRow.reps}`);
    });
    lines.push("");
  });

  lines.push("[META]");
  lines.push(`confidence=${workout.meta.confidence}`);
  lines.push(`needs_review=${workout.meta.needs_review ? "true" : "false"}`);
  lines.push(`warnings=${workout.meta.warnings.join(",")}`);
  return lines.join("\n").trim();
}
