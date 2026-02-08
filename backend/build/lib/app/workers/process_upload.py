import os
import uuid
from pathlib import Path
from typing import Dict

from sqlalchemy.orm import Session

from app.database import build_engine, build_session_factory, resolve_database_url
from app.models import Upload


def _update_to_failed(session: Session, upload: Upload, message: str) -> None:
    upload.status = "failed"
    upload.error_message = message
    session.commit()
    session.refresh(upload)


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

        if Path(storage_path).exists():
            upload.status = "parsed"
            upload.error_message = None
            session.commit()
            session.refresh(upload)
            return {"upload_id": str(upload.id), "status": upload.status}

        _update_to_failed(session, upload, "file not found")
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

