# Recovery Algorithm Note

## Overview

This document details the recovery/fatigue calculation algorithm, including formulas, pseudocode, and design rationale.

---

## Core Concepts

### Fatigue vs Recovery

```
Fatigue = recent training stress on a muscle group
Recovery = 100 - Fatigue (as percentage)
```

### Volume as Stress Metric

```
set_volume = reps × weight_kg
exercise_volume = Σ(set_volume) for all sets
muscle_fatigue = Σ(exercise_volume × muscle_weight) for all exercises targeting muscle
```

---

## Algorithm

### Step 1: Collect Recent Sessions

```python
def get_relevant_sessions(ref_date, lookback_hours=168):
    """
    Fetch sessions within lookback window (default 7 days).
    Excludes seed session (1970-01-01).
    """
    cutoff = ref_date - timedelta(hours=lookback_hours)
    return Session.query.filter(
        Session.session_date >= cutoff,
        Session.session_date != '1970-01-01'
    ).all()
```

### Step 2: Calculate Raw Fatigue Per Muscle

```python
def calculate_raw_fatigue(sessions):
    """
    Aggregate volume by muscle group.
    """
    fatigue_by_muscle = defaultdict(float)
    
    for session in sessions:
        for exercise in session.exercises:
            muscles = get_muscles(exercise.alias_key)  # e.g., ['chest', 'triceps']
            exercise_volume = sum(s.reps * s.weight_kg for s in exercise.sets)
            
            for muscle in muscles:
                weight = MUSCLE_WEIGHTS.get(muscle, 1.0)
                fatigue_by_muscle[muscle] += exercise_volume * weight
    
    return fatigue_by_muscle
```

### Step 3: Apply Time Decay

```python
HALF_LIFE = {
    'legs': 72,      # hours
    'glutes': 72,
    'default': 48,
}

def apply_decay(fatigue_by_muscle, sessions, ref_date):
    """
    Apply exponential decay based on time since workout.
    More recent = more fatigue contribution.
    """
    decayed_fatigue = defaultdict(float)
    
    for session in sessions:
        hours_elapsed = (ref_date - session.session_date).total_seconds() / 3600
        
        for exercise in session.exercises:
            muscles = get_muscles(exercise.alias_key)
            exercise_volume = sum(s.reps * s.weight_kg for s in exercise.sets)
            
            for muscle in muscles:
                half_life = HALF_LIFE.get(muscle, HALF_LIFE['default'])
                decay_factor = 0.5 ** (hours_elapsed / half_life)
                
                contribution = exercise_volume * decay_factor
                decayed_fatigue[muscle] += contribution
    
    return decayed_fatigue
```

### Step 4: Normalize to Recovery Percentage

```python
MAX_FATIGUE_THRESHOLD = 10000  # Calibrated from typical workout data

def normalize_to_recovery(decayed_fatigue):
    """
    Convert fatigue scores to 0-100 recovery percentage.
    """
    recovery = {}
    
    for muscle, fatigue in decayed_fatigue.items():
        # Clamp fatigue to max threshold
        clamped = min(fatigue, MAX_FATIGUE_THRESHOLD)
        # Convert to recovery (inverse)
        recovery_pct = 100 * (1 - clamped / MAX_FATIGUE_THRESHOLD)
        recovery[muscle] = max(0, min(100, recovery_pct))
    
    return recovery
```

### Step 5: Assign Status

```python
def assign_status(recovery_pct):
    if recovery_pct >= 80:
        return 'green'   # Ready to train
    elif recovery_pct >= 40:
        return 'yellow'  # Light training OK
    else:
        return 'red'     # Rest recommended
```

---

## Half-Life Selection Rationale

### Why Different Values for Legs?

| Muscle Group | Half-Life | Rationale |
|--------------|-----------|-----------|
| Legs (quads, hamstrings) | 72h | Larger muscle mass, higher volume capacity |
| Glutes | 72h | Often trained with legs, similar recovery pattern |
| Others | 48h | Standard recovery window in sports science literature |

### Research Basis

- **72-hour recommendation** for large compound movements (squats, deadlifts) aligns with typical training program rest periods.
- **48-hour recommendation** for upper body is widely cited in resistance training literature.

### Configurability

Future enhancement: Allow user-specific half-life customization based on:
- Training experience
- Age
- Sleep quality
- Nutrition

---

## Explainability Design

### Why Explain?

A recovery score of "75%" is meaningless without context. Users need to understand:
1. **Which exercises** contributed to fatigue
2. **How much** each contributed
3. **What data is missing** (unmapped exercises)

### Implementation

```python
def get_top_contributors(muscle, sessions, n=2):
    """
    Return top N exercises contributing to muscle fatigue.
    """
    contributions = []
    
    for session in sessions:
        for exercise in session.exercises:
            if muscle in get_muscles(exercise.alias_key):
                volume = sum(s.reps * s.weight_kg for s in exercise.sets)
                contributions.append({
                    'exercise': exercise.raw_name,
                    'session_date': session.session_date,
                    'volume': volume,
                })
    
    return sorted(contributions, key=lambda x: -x['volume'])[:n]
```

### Response Format

```json
{
  "muscles": {
    "chest": {
      "recovery_pct": 65,
      "status": "yellow",
      "top_contributors": [
        {"exercise": "Bench Press", "date": "2026-02-07", "volume": 4500},
        {"exercise": "Incline Dumbbell", "date": "2026-02-07", "volume": 2400}
      ]
    }
  },
  "unmapped_exercises": ["Cable Crossover Variation X"],
  "needs_review_count": 1
}
```

---

## Edge Cases

### No Data

```python
if not sessions:
    # All muscles at 100% recovery (no fatigue)
    return {muscle: 100 for muscle in ALL_MUSCLES}
```

### Unmapped Exercises

```python
if not exercise.alias_key:
    unmapped.append(exercise.raw_name)
    continue  # Skip but don't fail
```

### Future Sessions (Date > Today)

```python
if session.session_date > ref_date:
    continue  # Ignore future-dated sessions
```

---

## Testing Strategy

### Decay Sanity Test

```python
def test_decay_increases_recovery_over_time():
    # Create workout at t=0
    session = create_session(date=now())
    
    # Recovery immediately after
    recovery_t0 = get_recovery(session, ref_date=now())
    
    # Recovery 48 hours later
    recovery_t48 = get_recovery(session, ref_date=now() + timedelta(hours=48))
    
    assert recovery_t48['chest'] > recovery_t0['chest']
```

### Boundary Tests

```python
def test_recovery_clamped_to_0_100():
    # Extreme fatigue
    recovery = calculate_recovery(huge_workout)
    assert all(0 <= v <= 100 for v in recovery.values())
```

---

## Summary

The recovery algorithm provides:
1. **Physics-inspired model**: Exponential decay mimics real-world recovery
2. **Muscle-specific tuning**: Legs get longer recovery windows
3. **Explainability**: Every score is traceable to specific exercises
4. **Graceful handling**: Unmapped exercises don't break the system
