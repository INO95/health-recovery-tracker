-- Runtime support tables moved out of request path.
-- Apply after 0001_init.sql.

CREATE TABLE IF NOT EXISTS user_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO user_settings (key, value, updated_at)
VALUES ('bodyweight_kg', '70', CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS exercise_alias_overrides (
  id TEXT PRIMARY KEY,
  alias_raw TEXT NOT NULL,
  alias_key TEXT NOT NULL UNIQUE,
  canonical_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exercise_alias_overrides_created_at
ON exercise_alias_overrides(created_at);

CREATE TABLE IF NOT EXISTS recovery_settings (
  muscle_code TEXT PRIMARY KEY,
  rest_hours REAL NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO recovery_settings (muscle_code, rest_hours, updated_at) VALUES
  ('chest', 60, CURRENT_TIMESTAMP),
  ('back', 60, CURRENT_TIMESTAMP),
  ('shoulders', 60, CURRENT_TIMESTAMP),
  ('legs', 60, CURRENT_TIMESTAMP),
  ('core', 60, CURRENT_TIMESTAMP),
  ('biceps', 36, CURRENT_TIMESTAMP),
  ('triceps', 36, CURRENT_TIMESTAMP),
  ('cardio', 24, CURRENT_TIMESTAMP);

-- Keep historical rows query-safe.
UPDATE sessions
SET started_at = date || 'T12:00:00.000Z'
WHERE started_at IS NULL;
