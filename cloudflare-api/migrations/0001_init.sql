CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  status TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  queue_job_id TEXT,
  error_message TEXT,
  ocr_text_raw TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at);
CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  upload_id TEXT,
  date TEXT NOT NULL,
  started_at TEXT,
  calories_kcal INTEGER,
  duration_min INTEGER,
  volume_kg INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
CREATE INDEX IF NOT EXISTS idx_sessions_upload_id ON sessions(upload_id);

CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  raw_name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_exercises_session_id ON exercises(session_id);

CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL,
  set_index INTEGER NOT NULL,
  weight_kg REAL,
  reps INTEGER NOT NULL,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id)
);
CREATE INDEX IF NOT EXISTS idx_sets_exercise_id ON sets(exercise_id);

CREATE TABLE IF NOT EXISTS muscle_groups (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_muscle_groups_code ON muscle_groups(code);

CREATE TABLE IF NOT EXISTS exercise_muscles (
  exercise_id TEXT NOT NULL,
  muscle_id TEXT NOT NULL,
  weight REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (exercise_id, muscle_id),
  FOREIGN KEY(exercise_id) REFERENCES exercises(id),
  FOREIGN KEY(muscle_id) REFERENCES muscle_groups(id)
);
CREATE INDEX IF NOT EXISTS ix_exercise_muscles_muscle_id ON exercise_muscles(muscle_id);

INSERT OR IGNORE INTO muscle_groups (id, code, name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'chest', 'Chest'),
  ('22222222-2222-4222-8222-222222222222', 'back', 'Back'),
  ('33333333-3333-4333-8333-333333333333', 'legs', 'Legs'),
  ('44444444-4444-4444-8444-444444444444', 'shoulders', 'Shoulders'),
  ('55555555-5555-4555-8555-555555555555', 'biceps', 'Biceps'),
  ('66666666-6666-4666-8666-666666666666', 'triceps', 'Triceps'),
  ('77777777-7777-4777-8777-777777777777', 'core', 'Core'),
  ('88888888-8888-4888-8888-888888888888', 'cardio', 'Cardio');

INSERT OR IGNORE INTO sessions (id, upload_id, date, started_at, calories_kcal, duration_min, volume_kg, created_at)
VALUES ('99999999-9999-4999-8999-999999999999', NULL, '1970-01-01', '1970-01-01T12:00:00.000Z', NULL, NULL, NULL, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO exercises (id, session_id, raw_name, order_index) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '99999999-9999-4999-8999-999999999999', '바벨 플랫 벤치 프레스', 1),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '99999999-9999-4999-8999-999999999999', '덤벨 인클라인 벤치 프레스', 2),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '99999999-9999-4999-8999-999999999999', '풀 업', 3),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '99999999-9999-4999-8999-999999999999', '덤벨 바이셉 컬', 4),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', '99999999-9999-4999-8999-999999999999', '스쿼트', 5),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', '99999999-9999-4999-8999-999999999999', '데드리프트', 6),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7', '99999999-9999-4999-8999-999999999999', '숄더 프레스', 7),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8', '99999999-9999-4999-8999-999999999999', '런닝', 8);

INSERT OR IGNORE INTO exercise_muscles (exercise_id, muscle_id, weight) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 0.6),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '66666666-6666-4666-8666-666666666666', 0.2),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '44444444-4444-4444-8444-444444444444', 0.2),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '11111111-1111-4111-8111-111111111111', 0.5),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '44444444-4444-4444-8444-444444444444', 0.3),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '66666666-6666-4666-8666-666666666666', 0.2),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '22222222-2222-4222-8222-222222222222', 0.7),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '55555555-5555-4555-8555-555555555555', 0.3),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '55555555-5555-4555-8555-555555555555', 1.0),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', '33333333-3333-4333-8333-333333333333', 0.8),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', '77777777-7777-4777-8777-777777777777', 0.2),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', '33333333-3333-4333-8333-333333333333', 0.5),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', '22222222-2222-4222-8222-222222222222', 0.3),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', '77777777-7777-4777-8777-777777777777', 0.2),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7', '44444444-4444-4444-8444-444444444444', 0.7),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7', '66666666-6666-4666-8666-666666666666', 0.3),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8', '88888888-8888-4888-8888-888888888888', 0.6),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8', '33333333-3333-4333-8333-333333333333', 0.4);
