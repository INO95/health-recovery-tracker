REVISION = "0005_add_sessions_and_ocr_text"


def _sqlite_has_column(conn, table_name: str, column_name: str) -> bool:
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(r[1] == column_name for r in rows)


def _sqlite_uuid_sql() -> str:
    return (
        "lower(hex(randomblob(4))) || '-' || "
        "lower(hex(randomblob(2))) || '-' || "
        "'4' || substr(lower(hex(randomblob(2))), 2) || '-' || "
        "substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || "
        "lower(hex(randomblob(6)))"
    )


def _sqlite_upgrade(conn) -> None:
    if not _sqlite_has_column(conn, "uploads", "ocr_text_raw"):
        conn.exec_driver_sql("ALTER TABLE uploads ADD COLUMN ocr_text_raw TEXT")

    conn.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            upload_id TEXT,
            date TEXT NOT NULL,
            calories_kcal INTEGER,
            duration_min INTEGER,
            volume_kg INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date)")
    conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_sessions_upload_id ON sessions(upload_id)")

    conn.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS exercises (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            raw_name TEXT NOT NULL,
            order_index INTEGER NOT NULL,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        )
        """
    )
    conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_exercises_session_id ON exercises(session_id)")

    conn.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS sets (
            id TEXT PRIMARY KEY,
            exercise_id TEXT NOT NULL,
            set_index INTEGER NOT NULL,
            weight_kg REAL,
            reps INTEGER NOT NULL,
            FOREIGN KEY(exercise_id) REFERENCES exercises(id)
        )
        """
    )
    conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_sets_exercise_id ON sets(exercise_id)")

    conn.exec_driver_sql(f"UPDATE sessions SET id = {_sqlite_uuid_sql()} WHERE id IS NULL OR id = ''")
    conn.exec_driver_sql(f"UPDATE exercises SET id = {_sqlite_uuid_sql()} WHERE id IS NULL OR id = ''")
    conn.exec_driver_sql(f"UPDATE sets SET id = {_sqlite_uuid_sql()} WHERE id IS NULL OR id = ''")


def _postgres_upgrade(conn) -> None:
    conn.exec_driver_sql('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')
    conn.exec_driver_sql("ALTER TABLE uploads ADD COLUMN IF NOT EXISTS ocr_text_raw TEXT")

    conn.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            upload_id UUID REFERENCES uploads(id),
            date DATE NOT NULL,
            calories_kcal INTEGER,
            duration_min INTEGER,
            volume_kg INTEGER,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date)")
    conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_sessions_upload_id ON sessions(upload_id)")

    conn.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS exercises (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES sessions(id),
            raw_name VARCHAR(255) NOT NULL,
            order_index INTEGER NOT NULL
        )
        """
    )
    conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_exercises_session_id ON exercises(session_id)")

    conn.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS sets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            exercise_id UUID NOT NULL REFERENCES exercises(id),
            set_index INTEGER NOT NULL,
            weight_kg DOUBLE PRECISION,
            reps INTEGER NOT NULL
        )
        """
    )
    conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_sets_exercise_id ON sets(exercise_id)")


def upgrade(conn, dialect_name: str) -> None:
    if dialect_name == "sqlite":
        _sqlite_upgrade(conn)
        return
    _postgres_upgrade(conn)
