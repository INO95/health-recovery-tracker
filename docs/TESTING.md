# Testing & Validation Note

## Overview

This document explains the testing strategy, what risks each test addresses, and the significance of real-device mobile validation.

---

## Test Coverage Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Test Coverage                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │   Unit       │    │ Integration  │    │    E2E       │                   │
│  │   Tests      │    │   Tests      │    │   Tests      │                   │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                   │
│         │                   │                   │                           │
│         ▼                   ▼                   ▼                           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │ Parser       │    │ Upload API   │    │ Upload →     │                   │
│  │ Recovery     │    │ Sessions API │    │ Worker →     │                   │
│  │ Alias lookup │    │ Recovery API │    │ Parse →      │                   │
│  │ Date helpers │    │ Worker job   │    │ DB →         │                   │
│  └──────────────┘    └──────────────┘    │ API →        │                   │
│                                          │ Mobile UI    │                   │
│                                          └──────────────┘                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Risk-to-Test Mapping

### 1. Parser Mismatch Risk

**Risk**: OCR output format changes, parser fails silently, corrupted data enters DB.

**Test**: `test_parser_mismatch_safe_failure`

```python
def test_parser_handles_unexpected_format():
    """
    Given: OCR text in unexpected format
    When: Parser attempts to parse
    Then: Returns error result, does NOT raise exception
          Status = 'error', error_message populated
    """
    result = parser.parse("completely unexpected format ###")
    
    assert result['status'] == 'error'
    assert result['error_message'] is not None
    assert result['sessions'] == []
```

**Why This Matters**: Prevents garbage data from entering production tables.

---

### 2. Seed Data Contamination Risk

**Risk**: Seed session (1970-01-01) appears in user queries, distorting recovery calculations.

**Test**: `test_seed_session_excluded`

```python
def test_queries_exclude_seed_session():
    """
    Given: Seed session exists with date 1970-01-01
    When: Querying sessions for recovery calculation
    Then: Seed session is NOT included
    """
    # Setup
    create_seed_session()
    create_real_session(date='2026-02-08')
    
    # Execute
    sessions = get_sessions_for_recovery()
    
    # Verify
    dates = [s.session_date.isoformat() for s in sessions]
    assert '1970-01-01' not in dates
    assert '2026-02-08' in dates
```

**Why This Matters**: Ensures algorithmic correctness isn't affected by system data.

---

### 3. Decay Calculation Risk

**Risk**: Time decay formula produces nonsensical results (negative, >100%, wrong direction).

**Test**: `test_decay_sanity`

```python
def test_recovery_increases_over_time():
    """
    Given: A workout completed at t=0
    When: Checking recovery at t=0 vs t=48h
    Then: Recovery at t=48h > Recovery at t=0
    """
    workout = create_workout(date=now())
    
    recovery_immediate = calculate_recovery(ref_date=now())
    recovery_later = calculate_recovery(ref_date=now() + timedelta(hours=48))
    
    for muscle in ['chest', 'back', 'legs']:
        assert recovery_later[muscle] > recovery_immediate[muscle]
```

**Test**: `test_recovery_bounds`

```python
def test_recovery_always_in_valid_range():
    """
    Given: Any valid input
    Then: Recovery percentage is always 0-100
    """
    for scenario in [empty_data, minimal_data, extreme_data]:
        recovery = calculate_recovery(scenario)
        for muscle, pct in recovery.items():
            assert 0 <= pct <= 100
```

---

### 4. API Hardening Risk

**Risk**: Invalid input crashes API, returns 500, or leaks internal errors.

**Test**: `test_api_hardening`

```python
@pytest.mark.parametrize("invalid_id", [
    "not-a-uuid",
    "00000000-0000-0000-0000-000000000000",  # Non-existent
    "../etc/passwd",  # Path traversal attempt
    "",
])
def test_invalid_upload_id_returns_4xx(invalid_id):
    response = client.get(f"/api/uploads/{invalid_id}")
    assert response.status_code in [400, 404]
    assert "error" in response.json()
```

---

### 5. Worker Processing Risk

**Risk**: Worker crashes, job stuck in queue, upload status never updates.

**Test**: `test_worker_updates_status`

```python
def test_worker_completes_job():
    """
    Given: Upload in 'pending' status
    When: Worker processes the job
    Then: Status transitions to 'done' (or 'error')
          Processing time is recorded
    """
    upload = create_upload(status='pending')
    
    # Simulate worker
    worker.process_job(upload.id)
    
    upload.refresh()
    assert upload.status in ['done', 'error']
    assert upload.processed_at is not None
```

---

## Integration Test: Complete Flow

```python
def test_upload_to_recovery_flow():
    """
    E2E test: Upload → Worker → Parse → DB → Recovery API
    """
    # 1. Upload
    response = client.post("/api/uploads", files={"file": workout_image})
    assert response.status_code == 201
    upload_id = response.json()["id"]
    
    # 2. Wait for worker (or trigger sync for test)
    worker.process_pending()
    
    # 3. Verify session created
    upload = client.get(f"/api/uploads/{upload_id}").json()
    assert upload["status"] == "done"
    
    # 4. Check recovery reflects new data
    recovery = client.get("/api/recovery").json()
    # Assuming workout targeted chest
    assert recovery["muscles"]["chest"]["recovery_pct"] < 100
```

---

## Mobile Validation

### Why Real Device Testing?

| Validation Method | What It Catches | Limitation |
|-------------------|-----------------|------------|
| Unit tests | Logic errors | No UI/UX issues |
| Browser DevTools emulation | Layout issues | Not actual mobile behavior |
| **Real iPhone Safari** | Touch events, file upload, network | Requires physical device |

### Mobile-Specific Issues Caught

1. **File input behavior**: `<input type="file" accept="image/*" capture="environment">` behaves differently on iOS
2. **CORS preflight**: Some mobile browsers have stricter CORS handling
3. **Touch targets**: Buttons too small for finger taps
4. **Viewport scaling**: Form inputs triggering unwanted zoom

### Test Checklist

| # | Check | Method |
|---|-------|--------|
| 1 | Page loads on iPhone Safari | Manual |
| 2 | Camera/gallery picker appears | Manual |
| 3 | Upload progress shows | Manual observation |
| 4 | Status updates to 'done' | Poll or refresh |
| 5 | Session detail renders correctly | Manual |
| 6 | Recovery colors display properly | Manual |
| 7 | Touch targets are ≥44px | Manual |

### Test Environment Setup

```bash
# Mac (same Wi-Fi as iPhone)
# Terminal 1: Backend
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev -- --host 0.0.0.0

# Terminal 3: Worker
cd backend
rq worker

# iPhone Safari
# Navigate to http://<mac-ip>:5173
```

---

## Test Results Summary

```
backend/tests/
├── test_parser.py           ✅ 12 passed
├── test_recovery.py         ✅ 8 passed
├── test_api_uploads.py      ✅ 7 passed
├── test_api_sessions.py     ✅ 5 passed
├── test_api_recovery.py     ✅ 4 passed
├── test_worker.py           ✅ 3 passed
└── test_integration.py      ✅ 2 passed

Total: 41 passed, 0 failed
```

---

## What This Testing Strategy Demonstrates

| Aspect | Evidence |
|--------|----------|
| **Risk awareness** | Each test maps to a specific failure mode |
| **Layered approach** | Unit → Integration → E2E |
| **Real-world validation** | Not just localhost/emulator |
| **Boundary testing** | Edge cases, invalid inputs |
| **Algorithm verification** | Mathematical properties (monotonicity, bounds) |

---

## Future Testing Enhancements

1. **Load testing**: Multiple concurrent uploads
2. **Chaos testing**: Worker crash recovery
3. **Visual regression**: Screenshot comparison for UI
4. **Automated mobile**: Appium or Playwright mobile
