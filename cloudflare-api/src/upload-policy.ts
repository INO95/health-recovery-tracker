type ParsedLike = {
  summary: { date: string | null };
  exercises: Array<{ raw_name: string; sets: Array<{ weight_kg: number | null; reps: number }> }>;
  meta: { needs_review: boolean; warnings: string[] };
};

export function shouldRejectOnNeedsReview(parsed: ParsedLike): boolean {
  if (!parsed.meta.needs_review) {
    return false;
  }

  // Hard reject: no date / no parsed exercises.
  if (!parsed.summary.date) {
    return true;
  }
  if (!parsed.exercises || parsed.exercises.length === 0) {
    return true;
  }

  // Hard reject when parser explicitly says summary is missing.
  const hasSummaryMissing = parsed.meta.warnings.some((warning) => warning.startsWith("summary_missing:"));
  if (hasSummaryMissing) {
    return true;
  }

  // Otherwise allow upload with warnings (best-effort parsed data).
  return false;
}
