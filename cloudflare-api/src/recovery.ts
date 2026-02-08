import { buildTrainerAdvice } from "./trainer-advice";
import { getExerciseMuscleMapping, inferEffectiveWeightKg } from "./exercise-muscles";
import { normalizeNameKey } from "./parser";

const DEFAULT_WINDOW_DAYS = 7;
const SEED_SESSION_DATE = "1970-01-01";
const FATIGUE_SCALE = 100.0;

export const DEFAULT_REST_HOURS_BY_MUSCLE: Record<string, number> = {
  chest: 60,
  back: 60,
  shoulders: 60,
  legs: 60,
  core: 60,
  cardio: 24,
};

export type RecoveryOptions = {
  from?: string | null;
  to?: string | null;
  days?: number;
  reference_at?: string | null;
  bodyweight_kg?: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

function statusColor(recovery: number): string {
  if (recovery >= 70) return "green";
  if (recovery >= 40) return "yellow";
  return "red";
}

function resolveWindow(options: RecoveryOptions): {
  fromDate: string;
  toDate: string;
  toDateObj: Date;
  referenceTimeObj: Date;
  days: number;
} {
  const days = options.days ?? DEFAULT_WINDOW_DAYS;
  const toDateObj = options.to ? new Date(`${options.to}T23:59:59.999Z`) : new Date();
  const fromDateObj = options.from
    ? new Date(`${options.from}T00:00:00.000Z`)
    : new Date(toDateObj.getTime() - days * 24 * 60 * 60 * 1000);

  if (fromDateObj.getTime() > toDateObj.getTime()) {
    throw new Error("invalid_time_window");
  }

  // Recovery remaining time should be calculated against the real "now" by default,
  // not the end-of-day window cursor.
  const referenceTimeObj = options.reference_at ? new Date(options.reference_at) : new Date();
  if (Number.isNaN(referenceTimeObj.getTime())) {
    throw new Error("invalid_reference_time");
  }

  return {
    fromDate: fromDateObj.toISOString().slice(0, 10),
    toDate: toDateObj.toISOString().slice(0, 10),
    toDateObj,
    referenceTimeObj,
    days,
  };
}

export function defaultRestHoursForMuscle(code: string): number {
  if (Object.prototype.hasOwnProperty.call(DEFAULT_REST_HOURS_BY_MUSCLE, code)) {
    return DEFAULT_REST_HOURS_BY_MUSCLE[code];
  }
  return 36;
}

export async function ensureRecoverySettingsTable(db: D1Database): Promise<void> {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS recovery_settings (
      muscle_code TEXT PRIMARY KEY,
      rest_hours REAL NOT NULL,
      updated_at TEXT NOT NULL
    )`
  ).run();
}

export async function listRecoverySettings(
  db: D1Database,
  muscleCodes: string[] = []
): Promise<Record<string, number>> {
  await ensureRecoverySettingsTable(db);

  const allCodes = new Set<string>([...Object.keys(DEFAULT_REST_HOURS_BY_MUSCLE), ...muscleCodes]);
  for (const code of allCodes) {
    await db
      .prepare("INSERT OR IGNORE INTO recovery_settings (muscle_code, rest_hours, updated_at) VALUES (?1, ?2, ?3)")
      .bind(code, defaultRestHoursForMuscle(code), nowIso())
      .run();
  }

  const rows = await db
    .prepare("SELECT muscle_code, rest_hours FROM recovery_settings")
    .all<{ muscle_code: string; rest_hours: number }>();

  const resolved: Record<string, number> = {};
  for (const row of rows.results) {
    const value = Number(row.rest_hours);
    resolved[row.muscle_code] = Number.isFinite(value) && value > 0 ? value : defaultRestHoursForMuscle(row.muscle_code);
  }

  return resolved;
}

export async function updateRecoverySetting(db: D1Database, muscleCode: string, restHours: number): Promise<void> {
  await ensureRecoverySettingsTable(db);
  await db
    .prepare(
      `INSERT INTO recovery_settings (muscle_code, rest_hours, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(muscle_code) DO UPDATE SET rest_hours = excluded.rest_hours, updated_at = excluded.updated_at`
    )
    .bind(muscleCode, restHours, nowIso())
    .run();
}

function recoveryDecayFactor(deltaHours: number, restHours: number): number {
  const k = Math.log(5) / Math.max(1, restHours);
  return Math.exp(-k * deltaHours);
}

function topContributors(contribMap: Map<string, number>, limit = 2): Array<{ raw_name: string; contribution: number }> {
  return Array.from(contribMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([rawName, contribution]) => ({ raw_name: rawName, contribution: Number(contribution.toFixed(2)) }));
}

function parseSessionTimestamp(date: string, startedAt: string | null): Date {
  if (startedAt) {
    const parsedStartedAt = new Date(startedAt);
    if (!Number.isNaN(parsedStartedAt.getTime())) {
      return parsedStartedAt;
    }
  }
  return new Date(`${date}T12:00:00.000Z`);
}

export async function computeRecovery(db: D1Database, options: RecoveryOptions = {}): Promise<Record<string, unknown>> {
  const window = resolveWindow(options);
  const bodyweightKg = Number.isFinite(options.bodyweight_kg) ? Number(options.bodyweight_kg) : 70;

  const muscleRows = await db
    .prepare("SELECT id, code, name FROM muscle_groups ORDER BY code ASC")
    .all<{ id: string; code: string; name: string }>();

  const muscles = muscleRows.results;
  const muscleById = new Map(muscles.map((row) => [row.id, row]));
  const restSettings = await listRecoverySettings(db, muscles.map((m) => m.code));

  const sessionRows = await db
    .prepare(
      `SELECT id, date, created_at
       , started_at
       FROM sessions
       WHERE date >= ?1 AND date <= ?2 AND date != ?3`
    )
    .bind(window.fromDate, window.toDate, SEED_SESSION_DATE)
    .all<{ id: string; date: string; created_at: string | null; started_at: string | null }>();

  const sessionMetaById = new Map(sessionRows.results.map((row) => [row.id, row]));
  const sessionIds = sessionRows.results.map((row) => row.id);

  if (sessionIds.length === 0) {
    const emptyMuscles = Object.fromEntries(
      muscles.map((muscle) => {
        const defaultHours = defaultRestHoursForMuscle(muscle.code);
        const configuredHours = restSettings[muscle.code] ?? defaultHours;
        return [
          muscle.code,
          {
            name: muscle.name,
            fatigue_raw: 0,
            fatigue: 0,
            recovery: 100,
            status: "green",
            default_rest_hours: defaultHours,
            rest_hours: configuredHours,
            last_trained_at: null,
            next_train_at: null,
            remaining_hours: 0,
            contributors: [],
          },
        ];
      })
    );

    return {
      window: {
        days: window.days,
        from: window.fromDate,
        to: window.toDate,
        reference_at: window.referenceTimeObj.toISOString(),
      },
      recovery_settings: restSettings,
      muscles: emptyMuscles,
      trainer_advice: buildTrainerAdvice(
        Object.fromEntries(
          Object.entries(emptyMuscles).map(([code, value]) => [
            code,
            {
              name: String((value as { name?: string }).name || code),
              recovery: Number((value as { recovery: number }).recovery || 0),
              status: String((value as { status: string }).status || "green"),
              remaining_hours: Number((value as { remaining_hours: number }).remaining_hours || 0),
              next_train_at: (value as { next_train_at: string | null }).next_train_at,
            },
          ])
        ),
        window.referenceTimeObj.toISOString()
      ),
      unmapped_exercises: [],
    };
  }

  const inSessionPlaceholders = sessionIds.map(() => "?").join(",");
  const exerciseRows = await db
    .prepare(`SELECT id, session_id, raw_name FROM exercises WHERE session_id IN (${inSessionPlaceholders})`)
    .bind(...sessionIds)
    .all<{ id: string; session_id: string; raw_name: string }>();

  const exerciseIds = exerciseRows.results.map((row) => row.id);

  if (exerciseIds.length === 0) {
    return {
      window: {
        days: window.days,
        from: window.fromDate,
        to: window.toDate,
        reference_at: window.referenceTimeObj.toISOString(),
      },
      recovery_settings: restSettings,
      muscles: {},
      trainer_advice: buildTrainerAdvice({}, window.referenceTimeObj.toISOString()),
      unmapped_exercises: [],
    };
  }

  const inExercisePlaceholders = exerciseIds.map(() => "?").join(",");
  const setRows = await db
    .prepare(`SELECT exercise_id, weight_kg, reps FROM sets WHERE exercise_id IN (${inExercisePlaceholders})`)
    .bind(...exerciseIds)
    .all<{ exercise_id: string; weight_kg: number | null; reps: number }>();

  const mappingRows = await db
    .prepare(
      `SELECT em.exercise_id, em.muscle_id, em.weight, e.raw_name
       FROM exercise_muscles em
       JOIN exercises e ON e.id = em.exercise_id`
    )
    .all<{ exercise_id: string; muscle_id: string; weight: number; raw_name: string }>();

  const exerciseNameById = new Map(exerciseRows.results.map((row) => [row.id, row.raw_name]));
  const exerciseVolumeById = new Map<string, number>();
  for (const row of setRows.results) {
    const current = exerciseVolumeById.get(row.exercise_id) ?? 0;
    const rawName = exerciseNameById.get(row.exercise_id) ?? "";
    const weight = inferEffectiveWeightKg(rawName, row.weight_kg, bodyweightKg);
    const reps = row.reps ?? 0;
    exerciseVolumeById.set(row.exercise_id, current + weight * reps);
  }

  const directMappings = new Map<string, Array<{ muscle_id: string; weight: number }>>();
  const fallbackByRawName = new Map<string, Map<string, number>>();

  for (const row of mappingRows.results) {
    const current = directMappings.get(row.exercise_id) ?? [];
    current.push({ muscle_id: row.muscle_id, weight: row.weight });
    directMappings.set(row.exercise_id, current);

    const fallbackKey = normalizeNameKey(row.raw_name);
    const fallback = fallbackByRawName.get(fallbackKey) ?? new Map<string, number>();
    const prevWeight = fallback.get(row.muscle_id) ?? 0;
    fallback.set(row.muscle_id, Math.max(prevWeight, row.weight));
    fallbackByRawName.set(fallbackKey, fallback);
  }

  const fatigueRawByCode = new Map<string, number>();
  const contributorsByCode = new Map<string, Map<string, number>>();
  const latestTrainedAtByCode = new Map<string, Date>();
  const unmappedCounts = new Map<string, number>();

  for (const exercise of exerciseRows.results) {
    const rawName = exercise.raw_name;
    const exerciseVolume = exerciseVolumeById.get(exercise.id) ?? 0;
    if (exerciseVolume <= 0) continue;

    const sessionMeta = sessionMetaById.get(exercise.session_id);
    if (!sessionMeta) continue;

    let mappings = directMappings.get(exercise.id);
    if (!mappings || mappings.length === 0) {
      const fallback = fallbackByRawName.get(normalizeNameKey(rawName));
      if (fallback && fallback.size > 0) {
        mappings = Array.from(fallback.entries()).map(([muscle_id, weight]) => ({ muscle_id, weight }));
      }
    }

    if (!mappings || mappings.length === 0) {
      const staticMapping = getExerciseMuscleMapping(rawName);
      if (staticMapping && staticMapping.length > 0) {
        mappings = staticMapping
          .map((m) => {
            const matchedMuscle = muscles.find((muscle) => muscle.code === m.muscle_code);
            if (!matchedMuscle) return null;
            return { muscle_id: matchedMuscle.id, weight: m.weight };
          })
          .filter((item): item is { muscle_id: string; weight: number } => Boolean(item));
      }
    }

    if (!mappings || mappings.length === 0) {
      unmappedCounts.set(rawName, (unmappedCounts.get(rawName) ?? 0) + 1);
      continue;
    }

    const sessionReference = parseSessionTimestamp(sessionMeta.date, sessionMeta.started_at);
    const deltaHours = Math.max(
      0,
      (window.referenceTimeObj.getTime() - sessionReference.getTime()) / (1000 * 60 * 60)
    );

    for (const mapping of mappings) {
      const muscle = muscleById.get(mapping.muscle_id);
      if (!muscle) continue;

      const restHours = restSettings[muscle.code] ?? defaultRestHoursForMuscle(muscle.code);
      const decay = recoveryDecayFactor(deltaHours, restHours);
      const decayed = exerciseVolume * mapping.weight * decay;

      fatigueRawByCode.set(muscle.code, (fatigueRawByCode.get(muscle.code) ?? 0) + decayed);

      const contribMap = contributorsByCode.get(muscle.code) ?? new Map<string, number>();
      contribMap.set(rawName, (contribMap.get(rawName) ?? 0) + decayed);
      contributorsByCode.set(muscle.code, contribMap);

      const prevLatest = latestTrainedAtByCode.get(muscle.code);
      if (!prevLatest || sessionReference.getTime() > prevLatest.getTime()) {
        latestTrainedAtByCode.set(muscle.code, sessionReference);
      }
    }
  }

  const musclesResponse = Object.fromEntries(
    muscles.map((muscle) => {
      const fatigueRaw = fatigueRawByCode.get(muscle.code) ?? 0;
      const fatigue = Math.min(100, fatigueRaw / FATIGUE_SCALE);
      const recovery = Math.max(0, Math.min(100, 100 - fatigue));
      const defaultHours = defaultRestHoursForMuscle(muscle.code);
      const configuredHours = restSettings[muscle.code] ?? defaultHours;
      const lastTrained = latestTrainedAtByCode.get(muscle.code) ?? null;
      const nextTrain = lastTrained ? new Date(lastTrained.getTime() + configuredHours * 60 * 60 * 1000) : null;
      const remainingHours = nextTrain
        ? Math.max(0, (nextTrain.getTime() - window.referenceTimeObj.getTime()) / (1000 * 60 * 60))
        : 0;

      return [
        muscle.code,
        {
          name: muscle.name,
          fatigue_raw: Number(fatigueRaw.toFixed(2)),
          fatigue: Number(fatigue.toFixed(2)),
          recovery: Number(recovery.toFixed(2)),
          status: statusColor(recovery),
          default_rest_hours: Number(defaultHours.toFixed(2)),
          rest_hours: Number(configuredHours.toFixed(2)),
          last_trained_at: lastTrained ? lastTrained.toISOString() : null,
          next_train_at: nextTrain ? nextTrain.toISOString() : null,
          remaining_hours: Number(remainingHours.toFixed(2)),
          contributors: topContributors(contributorsByCode.get(muscle.code) ?? new Map<string, number>(), 2),
        },
      ];
    })
  );

  const unmappedExercises = Array.from(unmappedCounts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([raw_name, count]) => ({ raw_name, count }));

  return {
    window: {
      days: window.days,
      from: window.fromDate,
      to: window.toDate,
      reference_at: window.referenceTimeObj.toISOString(),
    },
    bodyweight_kg: bodyweightKg,
    recovery_settings: restSettings,
    muscles: musclesResponse,
    trainer_advice: buildTrainerAdvice(
      Object.fromEntries(
        Object.entries(musclesResponse).map(([code, value]) => [
          code,
          {
            name: String((value as { name?: string }).name || code),
            recovery: Number((value as { recovery: number }).recovery || 0),
            status: String((value as { status: string }).status || ""),
            remaining_hours: Number((value as { remaining_hours: number }).remaining_hours || 0),
            next_train_at: (value as { next_train_at: string | null }).next_train_at,
          },
        ])
      ),
      window.referenceTimeObj.toISOString()
    ),
    unmapped_exercises: unmappedExercises,
  };
}
