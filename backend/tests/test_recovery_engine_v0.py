import uuid
from datetime import date
from pathlib import Path

from app.database import build_engine, build_session_factory
from app.migrate import run_migrations
from app.models import Exercise, ExerciseSet, WorkoutSession
from app.services.recovery_engine_v0 import compute_recovery_v0


def _prepare_db(tmp_path: Path):
    db_path = tmp_path / "recovery_engine_test.db"
    engine = build_engine(f"sqlite:///{db_path}")
    run_migrations(engine)
    session_factory = build_session_factory(engine)
    return session_factory


def test_recovery_returns_default_scores_when_no_recent_sessions(tmp_path: Path) -> None:
    session_factory = _prepare_db(tmp_path)
    db = session_factory()
    try:
        result = compute_recovery_v0(db, days=7)
    finally:
        db.close()

    assert "muscles" in result
    assert "legs" in result["muscles"]
    assert result["window"]["days"] == 7
    assert result["muscles"]["legs"]["recovery"] == 100.0
    assert result["muscles"]["legs"]["status"] == "green"


def test_recovery_uses_raw_name_fallback_mapping(tmp_path: Path) -> None:
    session_factory = _prepare_db(tmp_path)
    db = session_factory()
    try:
        session_row = WorkoutSession(
            id=uuid.uuid4(),
            upload_id=None,
            date=date.today(),
            calories_kcal=200,
            duration_min=40,
            volume_kg=2000,
        )
        db.add(session_row)
        db.flush()

        # New exercise id without direct exercise_muscles rows.
        exercise_row = Exercise(
            id=uuid.uuid4(),
            session_id=session_row.id,
            raw_name="스쿼트",
            order_index=1,
        )
        db.add(exercise_row)
        db.flush()

        db.add(
            ExerciseSet(
                id=uuid.uuid4(),
                exercise_id=exercise_row.id,
                set_index=1,
                weight_kg=100.0,
                reps=10,
            )
        )
        db.commit()

        result = compute_recovery_v0(db, days=7)
    finally:
        db.close()

    legs = result["muscles"]["legs"]
    assert legs["fatigue"] > 0
    assert any(item["raw_name"] == "스쿼트" for item in legs["contributors"])
    assert not any(item["raw_name"] == "스쿼트" for item in result["unmapped_exercises"])
