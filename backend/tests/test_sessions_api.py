import uuid
from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.models import Exercise, ExerciseSet, WorkoutSession


def _build_test_app(tmp_path: Path):
    db_path = tmp_path / "sessions_api.db"
    app = create_app(
        database_url=f"sqlite:///{db_path}",
        enqueue_func=lambda _: "job-test",
        upload_dir=str(tmp_path / "uploads"),
        auto_migrate=True,
    )
    return app


def _seed_session(app, session_date: date, calories: int, duration: int, volume: int) -> uuid.UUID:
    session_factory = app.state.session_factory
    db = session_factory()
    try:
        session_row = WorkoutSession(
            id=uuid.uuid4(),
            upload_id=uuid.uuid4(),
            date=session_date,
            calories_kcal=calories,
            duration_min=duration,
            volume_kg=volume,
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
                weight_kg=20.0,
                reps=12,
            )
        )
        db.commit()
        return session_row.id
    finally:
        db.close()


def test_list_sessions_filters_and_sorts_desc(tmp_path: Path) -> None:
    app = _build_test_app(tmp_path)
    client = TestClient(app)

    old_id = _seed_session(app, date(2026, 2, 1), 180, 45, 5200)
    new_id = _seed_session(app, date(2026, 2, 7), 238, 54, 7402)
    assert old_id != new_id

    response = client.get("/api/sessions", params={"from": "2026-02-02", "to": "2026-02-28", "limit": 50})
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["id"] == str(new_id)
    assert items[0]["date"] == "2026-02-07"


def test_get_session_detail_includes_exercises_and_sets(tmp_path: Path) -> None:
    app = _build_test_app(tmp_path)
    client = TestClient(app)

    session_id = _seed_session(app, date(2026, 2, 7), 238, 54, 7402)
    response = client.get(f"/api/sessions/{session_id}")
    assert response.status_code == 200
    payload = response.json()

    assert payload["id"] == str(session_id)
    assert payload["calories_kcal"] == 238
    assert len(payload["exercises"]) == 1
    assert payload["exercises"][0]["raw_name"] == "바벨 플랫 벤치 프레스"
    assert len(payload["exercises"][0]["sets"]) == 1
    assert payload["exercises"][0]["sets"][0]["set_index"] == 1
    assert payload["exercises"][0]["sets"][0]["weight_kg"] == 20.0
    assert payload["exercises"][0]["sets"][0]["reps"] == 12
