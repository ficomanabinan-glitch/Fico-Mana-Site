/** Bounded, ordered metadata reads avoid PostgREST's default result ceiling.
 * Callers must apply authorization filters on every freshly created query.
 */
export async function readDatabasePages<T>(query: () => {
  order: (column: string) => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> }
}, { pageSize = 500, maxPages = 100 }: { pageSize?: number; maxPages?: number } = {}): Promise<T[]> {
  const rows: T[] = []
  for (let page = 0; page < maxPages; page++) {
    const result = await query().order('id').range(page * pageSize, (page + 1) * pageSize - 1)
    if (result.error) throw new Error(result.error.message)
    const chunk = result.data || []
    rows.push(...chunk)
    if (chunk.length < pageSize) return rows
  }
  throw new Error('This folder is too large to list safely. Ask the studio administrator to narrow the listing.')
}
