import uuid
from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.models import Exercise, ExerciseSet, WorkoutSession


def _build_test_app(tmp_path: Path):
    db_path = tmp_path / "recovery_api_hardening.db"
    app = create_app(
        database_url=f"sqlite:///{db_path}",
        enqueue_func=lambda _: "job-test",
        upload_dir=str(tmp_path / "uploads"),
        auto_migrate=True,
    )
    return app


def _insert_exercise_session(
    app,
    *,
    session_date: date,
    raw_name: str,
    sets: list[tuple[float, int]],
) -> None:
    db = app.state.session_factory()
    try:
        session_row = WorkoutSession(
            id=uuid.uuid4(),
            upload_id=None,
            date=session_date,
            calories_kcal=None,
            duration_min=None,
            volume_kg=None,
        )
        db.add(session_row)
        db.flush()

        exercise = Exercise(
            id=uuid.uuid4(),
            session_id=session_row.id,
            raw_name=raw_name,
            order_index=1,
        )
        db.add(exercise)
        db.flush()

        for index, (weight, reps) in enumerate(sets, start=1):
            db.add(
                ExerciseSet(
                    id=uuid.uuid4(),
                    exercise_id=exercise.id,
                    set_index=index,
                    weight_kg=weight,
                    reps=reps,
                )
            )
        db.commit()
    finally:
        db.close()


def test_mapped_exercise_increases_fatigue(tmp_path: Path) -> None:
    app = _build_test_app(tmp_path)
    _insert_exercise_session(
        app,
        session_date=date(2026, 2, 7),
        raw_name="바벨 플랫 벤치 프레스",
        sets=[(80.0, 10), (80.0, 8)],
    )
    client = TestClient(app)

    response = client.get("/api/recovery", params={"from": "2026-02-01", "to": "2026-02-08"})
    assert response.status_code == 200
    payload = response.json()

    chest = payload["muscles"]["chest"]
    assert chest["fatigue"] > 0
    assert any(item["raw_name"] == "바벨 플랫 벤치 프레스" for item in chest["contributors"])


def test_unmapped_exercise_tracked(tmp_path: Path) -> None:
    app = _build_test_app(tmp_path)
    _insert_exercise_session(
        app,
        session_date=date(2026, 2, 7),
        raw_name="UNKNOWN_EXERCISE_XYZ",
        sets=[(50.0, 10)],
    )
    client = TestClient(app)

    response = client.get("/api/recovery", params={"from": "2026-02-01", "to": "2026-02-08"})
    assert response.status_code == 200
    payload = response.json()

    assert any(item["raw_name"] == "UNKNOWN_EXERCISE_XYZ" and item["count"] >= 1 for item in payload["unmapped_exercises"])


def test_seed_session_excluded_from_recovery(tmp_path: Path) -> None:
    app = _build_test_app(tmp_path)
    # Very large seed-date load (must be excluded).
    _insert_exercise_session(
        app,
        session_date=date(1970, 1, 1),
        raw_name="덤벨 인클라인 벤치 프레스",
        sets=[(200.0, 50), (180.0, 50)],
    )
    # Light nearby load (should be the effective contributor).
    _insert_exercise_session(
        app,
        session_date=date(1970, 1, 2),
        raw_name="바벨 플랫 벤치 프레스",
        sets=[(20.0, 10)],
    )
    client = TestClient(app)

    response = client.get("/api/recovery", params={"from": "1969-12-31", "to": "1970-01-03"})
    assert response.status_code == 200
    payload = response.json()

    chest = payload["muscles"]["chest"]
    assert chest["fatigue"] > 0
    assert chest["fatigue"] < 10
    assert not any(item["raw_name"] == "덤벨 인클라인 벤치 프레스" for item in chest["contributors"])


def test_decay_sanity_with_old_and_recent_sessions(tmp_path: Path) -> None:
    app = _build_test_app(tmp_path)
    _insert_exercise_session(
        app,
        session_date=date(2026, 2, 1),
        raw_name="덤벨 인클라인 벤치 프레스",
        sets=[(100.0, 12), (90.0, 10)],
    )
    _insert_exercise_session(
        app,
        session_date=date(2026, 2, 7),
        raw_name="바벨 플랫 벤치 프레스",
        sets=[(40.0, 10)],
    )
    client = TestClient(app)

    response = client.get("/api/recovery", params={"from": "2026-01-30", "to": "2026-02-08"})
    assert response.status_code == 200
    payload = response.json()

    chest = payload["muscles"]["chest"]
    assert chest["fatigue"] > 0
    assert len(chest["contributors"]) >= 1
