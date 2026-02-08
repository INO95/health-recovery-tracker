from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class UploadOut(BaseModel):
    id: UUID
    filename: str
    original_filename: str
    content_type: Optional[str] = None
    size_bytes: Optional[int] = None
    status: str
    storage_path: str
    parser_version: str
    queue_job_id: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }
