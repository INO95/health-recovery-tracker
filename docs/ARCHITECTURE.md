# Architecture Deep Dive

## Overview

This document explains the architectural decisions behind Health Recovery Tracker, focusing on data flow, model design trade-offs, and rationale for the chosen approach.

---

## Data Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              Data Flow                                      │
└────────────────────────────────────────────────────────────────────────────┘

1. UPLOAD PHASE
   ┌──────────┐     ┌──────────┐     ┌──────────┐
   │  Client  │────▶│ POST     │────▶│ uploads  │
   │ (Safari) │     │ /uploads │     │ table    │
   └──────────┘     └────┬─────┘     └──────────┘
                         │
                         ▼
                   ┌──────────┐
                   │  Redis   │
                   │  Queue   │
                   └──────────┘

2. PROCESSING PHASE
   ┌──────────┐     ┌──────────┐     ┌──────────────────────┐
   │  Redis   │────▶│  Worker  │────▶│ Parser               │
   │  Queue   │     └──────────┘     │ (Fleek OCR format)   │
   └──────────┘                      └──────────┬───────────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    ▼                           ▼                           ▼
              ┌──────────┐              ┌──────────┐              ┌──────────┐
              │ sessions │──────────────│exercises │──────────────│   sets   │
              └──────────┘              └──────────┘              └──────────┘

3. QUERY PHASE
   ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
   │  Client  │────▶│ GET      │────▶│ Recovery │────▶│ Response │
   │          │     │ /recovery│     │ Engine   │     │ + Explain│
   └──────────┘     └──────────┘     └──────────┘     └──────────┘
```

### Why Async Processing?

| Approach | Pros | Cons |
|----------|------|------|
| Synchronous | Simple | Blocks client, timeout risk |
| **Async (chosen)** | Fast response, retry possible | More components |

The async model allows:
- Immediate upload confirmation to client
- Retry on transient failures
- Processing isolation (parser crash ≠ API crash)

---

## Session-Scoped Exercise Model

### The Problem

User input for exercise names is highly variable:
- "Bench Press"
- "벤치프레스"
- "Flat Bench"
- "BP"

### Alternative Approaches Considered

#### Option A: Global Exercise Master Table

```
exercises (global)
├── id
├── canonical_name
└── muscle_codes[]

session_exercises (junction)
├── session_id
├── exercise_id
└── raw_name (what user typed)
```

**Pros**: Clean normalization, single source of truth  
**Cons**: Requires admin UI for mapping, high maintenance burden

#### Option B: Session-Scoped with Alias Fallback (Chosen)

```
exercises
├── id
├── session_id    ← belongs to session
├── raw_name      ← as-is from user
├── alias_key     ← nullable, links to aliases
└── order_index

exercise_aliases
├── alias_key (PK)
├── canonical_name
└── muscle_codes[]
```

**Pros**: Rapid development, graceful degradation for unknown exercises  
**Cons**: Unmapped exercises require later attention

### Why This Choice?

| Factor | Weight | Option A | Option B |
|--------|--------|----------|----------|
| MVP velocity | High | ❌ Slow | ✅ Fast |
| Data integrity | Medium | ✅ Strong | ⚠️ Acceptable |
| Maintenance | High | ❌ Heavy | ✅ Light |
| Graceful failure | High | ❌ Blocks | ✅ Fallback |

For a personal portfolio project, **Option B** provides the best trade-off: rapid implementation with acceptable data quality, and a clear upgrade path.

### Upgrade Path

Future enhancement to Option A:
1. Build admin UI for alias management
2. Backfill existing `raw_name` → `alias_key` mappings
3. Add ML-based auto-suggest for new exercises

---

## Seed Session Strategy

### Problem

How to insert initial alias data without polluting production data?

### Solution

Use a synthetic session with date `1970-01-01`:

```sql
-- Seed insertion
INSERT INTO sessions (id, session_date, ...)
VALUES ('seed-uuid', '1970-01-01', ...);

INSERT INTO exercise_aliases (alias_key, canonical_name, muscle_codes)
VALUES ('bench_press', 'Bench Press', ARRAY['chest', 'triceps']);
```

All production queries include:
```sql
WHERE session_date != '1970-01-01'
```

### Why This Works

- No separate "admin" table needed
- Clear demarcation (impossible real-world date)
- Easy to identify and exclude in all queries
- Does not affect foreign key relationships

---

## Storage Abstraction

### Interface

```python
class StorageBackend(ABC):
    @abstractmethod
    def save(self, file_data: bytes, filename: str) -> str:
        """Returns storage path/key"""
        
    @abstractmethod
    def get_url(self, path: str) -> str:
        """Returns accessible URL"""
        
    @abstractmethod
    def delete(self, path: str) -> bool:
        pass
```

### Current Implementation

```
LocalStorageBackend
└── ./data/uploads/{YYYY}/{MM}/{uuid}_{filename}
```

### Future Implementations

```
S3StorageBackend     → AWS S3
R2StorageBackend     → Cloudflare R2
GCSStorageBackend    → Google Cloud Storage
```

Switch via environment variable:
```
STORAGE_BACKEND=local|s3|r2
```

---

## API Design Principles

### Resource-Oriented

| Resource | CRUD Operations |
|----------|-----------------|
| `/uploads` | Create (POST), Read (GET), Delete (DELETE), Reprocess (POST) |
| `/sessions` | Read (GET), Update (PATCH), Delete (DELETE) |
| `/recovery` | Read (GET) - computed, not stored |

### Recovery as Computed Resource

Recovery is not stored in database. It's computed on-demand from:
- `sessions` (date, duration)
- `exercises` → `aliases` (muscle mapping)
- `sets` (volume = reps × weight)

**Why on-demand?**
- Always reflects current data
- No cache invalidation complexity
- Computation is fast (< 100ms for typical dataset)

---

## Error Handling

### Parser Failure Modes

| Scenario | Behavior | Visibility |
|----------|----------|------------|
| Invalid format | Status = `error` | Upload list shows error |
| Partial parse | Status = `done`, `needs_review` = true | Session marked for review |
| Success | Status = `done` | Normal flow |

### Graceful Degradation

```
If alias lookup fails:
  → Mark exercise as unmapped
  → Continue processing other exercises
  → Report unmapped count in /recovery
  → Do not fail the entire session
```

---

## Summary

This architecture prioritizes:
1. **Velocity**: Ship working features quickly
2. **Observability**: Explain what the system decided and why
3. **Extensibility**: Clear upgrade paths for each component
4. **Resilience**: Graceful handling of imperfect input
