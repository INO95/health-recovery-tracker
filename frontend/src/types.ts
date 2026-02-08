export type UploadResponse = {
  id: string;
  status: string;
  storage_path: string;
  queue_job_id?: string | null;
};

export type SessionListItem = {
  id: string;
  date: string;
  calories_kcal: number | null;
  duration_min: number | null;
  volume_kg: number | null;
  upload_id: string | null;
};

export type SessionSet = {
  id: string;
  set_index: number;
  weight_kg: number | null;
  reps: number;
};

export type SessionExercise = {
  id: string;
  raw_name: string;
  order_index: number;
  sets: SessionSet[];
};

export type SessionDetail = {
  id: string;
  date: string;
  calories_kcal: number | null;
  duration_min: number | null;
  volume_kg: number | null;
  upload_id: string | null;
  exercises: SessionExercise[];
};

export type RecoveryContributor = {
  raw_name: string;
  contribution: number;
};

export type RecoveryMuscle = {
  name?: string;
  recovery: number;
  fatigue: number;
  fatigue_raw: number;
  status: "green" | "yellow" | "red" | string;
  contributors: RecoveryContributor[];
};

export type RecoveryResponse = {
  window: {
    days: number;
    from: string;
    to: string;
  };
  muscles: Record<string, RecoveryMuscle>;
  unmapped_exercises: Array<{
    raw_name: string;
    count: number;
  }>;
};
