import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((path) => !path.endsWith('pnpm-lock.yaml') && !/\.(png|jpe?g|gif|webp|avif|ico|mp4|pdf)$/i.test(path))

const signatures = [
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'Supabase secret key', pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { name: 'GitHub token', pattern: /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  {
    name: 'temporary Fico Mana password',
    pattern: new RegExp(`\\b(?:${'master' + '123'}|${'editor' + '123'})\\b`, 'i'),
  },
  {
    name: 'non-empty tracked secret assignment',
    pattern: /^(?:R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|PORTAL_SIGNING_SECRET|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY)[ \t]*=[ \t]*[^\s#][^\r\n]*$/m,
  },
]

const findings = []
for (const path of tracked) {
  let source
  try {
    source = await readFile(path, 'utf8')
  } catch {
    continue
  }
  for (const signature of signatures) {
    if (signature.pattern.test(source)) findings.push(`${path}: ${signature.name}`)
  }
  if (/^data\/(ficomana-store|email-logs|blocked-slots|fico-spot-blocks)\.json$/.test(path)) {
    findings.push(`${path}: transactional snapshot must not be tracked`)
  }
}

if (findings.length > 0) {
  console.error('Potential tracked secrets found (values intentionally hidden):')
  for (const finding of findings) console.error(`- ${finding}`)
  process.exitCode = 1
} else {
  console.log(`Secret scan passed across ${tracked.length} tracked text files.`)
}
