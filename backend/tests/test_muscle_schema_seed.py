from pathlib import Path

from sqlalchemy import text

from app.database import build_engine
from app.migrate import run_migrations


def _prepare_db(tmp_path: Path):
    db_path = tmp_path / "muscle_seed_test.db"
    engine = build_engine(f"sqlite:///{db_path}")
    run_migrations(engine)
    return engine


def test_muscle_groups_seeded_codes_exist(tmp_path: Path) -> None:
    engine = _prepare_db(tmp_path)
    expected_codes = {"chest", "back", "legs", "shoulders", "biceps", "triceps", "core", "cardio"}
    with engine.begin() as conn:
        rows = conn.execute(text("SELECT code FROM muscle_groups")).fetchall()
    codes = {row[0] for row in rows}
    assert expected_codes.issubset(codes)


def test_exercise_muscles_seeded_mappings_exist(tmp_path: Path) -> None:
    engine = _prepare_db(tmp_path)
    with engine.begin() as conn:
        count_row = conn.execute(text("SELECT COUNT(*) FROM exercise_muscles")).scalar_one()
        bench_row = conn.execute(
            text(
                """
                SELECT COUNT(*)
                FROM exercise_muscles em
                JOIN exercises e ON e.id = em.exercise_id
                WHERE e.raw_name = :name
                """
            ),
            {"name": "바벨 플랫 벤치 프레스"},
        ).scalar_one()
    assert count_row >= 6
    assert bench_row >= 1
