from datetime import date, datetime
from typing import List, Optional
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


class SessionListItemOut(BaseModel):
    id: UUID
    date: date
    calories_kcal: Optional[int] = None
    duration_min: Optional[int] = None
    volume_kg: Optional[int] = None
    upload_id: Optional[UUID] = None

    model_config = {
        "from_attributes": True,
    }


class SessionSetOut(BaseModel):
    id: UUID
    set_index: int
    weight_kg: Optional[float] = None
    reps: int

    model_config = {
        "from_attributes": True,
    }


class SessionExerciseOut(BaseModel):
    id: UUID
    raw_name: str
    order_index: int
    sets: List[SessionSetOut]


class SessionDetailOut(BaseModel):
    id: UUID
    date: date
    calories_kcal: Optional[int] = None
    duration_min: Optional[int] = None
    volume_kg: Optional[int] = None
    upload_id: Optional[UUID] = None
    exercises: List[SessionExerciseOut]
