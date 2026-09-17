import { spawn } from 'node:child_process'
import { readdir, mkdir, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

// Repeated isolated regression execution. Never calls a live service directly.
// This measures suite reliability under worker pressure, not production capacity.
const files = (await readdir('tests')).filter(name => name.endsWith('.test.ts')).map(name => `tests/${name}`)
const rounds = Number(process.env.QA_ROUNDS ?? 3)
const workers = Number(process.env.QA_WORKERS ?? 8)
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10 || !Number.isInteger(workers) || workers < 1 || workers > 16) {
  throw new Error('Use QA_ROUNDS 1–10 and QA_WORKERS 1–16.')
}
const results = []
await mkdir('artifacts/qa', { recursive: true })
for (let round = 1; round <= rounds; round++) {
  const start = performance.now()
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', `--test-concurrency=${workers}`, ...files], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    child.on('error', reject)
    child.on('close', code => resolve({ code, output, summary: output.split('\n').filter(line => /(?:ℹ|#) (?:tests|pass|fail|cancelled|skipped|duration_ms)/.test(line)).join('\n') }))
  })
  await writeFile(`artifacts/qa/endurance-round-${round}.txt`, result.output)
  const entry = { round, workers, elapsedMs: Math.round(performance.now() - start), code: result.code, summary: result.summary }
  results.push(entry)
  console.log(JSON.stringify(entry))
  if (result.code !== 0) break
}
await writeFile('artifacts/qa/endurance-results.json', JSON.stringify({ scope: 'Isolated regression endurance, not hosted load capacity', results }, null, 2))
if (results.some(result => result.code !== 0)) process.exitCode = 1
