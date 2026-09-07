type Row = Record<string, any>

/** Scoped query/mutation double. No network, credentials, or real records. */
export function memoryDb(tables: Record<string, Row[]>, fail?: (table: string, action: string) => boolean) {
  const operations: Array<{ table: string; action: string }> = []
  return { tables, operations, from(table: string) {
    const predicates: Array<(row: Row) => boolean> = []
    let action = 'select', value: Row | Row[] = {}, conflict = 'id'
    let offset = 0, end = Infinity
    const ordering: Array<{ key: string; ascending: boolean }> = []
    const field = (row: Row, key: string) => key.split('.').reduce((item, part) => item?.[part], row)
    const run = () => {
      operations.push({ table, action })
      if (fail?.(table, action)) return { data: null, error: { message: 'Synthetic database failure' } }
      const rows = tables[table] ||= []
      let matching = rows.filter(row => predicates.every(predicate => predicate(row)))
      if (action === 'delete') tables[table] = rows.filter(row => !matching.includes(row))
      if (action === 'update') matching.forEach(row => Object.assign(row, value))
      if (action === 'insert' || action === 'upsert') {
        matching = (Array.isArray(value) ? value : [value]).map(item => {
          const existing = action === 'upsert' ? rows.find(row => conflict.split(',').every(key => row[key] === item[key])) : null
          if (existing) { Object.assign(existing, item); return existing }
          const created = { id: `row-${rows.length}`, ...item }; rows.push(created); return created
        })
      }
      const count = matching.length
      if (ordering.length) matching.sort((a, b) => {
        for (const { key, ascending } of ordering) {
          const left = field(a, key), right = field(b, key)
          if (left !== right) return (left < right ? -1 : 1) * (ascending ? 1 : -1)
        }
        return 0
      })
      return { data: structuredClone(matching.slice(offset, end)), error: null, count }
    }
    const query = {
      select() { return query },
      order(key: string, options?: { ascending: boolean }) { ordering.push({ key, ascending: options?.ascending !== false }); return query },
      limit(count: number) { end = count; return query },
      range(first: number, last: number) { offset = first; end = last + 1; return query },
      eq(key: string, expected: unknown) { predicates.push(row => field(row, key) === expected); return query },
      is(key: string, expected: unknown) { predicates.push(row => (field(row, key) ?? null) === expected); return query },
      in(key: string, values: unknown[]) { predicates.push(row => values.includes(field(row, key))); return query },
      update(patch: Row) { action = 'update'; value = patch; return query },
      delete() { action = 'delete'; return query },
      insert(patch: Row | Row[]) { action = 'insert'; value = patch; return query },
      upsert(patch: Row | Row[], options?: { onConflict: string }) { action = 'upsert'; value = patch; conflict = options?.onConflict || 'id'; return query },
      maybeSingle: async () => { const result = run(); return { ...result, data: result.data?.[0] ?? null } },
      single: async () => { const result = run(); return { ...result, data: result.data?.[0] ?? null } },
      then(resolve: (result: ReturnType<typeof run>) => unknown) { return Promise.resolve(run()).then(resolve) },
    }
    return query
  } }
}
