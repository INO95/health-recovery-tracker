# Health Recovery Tracker

> Muscle-level recovery tracking from workout screenshots, with explainable recommendations.

**Status**: v1.0 (Manufacturing Complete)  
**Platform**: Web (Mobile Safari verified)

---

## Problem

Most fitness apps track *what you did* but fail to answer:
- "Which muscles are ready to train today?"
- "How recovered is each muscle group?"

Combining multiple exercise types (weights, cardio) into a unified per-muscle fatigue model is non-trivial. Existing tools either oversimplify (whole-body fatigue) or require tedious manual input.

## Solution

This project converts workout screenshots (e.g., Fleek app exports) into structured data, then computes per-muscle recovery states with time-decay modeling. Results are explainable: each muscle shows its top contributing exercises and recovery status.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         iPhone Safari                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FastAPI (0.0.0.0:8000)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ /uploads │  │/sessions │  │/recovery │  │ /exercises/alias │ │
│  └────┬─────┘  └──────────┘  └────┬─────┘  └──────────────────┘ │
└───────┼───────────────────────────┼─────────────────────────────┘
        │                           │
        ▼                           │
┌───────────────┐                   │
│  Redis Queue  │                   │
└───────┬───────┘                   │
        │                           │
        ▼                           │
┌───────────────┐                   │
│   RQ Worker   │                   │
│  ┌─────────┐  │                   │
│  │ Parser  │  │                   │
│  └────┬────┘  │                   │
└───────┼───────┘                   │
        │                           │
        ▼                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         PostgreSQL                               │
│  uploads │ sessions │ exercises │ sets │ exercise_aliases       │
└─────────────────────────────────────────────────────────────────┘
```

**Why this separation?**
- **Upload API → Queue**: Immediate response to client; processing happens async.
- **Worker**: Isolates parsing failures from API availability.
- **Parser module**: Swappable; currently Fleek OCR format, extensible to other sources.
- **Recovery computed on-demand**: Avoids stale cache; always reflects latest data.

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| API | FastAPI | Async, auto-docs, type hints |
| ORM | SQLAlchemy 2.0 | Explicit queries, future-proof |
| DB | PostgreSQL | Relational integrity, JSON support |
| Queue | Redis + RQ | Minimal overhead for local dev |
| Frontend | Vue 3 + TypeScript | Reactive, mobile-friendly |
| Infra | Docker Compose | Zero-cost local-first |

---

## Key Design Decisions

### 1. Session-Scoped Exercise Model

Exercises are **not** stored in a global master table. Each exercise belongs to its session.

**Why?**
- Raw input is noisy ("Bench Press" vs "벤치프레스" vs "Flat Bench").
- Global normalization requires a maintenance burden unsuitable for MVP.
- Instead: `raw_name` is stored as-is; an `exercise_aliases` table maps known names to muscle groups.

**Fallback strategy**:
```
raw_name → alias lookup → if found: map muscles
                        → if not: mark as unmapped (reported in /recovery)
```

**Seed data isolation**:
- Alias seeds use a synthetic session dated `1970-01-01`.
- All queries filter `session_date != 1970-01-01` to exclude seed artifacts.

### 2. Recovery Algorithm

**Fatigue Calculation**:
```
set_volume = reps × weight_kg
exercise_fatigue = Σ(set_volume) per muscle (weighted by muscle_weight)
```

**Time Decay (Half-Life)**:
| Muscle Group | Half-Life |
|--------------|-----------|
| Legs | 72 hours |
| Others | 48 hours |

```python
decay_factor = 0.5 ** (hours_elapsed / half_life)
current_fatigue = initial_fatigue × decay_factor
recovery_percent = 100 - current_fatigue
```

**Status Thresholds**:
| Recovery % | Status | Meaning |
|------------|--------|---------|
| ≥ 80% | 🟢 green | Ready to train |
| 40–79% | 🟡 yellow | Light training OK |
| < 40% | 🔴 red | Rest recommended |

### 3. Explainability

The `/api/recovery` response includes:
- **Top 2 contributing exercises** per muscle (by fatigue contribution).
- **Unmapped exercises**: List of `raw_name` values with no alias.
- **`needs_review` flag**: Sessions where parser confidence was low.

This enables the user (and future AI advice layer) to understand *why* a muscle is fatigued.

---

## Data Model

```
sessions
├── id (UUID)
├── upload_id (FK)
├── session_date
├── sport_type
└── duration_min

exercises
├── id (UUID)
├── session_id (FK)
├── raw_name
├── alias_key (nullable)
└── order_index

sets
├── id (UUID)
├── exercise_id (FK)
├── set_number
├── weight_kg
├── reps
└── duration_sec

exercise_aliases
├── alias_key (PK)
├── canonical_name
└── muscle_codes (text[])
```

---

## Reliability & Testing

| Test Category | Coverage |
|---------------|----------|
| Parser mismatch handling | Safe failure when OCR format unexpected |
| Seed session exclusion | Queries never include `1970-01-01` data |
| Decay sanity | `recovery(t=0) < recovery(t=48h)` for same workout |
| API hardening | Invalid UUIDs, missing fields → proper 4xx |
| E2E flow | Upload → Worker → Parse → DB → API → UI |

```bash
pytest backend/tests/ -v
# All tests passing
```

---

## Demo

### Recovery View (`/recovery`)

Shows per-muscle recovery status with:
- Color-coded indicators (green/yellow/red)
- Top 2 contributing exercises
- Unmapped exercise count
- "Needs review" session count

### Mobile Testing

Tested on **real iPhone Safari** via LAN:
1. Mac and iPhone on same Wi-Fi
2. Vite dev server with `--host 0.0.0.0`
3. FastAPI bound to `0.0.0.0:8000`
4. Upload workout screenshot → View parsed session → Check recovery

---

## Usage

```bash
# Start infrastructure
docker compose up -d postgres redis

# Run backend
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Run worker
rq worker --with-scheduler

# Run frontend
cd frontend
npm run dev -- --host 0.0.0.0
```

**API Examples**:
```bash
# Upload
curl -X POST http://localhost:8000/api/uploads \
  -F "file=@workout.png"

# Recovery status
curl http://localhost:8000/api/recovery
```

---

## What This Project Demonstrates

| Aspect | Evidence |
|--------|----------|
| **Data Modeling** | Session-scoped exercises with fallback alias mapping |
| **Algorithm Design** | Time-decay fatigue model with configurable half-lives |
| **Explainability** | Per-muscle contribution breakdown, unmapped tracking |
| **Reliability** | Edge-case handling, comprehensive test coverage |
| **Real-World Validation** | iPhone Safari verified, not just localhost |
| **Extensibility** | OCR pluggable, AI advice layer ready |

---

## Limitations & Future Work

| Current | Planned |
|---------|---------|
| OCR text input (pre-extracted) | Integrated OCR (Tesseract or cloud) |
| Single-user | Multi-user with auth |
| Manual alias management | AI-assisted alias suggestions |
| Recovery only | Fatigue prediction + workout recommendations |

---

## Summary

This project is a personal fitness tracking MVP that prioritizes **data quality, explainability, and real-world usability** over feature count. It demonstrates how to:
- Design a fault-tolerant async pipeline for noisy real-world input
- Model domain complexity (exercise → muscle → fatigue) with practical tradeoffs
- Build systems that are verifiable, not just functional

The recovery algorithm is not a black box—every recommendation can be traced back to specific workouts and sets.

---

*Built as a portfolio project to demonstrate backend architecture, algorithm design, and mobile-first development.*
