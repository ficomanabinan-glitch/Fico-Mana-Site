import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'

// Read-only capacity probe. Auth, uploads, selection writes, and delivery require
// a separately seeded staging workflow; this probe does not claim those paths.
const base = __ENV.BASE_URL || 'http://127.0.0.1:3100'
if (!/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?$/.test(base)) {
  throw new Error('Load test is restricted to localhost. Do not target customer production.')
}
const unexpected = new Rate('unexpected_responses')
const profile = __ENV.PROFILE || 'baseline'
const profiles = {
  baseline: [{ duration: '15s', target: 5 }, { duration: '30s', target: 5 }, { duration: '10s', target: 0 }],
  stress: [{ duration: '20s', target: 5 }, { duration: '20s', target: 15 }, { duration: '20s', target: 30 }, { duration: '15s', target: 0 }],
  soak: [{ duration: '20s', target: 5 }, { duration: '10m', target: 5 }, { duration: '20s', target: 0 }],
  spike: [{ duration: '15s', target: 5 }, { duration: '5s', target: 30 }, { duration: '20s', target: 30 }, { duration: '5s', target: 5 }, { duration: '30s', target: 5 }],
}
if (!profiles[profile]) throw new Error('Choose baseline, stress, soak, or spike.')
export const options = {
  stages: profiles[profile],
  thresholds: {
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    unexpected_responses: ['rate<0.01'],
    ...(profile === 'spike' ? {
      'http_req_duration{phase:recovery}': ['p(95)<1500'],
      'unexpected_responses{phase:recovery}': ['rate<0.01'],
    } : {}),
  },
}
export function setup() { return { started: Date.now() } }
export default function (data) {
  const elapsed = (Date.now() - data.started) / 1000
  const phase = profile === 'spike' && elapsed >= 45 ? 'recovery' : 'load'
  for (const [path, statuses] of [['/', [200]], ['/portal/sample', [200]], ['/api/bookings', [401, 403]], ['/api/admin/users', [401, 403]]]) {
    const response = http.get(`${base}${path}`, { redirects: 0, tags: { name: path, phase } })
    const passed = check(response, { 'expected route response': r => statuses.includes(r.status) })
    unexpected.add(!passed, { phase, name: path })
  }
  sleep(1)
}
