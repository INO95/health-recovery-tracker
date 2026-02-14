export type UploadResponse = {
  id: string;
  status: string;
  storage_path: string;
  queue_job_id?: string | null;
  error_message?: string | null;
  parse_warnings?: string[];
};

export type ExerciseAliasOverride = {
  id: string;
  alias_raw: string;
  alias_key: string;
  canonical_name: string;
  created_at: string;
};

export type OcrNormalizeResponse = {
  normalized_text: string;
  confidence: number;
  needs_review: boolean;
  warnings: string[];
};

export type SessionListItem = {
  id: string;
  date: string;
  started_at: string | null;
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
  started_at: string | null;
  calories_kcal: number | null;
  duration_min: number | null;
  volume_kg: number | null;
  upload_id: string | null;
  exercises: SessionExercise[];
};

export type SessionUpdatePayload = {
  date: string;
  started_at: string | null;
  calories_kcal: number | null;
  duration_min: number | null;
  volume_kg: number | null;
  exercises: Array<{
    raw_name: string;
    order_index?: number;
    sets: Array<{
      set_index?: number;
      weight_kg: number | null;
      reps: number;
    }>;
  }>;
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
  default_rest_hours: number;
  rest_hours: number;
  last_trained_at: string | null;
  next_train_at: string | null;
  remaining_hours: number;
  contributors: RecoveryContributor[];
};

export type RecoveryResponse = {
  window: {
    days: number;
    from: string;
    to: string;
    reference_at?: string;
  };
  recovery_settings?: Record<string, number>;
  trainer_advice?: {
    summary: string;
    recommend_train: string[];
    recommend_light: string[];
    recommend_rest: string[];
    message_train: string;
    message_rest: string;
    message_timing: string;
  };
  muscles: Record<string, RecoveryMuscle>;
  unmapped_exercises: Array<{
    raw_name: string;
    count: number;
  }>;
};

export type RecoverySettingsResponse = {
  settings: Record<string, number>;
};

export type BodyweightResponse = {
  bodyweight_kg: number;
};

export type ApiErrorResponse = {
  detail: string;
  code?: string;
  request_id?: string;
};
