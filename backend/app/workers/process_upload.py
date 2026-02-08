import os
import uuid
from datetime import date
from pathlib import Path
from typing import Dict

from sqlalchemy.orm import Session

from app.database import build_engine, build_session_factory, resolve_database_url
from app.models import Exercise, ExerciseSet, Upload, WorkoutSession
from app.services.parser import parse_fleek_ocr_v1


def _update_to_failed(session: Session, upload: Upload, message: str) -> None:
    upload.status = "failed"
    upload.error_message = message
    session.commit()
    session.refresh(upload)


def _save_parsed_session(session: Session, upload: Upload, parsed: Dict) -> None:
    summary = parsed.get("summary", {}) or {}
    parsed_date = summary.get("date")
    if not parsed_date:
        raise ValueError("summary_date_missing")

    session_date = date.fromisoformat(parsed_date)
    workout_session = WorkoutSession(
        upload_id=upload.id,
        date=session_date,
        calories_kcal=summary.get("calories_kcal"),
        duration_min=summary.get("duration_min"),
        volume_kg=summary.get("volume_kg"),
    )
    session.add(workout_session)
    session.flush()

    exercises = parsed.get("exercises", []) or []
    for exercise_index, exercise_data in enumerate(exercises, start=1):
        exercise = Exercise(
            session_id=workout_session.id,
            raw_name=str(exercise_data.get("raw_name", "")).strip() or f"exercise_{exercise_index}",
            order_index=exercise_index,
        )
        session.add(exercise)
        session.flush()

        set_rows = exercise_data.get("sets", []) or []
        for set_index, set_data in enumerate(set_rows, start=1):
            set_row = ExerciseSet(
                exercise_id=exercise.id,
                set_index=set_index,
                weight_kg=set_data.get("weight_kg"),
                reps=int(set_data.get("reps", 0)),
            )
            session.add(set_row)


def process_upload_job(payload: Dict, database_url: str = "") -> Dict[str, str]:
    resolved_database_url = resolve_database_url(database_url)
    engine = build_engine(resolved_database_url)
    session_factory = build_session_factory(engine)
    session = session_factory()
    upload = None
    try:
        upload_id = str(payload.get("upload_id", "")).strip()
        storage_path = str(payload.get("storage_path", "")).strip()
        if not upload_id:
            raise ValueError("upload_id_missing")

        parsed_upload_id = uuid.UUID(upload_id)
        upload = session.get(Upload, parsed_upload_id)
        if upload is None:
            raise ValueError("upload_not_found")

        upload.status = "processing"
        upload.error_message = None
        session.commit()
        session.refresh(upload)

        if not Path(storage_path).exists():
            _update_to_failed(session, upload, "file not found")
            return {"upload_id": str(upload.id), "status": upload.status}

        raw_text = str(getattr(upload, "ocr_text_raw", "") or payload.get("ocr_text_raw", "")).strip()
        if not raw_text:
            _update_to_failed(session, upload, "no ocr text")
            return {"upload_id": str(upload.id), "status": upload.status}

        parsed = parse_fleek_ocr_v1(raw_text)
        meta = parsed.get("meta", {}) or {}
        if bool(meta.get("needs_review")):
            warning_text = ", ".join(meta.get("warnings", []) or [])
            message = f"needs review: {warning_text}" if warning_text else "needs review"
            _update_to_failed(session, upload, message[:500])
            return {"upload_id": str(upload.id), "status": upload.status}

        _save_parsed_session(session, upload, parsed)
        upload.status = "parsed"
        upload.error_message = None
        session.commit()
        session.refresh(upload)
        return {"upload_id": str(upload.id), "status": upload.status}
    except Exception as exc:
        if upload is not None:
            session.rollback()
            _update_to_failed(session, upload, str(exc)[:500] or "unknown_error")
        raise
    finally:
        session.close()


def main() -> None:
    # TODO: TC-06 이후에는 파서 실행 통계를 함께 출력한다.
    sample_payload = {
        "upload_id": os.getenv("UPLOAD_ID", ""),
        "storage_path": os.getenv("UPLOAD_STORAGE_PATH", ""),
        "parser_version": os.getenv("PARSER_VERSION", "tc04-parser-v1"),
    }
    process_upload_job(sample_payload)


if __name__ == "__main__":
    main()
