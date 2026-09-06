export function filterMissingPackageRows<T extends { id: string }>(
  rows: T[],
  existingIds: Iterable<string>,
) {
  const existing = new Set(existingIds)
  return rows.filter((row) => !existing.has(row.id))
}
