import os
import uuid
from typing import Callable, Dict, List

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile, status
from redis import Redis
from rq import Queue
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import build_engine, build_session_factory, get_db_session, resolve_database_url
from app.jobs import build_upload_job_payload
from app.migrate import run_migrations
from app.models import UPLOAD_STATUSES, Upload
from app.schemas import UploadOut
from app.storage import LocalStorageBackend, StorageBackend


def enqueue_upload_job(payload: Dict, redis_url: str) -> str:
    redis_conn = Redis.from_url(redis_url)
    queue = Queue(name="uploads", connection=redis_conn)
    job = queue.enqueue("app.workers.process_upload.process_upload_job", payload)
    return str(job.id)


def create_app(
    database_url: str = "",
    redis_url: str = "",
    parser_version: str = "",
    enqueue_func: Callable[[Dict], str] = None,
    storage_backend: StorageBackend = None,
    upload_dir: str = "",
    auto_migrate: bool = True,
) -> FastAPI:
    resolved_database_url = resolve_database_url(database_url)
    resolved_redis_url = redis_url or os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
    resolved_parser_version = parser_version or os.getenv("PARSER_VERSION", "tc03-parser-v1")
    resolved_upload_dir = upload_dir or os.getenv("UPLOAD_DIR", "./data/uploads")

    engine = build_engine(resolved_database_url)
    session_factory = build_session_factory(engine)

    if auto_migrate:
        run_migrations(engine)

    app = FastAPI(title="health-v2 backend")
    app.state.session_factory = session_factory
    app.state.parser_version = resolved_parser_version
    app.state.allowed_statuses = UPLOAD_STATUSES
    app.state.storage_backend = storage_backend or LocalStorageBackend(resolved_upload_dir)
    if enqueue_func is None:
        app.state.enqueue_func = lambda payload: enqueue_upload_job(payload, resolved_redis_url)
    else:
        app.state.enqueue_func = enqueue_func

    def get_db(request: Request):
        yield from get_db_session(request.app.state.session_factory)

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.post("/api/uploads", response_model=UploadOut, status_code=status.HTTP_201_CREATED)
    async def create_upload(
        request: Request,
        file: UploadFile = File(...),
        db: Session = Depends(get_db),
    ) -> UploadOut:
        if not file.filename:
            raise HTTPException(status_code=400, detail="filename_required")

        upload_id = uuid.uuid4()
        file_bytes = await file.read()
        storage_path = request.app.state.storage_backend.save(str(upload_id), file.filename, file_bytes)
        if not storage_path:
            raise HTTPException(status_code=400, detail="storage_path_required")

        upload = Upload(
            id=upload_id,
            filename=file.filename,
            original_filename=file.filename,
            content_type=file.content_type,
            size_bytes=len(file_bytes),
            status="pending",
            storage_path=storage_path,
            parser_version=request.app.state.parser_version,
        )
        db.add(upload)
        db.commit()
        db.refresh(upload)

        payload = build_upload_job_payload(
            upload_id=upload.id,
            storage_path=upload.storage_path,
            parser_version=upload.parser_version,
        )
        job_id = request.app.state.enqueue_func(payload)
        upload.queue_job_id = job_id
        db.commit()
        db.refresh(upload)
        return UploadOut.model_validate(upload)

    @app.get("/api/uploads", response_model=List[UploadOut])
    def list_uploads(db: Session = Depends(get_db)) -> List[UploadOut]:
        rows = db.execute(select(Upload).order_by(Upload.created_at.desc())).scalars().all()
        return [UploadOut.model_validate(row) for row in rows]

    @app.get("/api/uploads/{upload_id}", response_model=UploadOut)
    def get_upload(upload_id: uuid.UUID, db: Session = Depends(get_db)) -> UploadOut:
        row = db.get(Upload, upload_id)
        if row is None:
            raise HTTPException(status_code=404, detail="upload_not_found")
        return UploadOut.model_validate(row)

    return app


app = create_app()
