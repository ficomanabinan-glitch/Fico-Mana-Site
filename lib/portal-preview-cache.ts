type Entry = { url: string; bytes: number; touched: number }
type Task = { source: string; urgent: boolean; controller: AbortController; resolve: (url: string | null) => void; promise: Promise<string | null> }

export function canPrefetchPortalPhotos(connection?: { saveData?: boolean; effectiveType?: string }) {
  return !connection?.saveData && !['slow-2g', '2g', '3g'].includes(connection?.effectiveType || '')
}

/** Tab-memory only: never persist private images in localStorage, a service worker or public CDN. */
export class PortalPreviewCache {
  private entries = new Map<string, Entry>()
  private retained = new Map<string, number>()
  private tasks = new Map<string, Task>()
  private queue: Task[] = []
  private running = 0
  private generation = 0
  private listeners = new Set<() => void>()
  private backgroundEnabled = true
  private options: { maxEntries?: number; maxBytes?: number; ttl?: number; fetcher?: typeof fetch }
  constructor(options: { maxEntries?: number; maxBytes?: number; ttl?: number; fetcher?: typeof fetch } = {}) { this.options = options }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  peek(source: string) {
    const entry = this.entries.get(source)
    return entry && (this.retained.has(source) || Date.now() - entry.touched < (this.options.ttl ?? 120_000)) ? entry.url : null
  }
  /** Keep an open viewer's image valid while speculative entries rotate behind it. */
  retain(source: string) {
    const entry = this.entries.get(source)
    if (entry && !this.peek(source)) { URL.revokeObjectURL(entry.url); this.entries.delete(source) }
    this.retained.set(source, (this.retained.get(source) || 0) + 1)
    return () => {
      const count = this.retained.get(source) || 0
      if (count > 1) this.retained.set(source, count - 1); else this.retained.delete(source)
    }
  }
  setBackgroundEnabled(enabled: boolean) { this.backgroundEnabled = enabled; this.pump() }
  load(source: string, urgent = false): Promise<string | null> {
    // Only managed gallery previews, never originals or full-resolution deliverables.
    if (!/^\/api\/editor-workflow\/portal\/[^/?]+\/file\/[^/?]+\?kind=gallery$/.test(source)) return Promise.resolve(null)
    const cached = this.peek(source)
    if (cached) { this.entries.get(source)!.touched = Date.now(); return Promise.resolve(cached) }
    const existing = this.tasks.get(source)
    if (existing) {
      if (urgent) { existing.urgent = true; this.queue.sort((a, b) => Number(b.urgent) - Number(a.urgent)); this.pump() }
      return existing.promise
    }
    // Keep speculation bounded even while rapidly scrolling a large gallery.
    if (!urgent && this.queue.length >= 24) return Promise.resolve(null)
    let resolve!: Task['resolve']
    const promise = new Promise<string | null>(done => { resolve = done })
    const task: Task = { source, urgent, controller: new AbortController(), resolve, promise }
    this.tasks.set(source, task)
    if (urgent) this.queue.unshift(task); else this.queue.push(task)
    this.pump()
    return promise
  }
  private pump() {
    while (this.running < 2) {
      const index = this.queue.findIndex(task => task.urgent || this.backgroundEnabled)
      if (index < 0) return
      const [task] = this.queue.splice(index, 1)
      const generation = this.generation
      this.running++
      void this.run(task, generation).finally(() => { this.running--; this.pump() })
    }
  }
  private async run(task: Task, generation: number) {
    const timeout = setTimeout(() => task.controller.abort(), 20_000)
    try {
      const response = await (this.options.fetcher || fetch)(task.source, {
        credentials: 'same-origin', cache: 'no-cache', signal: task.controller.signal,
        priority: task.urgent ? 'high' : 'low',
      })
      if (!response.ok || !/^image\/(?:jpeg|png|webp|avif|gif)(?:;|$)/i.test(response.headers.get('content-type') || '') ||
        Number(response.headers.get('content-length') || 0) > 4 * 1024 * 1024) {
        await response.body?.cancel()
        task.resolve(null); return
      }
      const chunks: Uint8Array<ArrayBuffer>[] = []
      let bytes = 0
      const reader = response.body?.getReader()
      if (!reader) { task.resolve(null); return }
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > 4 * 1024 * 1024) { await reader.cancel(); task.resolve(null); return }
        chunks.push(new Uint8Array(value))
      }
      const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'image/jpeg' })
      if (generation !== this.generation || task.controller.signal.aborted || !blob.size || blob.size > 4 * 1024 * 1024) { task.resolve(null); return }
      const old = this.entries.get(task.source)
      if (old) URL.revokeObjectURL(old.url)
      const url = URL.createObjectURL(blob)
      this.entries.set(task.source, { url, bytes: blob.size, touched: Date.now() })
      let total = [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0)
      for (const [source, entry] of [...this.entries].sort((a, b) => a[1].touched - b[1].touched)) {
        if (this.entries.size <= (this.options.maxEntries ?? 48) && total <= (this.options.maxBytes ?? 24 * 1024 * 1024)) break
        if (this.retained.has(source)) continue
        URL.revokeObjectURL(entry.url); this.entries.delete(source); total -= entry.bytes
      }
      task.resolve(this.peek(task.source))
      this.listeners.forEach(listener => listener())
    } catch { task.resolve(null) }
    finally { clearTimeout(timeout); if (this.tasks.get(task.source) === task) this.tasks.delete(task.source) }
  }
  clear() {
    this.generation++
    this.tasks.forEach(task => { task.controller.abort(); task.resolve(null) })
    this.tasks.clear(); this.queue = []
    this.retained.clear()
    this.entries.forEach(entry => URL.revokeObjectURL(entry.url)); this.entries.clear()
    this.listeners.forEach(listener => listener())
  }
}
