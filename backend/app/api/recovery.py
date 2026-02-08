from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db_session
from app.services.recovery_engine_v0 import compute_recovery_v0

router = APIRouter(prefix="/recovery")


def _get_db(request: Request):
    yield from get_db_session(request.app.state.session_factory)


@router.get("")
def get_recovery(
    days: int = Query(default=7, ge=1, le=30),
    from_date: date = Query(default=None, alias="from"),
    to_date: date = Query(default=None, alias="to"),
    db: Session = Depends(_get_db),
) -> dict:
    return compute_recovery_v0(
        db,
        from_dt=from_date,
        to_dt=to_date,
        days=days,
    )
