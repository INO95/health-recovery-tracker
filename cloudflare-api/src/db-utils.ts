export function isMissingTableError(error: unknown, tableName: string): boolean {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return text.includes(`no such table: ${tableName}`) || text.includes(`no such table ${tableName}`);
}

export function buildInClausePlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(",");
}

export function groupByExerciseId<T extends { exercise_id: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const current = grouped.get(row.exercise_id) ?? [];
    current.push(row);
    grouped.set(row.exercise_id, current);
  }
  return grouped;
}
