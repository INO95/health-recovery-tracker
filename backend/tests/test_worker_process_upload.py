import uuid
from pathlib import Path

from sqlalchemy import select

from app.database import build_engine, build_session_factory
from app.migrate import run_migrations
from app.models import Exercise, ExerciseSet, Upload, WorkoutSession
from app.workers.process_upload import process_upload_job


def _make_db(tmp_path: Path):
    db_path = tmp_path / "worker_test.db"
    database_url = f"sqlite:///{db_path}"
    engine = build_engine(database_url)
    run_migrations(engine)
    session_factory = build_session_factory(engine)
    return database_url, session_factory


def test_worker_marks_upload_as_parsed_when_file_exists(tmp_path: Path) -> None:
    database_url, session_factory = _make_db(tmp_path)
    upload_id = uuid.uuid4()
    file_path = tmp_path / "uploads" / f"{upload_id}.png"
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(b"png-bytes")

    session = session_factory()
    upload = Upload(
        id=upload_id,
        filename="test.png",
        original_filename="test.png",
        content_type="image/png",
        size_bytes=9,
        status="pending",
        storage_path=str(file_path),
        parser_version="tc04-parser-v1",
        ocr_text_raw="""
2026.02.07
200 KCAL 40 min 3000 kg
1 EXERCISES 2 sets 20 reps 75 kg/min
스쿼트
20 40
10X 10X
""",
    )
    session.add(upload)
    session.commit()
    session.close()

    process_upload_job(
        {"upload_id": str(upload_id), "storage_path": str(file_path), "parser_version": "tc04-parser-v1"},
        database_url=database_url,
    )

    session = session_factory()
    row = session.execute(select(Upload).where(Upload.id == upload_id)).scalar_one()
    assert row.status == "parsed"
    assert row.error_message in (None, "")
    session.close()


def test_worker_marks_upload_as_failed_when_file_missing(tmp_path: Path) -> None:
    database_url, session_factory = _make_db(tmp_path)
    upload_id = uuid.uuid4()
    missing_file = tmp_path / "uploads" / f"{upload_id}.png"

    session = session_factory()
    upload = Upload(
        id=upload_id,
        filename="missing.png",
        original_filename="missing.png",
        content_type="image/png",
        size_bytes=1,
        status="pending",
        storage_path=str(missing_file),
        parser_version="tc04-parser-v1",
    )
    session.add(upload)
    session.commit()
    session.close()

    process_upload_job(
        {"upload_id": str(upload_id), "storage_path": str(missing_file), "parser_version": "tc04-parser-v1"},
        database_url=database_url,
    )

    session = session_factory()
    row = session.execute(select(Upload).where(Upload.id == upload_id)).scalar_one()
    assert row.status == "failed"
    assert row.error_message == "file not found"
    session.close()


def test_worker_persists_parsed_session_from_ocr_text(tmp_path: Path) -> None:
    database_url, session_factory = _make_db(tmp_path)
    upload_id = uuid.uuid4()
    file_path = tmp_path / "uploads" / f"{upload_id}.png"
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(b"png-bytes")

    ocr_text = """
2026.02.07
238 KCAL 54 min 7402 kg
1 EXERCISES 4 sets 32 reps 137 kg/min

바벨 플랫 벤치 프레스
MAX Weight: 60kg | 1RM: 81kg
20 40 60 60
12X 10X 5X 5X
"""

    session = session_factory()
    upload = Upload(
        id=upload_id,
        filename="test.png",
        original_filename="test.png",
        content_type="image/png",
        size_bytes=9,
        status="pending",
        storage_path=str(file_path),
        parser_version="tc04-parser-v1",
        ocr_text_raw=ocr_text,
    )
    session.add(upload)
    session.commit()
    session.close()

    result = process_upload_job(
        {"upload_id": str(upload_id), "storage_path": str(file_path), "parser_version": "tc04-parser-v1"},
        database_url=database_url,
    )
    assert result["status"] == "parsed"

    session = session_factory()
    upload_row = session.execute(select(Upload).where(Upload.id == upload_id)).scalar_one()
    assert upload_row.status == "parsed"

    session_row = session.execute(select(WorkoutSession).where(WorkoutSession.upload_id == upload_id)).scalar_one()
    assert str(session_row.date) == "2026-02-07"
    assert session_row.calories_kcal == 238
    assert session_row.duration_min == 54
    assert session_row.volume_kg == 7402

    exercise_rows = (
        session.execute(select(Exercise).where(Exercise.session_id == session_row.id).order_by(Exercise.order_index)).scalars().all()
    )
    assert len(exercise_rows) == 1
    assert exercise_rows[0].raw_name == "바벨 플랫 벤치 프레스"

    set_rows = (
        session.execute(select(ExerciseSet).where(ExerciseSet.exercise_id == exercise_rows[0].id).order_by(ExerciseSet.set_index))
        .scalars()
        .all()
    )
    assert len(set_rows) == 4
    assert [float(row.weight_kg) for row in set_rows] == [20.0, 40.0, 60.0, 60.0]
    assert [row.reps for row in set_rows] == [12, 10, 5, 5]
    session.close()
