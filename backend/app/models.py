import uuid
from datetime import date as date_type

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

UPLOAD_STATUSES = ("pending", "processing", "parsed", "failed")


class Upload(Base):
    __tablename__ = "uploads"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    content_type: Mapped[str] = mapped_column(String(128), nullable=True)
    size_bytes: Mapped[int] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    parser_version: Mapped[str] = mapped_column(String(64), nullable=False)
    queue_job_id: Mapped[str] = mapped_column(String(128), nullable=True)
    error_message: Mapped[str] = mapped_column(String(512), nullable=True)
    ocr_text_raw: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class WorkoutSession(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    upload_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("uploads.id"), nullable=True)
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    calories_kcal: Mapped[int] = mapped_column(Integer, nullable=True)
    duration_min: Mapped[int] = mapped_column(Integer, nullable=True)
    volume_kg: Mapped[int] = mapped_column(Integer, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    raw_name: Mapped[str] = mapped_column(String(255), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)


class ExerciseSet(Base):
    __tablename__ = "sets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exercise_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("exercises.id"), nullable=False)
    set_index: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=True)
    reps: Mapped[int] = mapped_column(Integer, nullable=False)


class MuscleGroup(Base):
    __tablename__ = "muscle_groups"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ExerciseMuscle(Base):
    __tablename__ = "exercise_muscles"

    exercise_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("exercises.id"), primary_key=True)
    muscle_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("muscle_groups.id"), primary_key=True)
    weight: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
