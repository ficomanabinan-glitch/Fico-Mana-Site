import { performance } from 'node:perf_hooks'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3200'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Local-only load test: live targets are prohibited.')
const paths = ['/', '/portal/sample']
for (const path of paths) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(30000) })
  await response.arrayBuffer()
  if (!response.ok) throw new Error(`Warmup failed: ${path} ${response.status}`)
}
const results = []
for (const [phase, concurrency, requests] of [['baseline', 5, 40], ['stress', 15, 90], ['spike', 30, 120], ['recovery', 5, 40]]) {
  let next = 0
  const latencies = []
  let errors = 0
  const start = performance.now()
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < requests) {
      const index = next++
      const requestStart = performance.now()
      try {
        const response = await fetch(`${base}${paths[index % paths.length]}`, { signal: AbortSignal.timeout(10000) })
        await response.arrayBuffer()
        if (response.status !== 200) errors++
      } catch { errors++ }
      latencies.push(performance.now() - requestStart)
    }
  }))
  latencies.sort((a, b) => a - b)
  const elapsed = performance.now() - start
  const percentile = value => Math.round(latencies[Math.ceil(latencies.length * value) - 1])
  const result = { phase, concurrency, requests, errors, errorRate: errors / requests, p95Ms: percentile(.95), p99Ms: percentile(.99), requestsPerSecond: Math.round(requests / (elapsed / 1000)), elapsedMs: Math.round(elapsed) }
  results.push(result)
  console.log(JSON.stringify(result))
}
const passed = results.every(result => result.errorRate < .01 && result.p95Ms < 1500 && result.p99Ms < 3000)
await mkdir('artifacts/qa', { recursive: true })
await writeFile('artifacts/qa/local-read-stress.json', JSON.stringify({
  scope: 'Development-server public SSR/sample rendering only; NOT hosted DB, auth, R2, upload, or delivery capacity.',
  budgets: { p95Ms: 1500, p99Ms: 3000, errorRate: .01 }, passed, results,
}, null, 2))
if (!passed) process.exitCode = 1
