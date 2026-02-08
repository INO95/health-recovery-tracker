import uuid

from sqlalchemy import text

REVISION = "0006_add_muscle_groups_and_exercise_muscles"

MUSCLE_GROUPS = [
    ("chest", "Chest"),
    ("back", "Back"),
    ("legs", "Legs"),
    ("shoulders", "Shoulders"),
    ("biceps", "Biceps"),
    ("triceps", "Triceps"),
    ("core", "Core"),
    ("cardio", "Cardio"),
]

EXERCISE_MUSCLE_MAPPINGS = {
    "바벨 플랫 벤치 프레스": [("chest", 0.6), ("triceps", 0.2), ("shoulders", 0.2)],
    "덤벨 인클라인 벤치 프레스": [("chest", 0.5), ("shoulders", 0.3), ("triceps", 0.2)],
    "풀 업": [("back", 0.7), ("biceps", 0.3)],
    "덤벨 바이셉 컬": [("biceps", 1.0)],
    "스쿼트": [("legs", 0.8), ("core", 0.2)],
    "데드리프트": [("legs", 0.5), ("back", 0.3), ("core", 0.2)],
    "숄더 프레스": [("shoulders", 0.7), ("triceps", 0.3)],
    "런닝": [("cardio", 0.6), ("legs", 0.4)],
}

SEED_SESSION_DATE = "1970-01-01"


def _create_tables_sqlite(conn) -> None:
    conn.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS muscle_groups (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ux_muscle_groups_code ON muscle_groups(code)")

    conn.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS exercise_muscles (
            exercise_id TEXT NOT NULL,
            muscle_id TEXT NOT NULL,
            weight REAL NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (exercise_id, muscle_id),
            FOREIGN KEY(exercise_id) REFERENCES exercises(id),
            FOREIGN KEY(muscle_id) REFERENCES muscle_groups(id)
        )
        """
    )
    conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_exercise_muscles_muscle_id ON exercise_muscles(muscle_id)")


def _create_tables_postgres(conn) -> None:
    conn.exec_driver_sql('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')
    conn.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS muscle_groups (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code VARCHAR(64) NOT NULL,
            name VARCHAR(128) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ux_muscle_groups_code ON muscle_groups(code)")

    conn.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS exercise_muscles (
            exercise_id UUID NOT NULL REFERENCES exercises(id),
            muscle_id UUID NOT NULL REFERENCES muscle_groups(id),
            weight DOUBLE PRECISION NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (exercise_id, muscle_id)
        )
        """
    )
    conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_exercise_muscles_muscle_id ON exercise_muscles(muscle_id)")


def _seed_muscle_groups(conn) -> None:
    for code, name in MUSCLE_GROUPS:
        conn.execute(
            text(
                """
                INSERT INTO muscle_groups (id, code, name)
                SELECT :id, :code, :name
                WHERE NOT EXISTS (
                    SELECT 1 FROM muscle_groups WHERE code = :code
                )
                """
            ),
            {"id": str(uuid.uuid4()), "code": code, "name": name},
        )


def _get_or_create_seed_session_id(conn) -> str:
    existing_id = conn.execute(
        text(
            """
            SELECT id
            FROM sessions
            WHERE date = :seed_date
              AND upload_id IS NULL
              AND calories_kcal IS NULL
              AND duration_min IS NULL
              AND volume_kg IS NULL
            LIMIT 1
            """
        ),
        {"seed_date": SEED_SESSION_DATE},
    ).scalar()
    if existing_id:
        return str(existing_id)

    seed_id = str(uuid.uuid4())
    conn.execute(
        text(
            """
            INSERT INTO sessions (id, upload_id, date, calories_kcal, duration_min, volume_kg)
            VALUES (:id, NULL, :seed_date, NULL, NULL, NULL)
            """
        ),
        {"id": seed_id, "seed_date": SEED_SESSION_DATE},
    )
    return seed_id


def _get_or_create_exercise_id(conn, seed_session_id: str, raw_name: str) -> str:
    existing_id = conn.execute(
        text(
            """
            SELECT id
            FROM exercises
            WHERE raw_name = :raw_name
            ORDER BY order_index ASC
            LIMIT 1
            """
        ),
        {"raw_name": raw_name},
    ).scalar()
    if existing_id:
        return str(existing_id)

    next_order = conn.execute(
        text(
            """
            SELECT COALESCE(MAX(order_index), 0) + 1
            FROM exercises
            WHERE session_id = :session_id
            """
        ),
        {"session_id": seed_session_id},
    ).scalar_one()
    exercise_id = str(uuid.uuid4())
    conn.execute(
        text(
            """
            INSERT INTO exercises (id, session_id, raw_name, order_index)
            VALUES (:id, :session_id, :raw_name, :order_index)
            """
        ),
        {
            "id": exercise_id,
            "session_id": seed_session_id,
            "raw_name": raw_name,
            "order_index": int(next_order),
        },
    )
    return exercise_id


def _get_muscle_id(conn, code: str) -> str:
    muscle_id = conn.execute(
        text("SELECT id FROM muscle_groups WHERE code = :code LIMIT 1"),
        {"code": code},
    ).scalar()
    if not muscle_id:
        raise RuntimeError(f"missing_muscle_group:{code}")
    return str(muscle_id)


def _seed_exercise_mappings(conn) -> None:
    seed_session_id = _get_or_create_seed_session_id(conn)
    for exercise_name, mappings in EXERCISE_MUSCLE_MAPPINGS.items():
        exercise_id = _get_or_create_exercise_id(conn, seed_session_id, exercise_name)
        for muscle_code, weight in mappings:
            muscle_id = _get_muscle_id(conn, muscle_code)
            conn.execute(
                text(
                    """
                    INSERT INTO exercise_muscles (exercise_id, muscle_id, weight)
                    SELECT :exercise_id, :muscle_id, :weight
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM exercise_muscles
                        WHERE exercise_id = :exercise_id
                          AND muscle_id = :muscle_id
                    )
                    """
                ),
                {"exercise_id": exercise_id, "muscle_id": muscle_id, "weight": float(weight)},
            )


def upgrade(conn, dialect_name: str) -> None:
    if dialect_name == "sqlite":
        _create_tables_sqlite(conn)
    else:
        _create_tables_postgres(conn)

    _seed_muscle_groups(conn)
    _seed_exercise_mappings(conn)
