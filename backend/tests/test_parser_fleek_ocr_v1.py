from app.services.parser import parse_fleek_ocr_v1


FIXTURE_TEXT = """
가슴 이두
2026.02.07
493rd 238 KCAL 54 min 7402 kg
6 EXERCISES 22 sets 254 reps 137 kg/min

바벨 플랫 벤치 프레스
MAX Weight: 60kg | 1RM: 81kg
20 40 60 60
12X 10X 5X 5X
Top 34%

풀 업
Total Reps: 45
15 15 15
Top 12%

덤벨 컬
MAX Weight: 12kg | 1RM: 16kg
6 8 10
12X 10X 8X
"""


def test_parse_fixture_extracts_summary_and_exercises() -> None:
    parsed = parse_fleek_ocr_v1(FIXTURE_TEXT)

    summary = parsed["summary"]
    assert summary["date"] == "2026-02-07"
    assert summary["calories_kcal"] == 238
    assert summary["duration_min"] == 54
    assert summary["volume_kg"] == 7402
    assert summary["exercises_count"] == 6
    assert summary["sets_total"] == 22
    assert summary["reps_total"] == 254
    assert summary["intensity_kg_per_min"] == 137

    by_name = {e["raw_name"]: e for e in parsed["exercises"]}
    assert "풀 업" in by_name
    assert [s["reps"] for s in by_name["풀 업"]["sets"]] == [15, 15, 15]
    assert all(s["weight_kg"] is None for s in by_name["풀 업"]["sets"])

    bench = by_name["바벨 플랫 벤치 프레스"]
    assert [s["weight_kg"] for s in bench["sets"]] == [20.0, 40.0, 60.0, 60.0]
    assert [s["reps"] for s in bench["sets"]] == [12, 10, 5, 5]


def test_weight_reps_mismatch_sets_needs_review() -> None:
    text = """
2026.02.07
200 KCAL 40 min 3000 kg
3 EXERCISES 10 sets 100 reps 75 kg/min
스쿼트
20 40 60
12X 10X
"""
    parsed = parse_fleek_ocr_v1(text)
    assert parsed["meta"]["needs_review"] is True
    assert any("mismatch" in warning for warning in parsed["meta"]["warnings"])


def test_summary_missing_lowers_confidence() -> None:
    text = """
풀 업
Total Reps: 30
10 10 10
"""
    parsed = parse_fleek_ocr_v1(text)
    assert parsed["meta"]["needs_review"] is True
    assert parsed["meta"]["confidence"] <= 0.45
    assert any("summary" in warning for warning in parsed["meta"]["warnings"])

