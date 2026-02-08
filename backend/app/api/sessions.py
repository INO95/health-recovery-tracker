import uuid
from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.database import get_db_session
from app.models import Exercise, ExerciseSet, WorkoutSession
from app.schemas import SessionDetailOut, SessionExerciseOut, SessionListItemOut, SessionSetOut

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _get_db(request: Request):
    yield from get_db_session(request.app.state.session_factory)


@router.get("", response_model=List[SessionListItemOut])
def list_sessions(
    from_date: date = Query(default=None, alias="from"),
    to_date: date = Query(default=None, alias="to"),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(_get_db),
) -> List[SessionListItemOut]:
    stmt = select(WorkoutSession)
    if from_date is not None:
        stmt = stmt.where(WorkoutSession.date >= from_date)
    if to_date is not None:
        stmt = stmt.where(WorkoutSession.date <= to_date)
    stmt = stmt.order_by(desc(WorkoutSession.date), desc(WorkoutSession.created_at)).limit(limit)
    rows = db.execute(stmt).scalars().all()
    return [SessionListItemOut.model_validate(row) for row in rows]


@router.get("/{session_id}", response_model=SessionDetailOut)
def get_session_detail(session_id: uuid.UUID, db: Session = Depends(_get_db)) -> SessionDetailOut:
    session_row = db.get(WorkoutSession, session_id)
    if session_row is None:
        raise HTTPException(status_code=404, detail="session_not_found")

    exercise_rows = (
        db.execute(select(Exercise).where(Exercise.session_id == session_row.id).order_by(Exercise.order_index)).scalars().all()
    )
    exercises: List[SessionExerciseOut] = []
    for exercise in exercise_rows:
        set_rows = (
            db.execute(select(ExerciseSet).where(ExerciseSet.exercise_id == exercise.id).order_by(ExerciseSet.set_index))
            .scalars()
            .all()
        )
        exercises.append(
            SessionExerciseOut(
                id=exercise.id,
                raw_name=exercise.raw_name,
                order_index=exercise.order_index,
                sets=[SessionSetOut.model_validate(set_row) for set_row in set_rows],
            )
        )

    return SessionDetailOut(
        id=session_row.id,
        date=session_row.date,
        calories_kcal=session_row.calories_kcal,
        duration_min=session_row.duration_min,
        volume_kg=session_row.volume_kg,
        upload_id=session_row.upload_id,
        exercises=exercises,
    )
