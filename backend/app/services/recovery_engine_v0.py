import math
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Exercise, ExerciseMuscle, ExerciseSet, MuscleGroup, WorkoutSession

# TC-08-B-1 MVP constants
DEFAULT_WINDOW_DAYS = 7
SEED_SESSION_DATE = date(1970, 1, 1)
DEFAULT_HALF_LIFE_HOURS = 48.0
LEGS_HALF_LIFE_HOURS = 72.0

# Fatigue score normalization:
# fatigue_score = min(100, fatigue_raw / FATIGUE_SCALE)
# The scale is tuned for common set volumes to avoid all-zero/all-100 outputs.
FATIGUE_SCALE = 100.0


def _coerce_datetime(value: Optional[datetime], *, end_of_day: bool) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if isinstance(value, date):
        picked_time = time.max if end_of_day else time.min
        return datetime.combine(value, picked_time).replace(tzinfo=timezone.utc)
    raise TypeError("from_dt_or_to_dt_must_be_date_or_datetime")


def _resolve_window(
    *,
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    days: int = DEFAULT_WINDOW_DAYS,
) -> Tuple[datetime, datetime]:
    resolved_to = _coerce_datetime(to_dt, end_of_day=True) or datetime.now(timezone.utc)
    resolved_from = _coerce_datetime(from_dt, end_of_day=False) or (resolved_to - timedelta(days=days))
    if resolved_from > resolved_to:
        raise ValueError("invalid_time_window")
    return resolved_from, resolved_to


def _session_reference_dt(session_date: date) -> datetime:
    # session only stores date, so use noon UTC as a stable reference point.
    return datetime.combine(session_date, time(hour=12)).replace(tzinfo=timezone.utc)


def _half_life_hours_for(code: str) -> float:
    if code == "legs":
        return LEGS_HALF_LIFE_HOURS
    return DEFAULT_HALF_LIFE_HOURS


def _status_color(recovery: float) -> str:
    if recovery >= 70:
        return "green"
    if recovery >= 40:
        return "yellow"
    return "red"


def _top_contributors(contrib_map: Dict[str, float], limit: int = 2) -> List[Dict]:
    ordered = sorted(contrib_map.items(), key=lambda item: item[1], reverse=True)[:limit]
    return [{"raw_name": name, "contribution": round(value, 2)} for name, value in ordered]


def compute_recovery_v0(
    db_session: Session,
    *,
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    days: int = DEFAULT_WINDOW_DAYS,
) -> dict:
    """
    Compute per-muscle fatigue/recovery using sessions->exercises->sets and exercise_muscles weights.

    - set_volume = reps * weight_kg (null weight => 0)
    - exercise_volume = sum(set_volume)
    - muscle_volume = exercise_volume * mapping_weight
    - fatigue_raw = sum(muscle_volume * exp(-delta_hours / half_life_hours))
    - fatigue_score = min(100, fatigue_raw / FATIGUE_SCALE)
    - recovery = clamp(0, 100 - fatigue_score)
    """
    window_from, window_to = _resolve_window(from_dt=from_dt, to_dt=to_dt, days=days)
    from_date = window_from.date()
    to_date = window_to.date()

    muscle_rows = db_session.execute(select(MuscleGroup)).scalars().all()
    muscle_by_id = {str(row.id): row for row in muscle_rows}

    session_rows = (
        db_session.execute(
            select(WorkoutSession).where(
                WorkoutSession.date >= from_date,
                WorkoutSession.date <= to_date,
                WorkoutSession.date != SEED_SESSION_DATE,
            )
        )
        .scalars()
        .all()
    )

    fatigue_raw_by_code: Dict[str, float] = defaultdict(float)
    contributors_by_code: Dict[str, Dict[str, float]] = defaultdict(lambda: defaultdict(float))
    unmapped_counts: Dict[str, int] = defaultdict(int)

    session_ids = [row.id for row in session_rows]
    if session_ids:
        exercise_rows = db_session.execute(select(Exercise).where(Exercise.session_id.in_(session_ids))).scalars().all()
    else:
        exercise_rows = []
    exercise_ids = [row.id for row in exercise_rows]

    if exercise_ids:
        set_rows = db_session.execute(select(ExerciseSet).where(ExerciseSet.exercise_id.in_(exercise_ids))).scalars().all()
        mapping_rows = (
            db_session.execute(
                select(ExerciseMuscle.exercise_id, ExerciseMuscle.muscle_id, ExerciseMuscle.weight, Exercise.raw_name).join(
                    Exercise, Exercise.id == ExerciseMuscle.exercise_id
                )
            )
            .all()
        )
    else:
        set_rows = []
        mapping_rows = []

    exercise_volume_by_id: Dict[str, float] = defaultdict(float)
    for set_row in set_rows:
        weight = float(set_row.weight_kg or 0.0)
        reps = int(set_row.reps or 0)
        exercise_volume_by_id[str(set_row.exercise_id)] += reps * weight

    session_date_by_exercise_id: Dict[str, date] = {}
    exercise_name_by_id: Dict[str, str] = {}
    for exercise in exercise_rows:
        exercise_id = str(exercise.id)
        session_date = next((row.date for row in session_rows if row.id == exercise.session_id), None)
        if session_date is None:
            continue
        session_date_by_exercise_id[exercise_id] = session_date
        exercise_name_by_id[exercise_id] = exercise.raw_name

    direct_mappings_by_exercise_id: Dict[str, List[Tuple[str, float]]] = defaultdict(list)
    fallback_mappings_by_name: Dict[str, Dict[str, float]] = defaultdict(dict)
    for exercise_id, muscle_id, mapping_weight, raw_name in mapping_rows:
        e_id = str(exercise_id)
        m_id = str(muscle_id)
        direct_mappings_by_exercise_id[e_id].append((m_id, float(mapping_weight)))
        prev = fallback_mappings_by_name[str(raw_name)].get(m_id, 0.0)
        fallback_mappings_by_name[str(raw_name)][m_id] = max(prev, float(mapping_weight))

    for exercise in exercise_rows:
        exercise_id = str(exercise.id)
        raw_name = exercise.raw_name
        session_date = session_date_by_exercise_id.get(exercise_id)
        if session_date is None:
            continue

        mappings = direct_mappings_by_exercise_id.get(exercise_id)
        if not mappings:
            fallback_map = fallback_mappings_by_name.get(raw_name, {})
            mappings = [(muscle_id, weight) for muscle_id, weight in fallback_map.items()]

        if not mappings:
            unmapped_counts[raw_name] += 1
            continue

        exercise_volume = exercise_volume_by_id.get(exercise_id, 0.0)
        if exercise_volume <= 0:
            continue

        delta_hours = max(0.0, (window_to - _session_reference_dt(session_date)).total_seconds() / 3600.0)
        for muscle_id, mapping_weight in mappings:
            muscle = muscle_by_id.get(muscle_id)
            if muscle is None:
                continue
            half_life = _half_life_hours_for(muscle.code)
            decayed = (exercise_volume * float(mapping_weight)) * math.exp(-delta_hours / half_life)
            fatigue_raw_by_code[muscle.code] += decayed
            contributors_by_code[muscle.code][raw_name] += decayed

    muscles = {}
    for muscle in muscle_rows:
        fatigue_raw = fatigue_raw_by_code.get(muscle.code, 0.0)
        fatigue_score = min(100.0, fatigue_raw / FATIGUE_SCALE)
        recovery = max(0.0, min(100.0, 100.0 - fatigue_score))
        muscles[muscle.code] = {
            "name": muscle.name,
            "fatigue_raw": round(fatigue_raw, 2),
            "fatigue": round(fatigue_score, 2),
            "recovery": round(recovery, 2),
            "status": _status_color(recovery),
            "contributors": _top_contributors(contributors_by_code.get(muscle.code, {}), limit=2),
        }

    unmapped_exercises = [{"raw_name": name, "count": count} for name, count in sorted(unmapped_counts.items())]

    return {
        "window": {
            "days": days,
            "from": from_date.isoformat(),
            "to": to_date.isoformat(),
        },
        "muscles": muscles,
        "unmapped_exercises": unmapped_exercises,
    }
