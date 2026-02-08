import re
from typing import Dict, List, Optional


SUMMARY_LABEL_PATTERNS = (
    r"\bKCAL\b",
    r"\bmin\b",
    r"\bkg\b",
    r"\bEXERCISES\b",
    r"\bsets\b",
    r"\breps\b",
    r"\bkg/min\b",
)


def _clean_lines(raw_text: str) -> List[str]:
    lines = []
    for raw in (raw_text or "").splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if not line:
            continue
        if re.search(r"^Top\s*\d+%$", line, flags=re.IGNORECASE):
            continue
        lines.append(line)
    return lines


def _parse_date(text: str) -> Optional[str]:
    m = re.search(r"(20\d{2})[.\-/](\d{2})[.\-/](\d{2})", text)
    if not m:
        return None
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"


def _parse_int_with_keyword(text: str, keyword: str) -> Optional[int]:
    m = re.search(rf"(\d+)\s*{re.escape(keyword)}", text, flags=re.IGNORECASE)
    if not m:
        return None
    return int(m.group(1))


def _looks_like_exercise_header(line: str) -> bool:
    if re.search(r"^MAX Weight:", line, flags=re.IGNORECASE):
        return False
    if re.search(r"^Total Reps:", line, flags=re.IGNORECASE):
        return False
    if re.fullmatch(r"[\d.\s]+", line):
        return False
    if re.search(r"\b\d+\s*[xX]\b", line):
        return False
    if any(re.search(p, line, flags=re.IGNORECASE) for p in SUMMARY_LABEL_PATTERNS):
        return False
    if re.search(r"^\d{4}[.\-/]\d{2}[.\-/]\d{2}$", line):
        return False
    return bool(re.search(r"[A-Za-z가-힣]", line))


def _extract_numbers(line: str) -> List[float]:
    return [float(x) for x in re.findall(r"\d+(?:\.\d+)?", line)]


def _extract_reps(line: str) -> List[int]:
    return [int(x) for x in re.findall(r"(\d+)\s*[xX]", line)]


def _parse_exercise_sets(block_lines: List[str], warnings: List[str], name: str) -> List[Dict]:
    reps_only_mode = any(re.search(r"^Total Reps:", line, flags=re.IGNORECASE) for line in block_lines)
    if reps_only_mode:
        reps_values: List[int] = []
        for line in block_lines:
            if re.search(r"^Total Reps:", line, flags=re.IGNORECASE):
                continue
            if re.search(r"^MAX Weight:", line, flags=re.IGNORECASE):
                continue
            if _looks_like_exercise_header(line):
                continue
            numbers = _extract_numbers(line)
            if len(numbers) >= 2:
                reps_values.extend(int(v) for v in numbers)
        if len(reps_values) >= 2:
            return [{"weight_kg": None, "reps": r} for r in reps_values]
        warnings.append(f"reps_only_sets_too_short:{name}")
        return []

    weight_candidates: List[float] = []
    reps_candidates: List[int] = []
    for line in block_lines:
        if re.search(r"^MAX Weight:", line, flags=re.IGNORECASE):
            continue
        reps = _extract_reps(line)
        if reps:
            reps_candidates = reps
            continue
        if _looks_like_exercise_header(line):
            continue
        nums = _extract_numbers(line)
        if len(nums) >= 2:
            weight_candidates = nums

    if not weight_candidates and not reps_candidates:
        return []

    if len(weight_candidates) != len(reps_candidates):
        warnings.append(f"sets_count_mismatch:{name}")

    size = min(len(weight_candidates), len(reps_candidates))
    sets = []
    for idx in range(size):
        sets.append({"weight_kg": float(weight_candidates[idx]), "reps": int(reps_candidates[idx])})
    return sets


def parse_fleek_ocr_v1(raw_text: str) -> dict:
    lines = _clean_lines(raw_text)
    joined = "\n".join(lines)

    warnings: List[str] = []
    summary = {
        "date": _parse_date(joined),
        "calories_kcal": _parse_int_with_keyword(joined, "KCAL"),
        "duration_min": _parse_int_with_keyword(joined, "min"),
        "volume_kg": _parse_int_with_keyword(joined, "kg"),
        "exercises_count": _parse_int_with_keyword(joined, "EXERCISES"),
        "sets_total": _parse_int_with_keyword(joined, "sets"),
        "reps_total": _parse_int_with_keyword(joined, "reps"),
        "intensity_kg_per_min": _parse_int_with_keyword(joined, "kg/min"),
    }

    header_indexes = [i for i, line in enumerate(lines) if _looks_like_exercise_header(line)]
    exercises: List[dict] = []
    for idx, header_idx in enumerate(header_indexes):
        name = lines[header_idx]
        next_idx = header_indexes[idx + 1] if idx + 1 < len(header_indexes) else len(lines)
        block = lines[header_idx + 1 : next_idx]
        sets = _parse_exercise_sets(block, warnings, name)
        if sets:
            exercises.append({"raw_name": name, "sets": sets})

    missing_summary = [k for k, v in summary.items() if v is None]
    if missing_summary:
        warnings.append(f"summary_missing:{','.join(missing_summary)}")

    confidence = 1.0 - (0.12 * len(missing_summary)) - (0.08 * len(warnings))
    confidence = max(0.05, min(1.0, confidence))
    needs_review = bool(warnings) or len(missing_summary) >= 2

    return {
        "summary": summary,
        "exercises": exercises,
        "meta": {
            "confidence": round(confidence, 2),
            "needs_review": needs_review,
            "warnings": warnings,
        },
    }

