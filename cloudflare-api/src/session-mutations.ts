import { inferEffectiveWeightKg } from "./exercise-muscles";

export type SessionSetPayload = {
  set_index?: number;
  weight_kg?: number | null;
  reps: number;
};

export type SessionExercisePayload = {
  raw_name: string;
  order_index?: number;
  sets: SessionSetPayload[];
};

export type SessionPayload = {
  date: string;
  started_at?: string | null;
  calories_kcal?: number | null;
  duration_min?: number | null;
  volume_kg?: number | null;
  exercises: SessionExercisePayload[];
};

function toValidDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("invalid_date");
  }
  return date;
}

function normalizeSets(sets: SessionSetPayload[]): Array<{ set_index: number; weight_kg: number | null; reps: number }> {
  return sets.map((setRow, idx) => ({
    set_index: setRow.set_index ?? idx + 1,
    weight_kg: setRow.weight_kg == null ? null : Number(setRow.weight_kg),
    reps: Number(setRow.reps || 0),
  }));
}

function normalizeStartedAt(value: string | null | undefined, date: string): string {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("invalid_started_at");
    }
    return parsed.toISOString();
  }
  return `${date}T12:00:00.000Z`;
}

function computeVolume(
  exercises: Array<{ raw_name: string; sets: Array<{ weight_kg: number | null; reps: number }> }>,
  bodyweightKg: number
): number {
  let total = 0;
  for (const ex of exercises) {
    for (const setRow of ex.sets) {
      const effectiveWeight = inferEffectiveWeightKg(ex.raw_name, setRow.weight_kg, bodyweightKg);
      total += effectiveWeight * (setRow.reps || 0);
    }
  }
  return Number(total.toFixed(2));
}

export function normalizeSessionPayload(
  input: SessionPayload,
  options: { bodyweight_kg?: number } = {}
): {
  date: string;
  started_at: string;
  calories_kcal: number | null;
  duration_min: number | null;
  volume_kg: number;
  exercises: Array<{ raw_name: string; order_index: number; sets: Array<{ set_index: number; weight_kg: number | null; reps: number }> }>;
} {
  const date = toValidDate(String(input.date || ""));
  const startedAt = normalizeStartedAt(input.started_at, date);
  const exercises = (input.exercises || []).map((exercise, idx) => ({
    raw_name: String(exercise.raw_name || "").trim(),
    order_index: exercise.order_index ?? idx + 1,
    sets: normalizeSets(exercise.sets || []),
  }));

  if (exercises.length === 0) {
    throw new Error("exercises_required");
  }

  const bodyweightKg = Number.isFinite(options.bodyweight_kg) ? Number(options.bodyweight_kg) : 70;
  const volumeFromSets = computeVolume(exercises, bodyweightKg);
  const explicitVolume = input.volume_kg == null ? null : Number(input.volume_kg);

  return {
    date,
    started_at: startedAt,
    calories_kcal: input.calories_kcal == null ? null : Number(input.calories_kcal),
    duration_min: input.duration_min == null ? null : Number(input.duration_min),
    volume_kg: explicitVolume == null || Number.isNaN(explicitVolume) ? volumeFromSets : explicitVolume,
    exercises,
  };
}
