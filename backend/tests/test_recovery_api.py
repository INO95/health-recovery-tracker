import uuid
from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.models import Exercise, ExerciseSet, WorkoutSession


def _build_test_app(tmp_path: Path):
    db_path = tmp_path / "recovery_api.db"
    app = create_app(
        database_url=f"sqlite:///{db_path}",
        enqueue_func=lambda _: "job-test",
        upload_dir=str(tmp_path / "uploads"),
        auto_migrate=True,
    )
    return app


def _seed_mapped_session(app, session_date: date) -> None:
    db = app.state.session_factory()
    try:
        session_row = WorkoutSession(
            id=uuid.uuid4(),
            upload_id=None,
            date=session_date,
            calories_kcal=220,
            duration_min=50,
            volume_kg=6000,
        )
        db.add(session_row)
        db.flush()

        exercise = Exercise(
            id=uuid.uuid4(),
            session_id=session_row.id,
            raw_name="바벨 플랫 벤치 프레스",
            order_index=1,
        )
        db.add(exercise)
        db.flush()

        db.add(
            ExerciseSet(
                id=uuid.uuid4(),
                exercise_id=exercise.id,
                set_index=1,
                weight_kg=80.0,
                reps=10,
            )
        )
        db.commit()
    finally:
        db.close()


def test_recovery_api_returns_expected_shape(tmp_path: Path) -> None:
    app = _build_test_app(tmp_path)
    _seed_mapped_session(app, date.today())
    client = TestClient(app)

    response = client.get("/api/recovery")
    assert response.status_code == 200
    payload = response.json()

    assert "window" in payload
    assert "muscles" in payload
    assert "unmapped_exercises" in payload
    assert payload["window"]["days"] == 7
    assert isinstance(payload["muscles"], dict)


def test_recovery_api_supports_from_to_params(tmp_path: Path) -> None:
    app = _build_test_app(tmp_path)
    _seed_mapped_session(app, date(2026, 2, 7))
    client = TestClient(app)

    response = client.get("/api/recovery", params={"from": "2026-02-01", "to": "2026-02-10", "days": 3})
    assert response.status_code == 200
    payload = response.json()
    assert payload["window"]["from"] == "2026-02-01"
    assert payload["window"]["to"] == "2026-02-10"
