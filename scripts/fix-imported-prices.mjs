/**
 * Fix prices on imported legacy bookings to match spreadsheet rates:
 * FICO ₱3,000 · MANA ₱6,000 · Package 3 ₱5,500
 *
 * Handles mathematical-bold Unicode package names from the spreadsheet.
 *
 * Usage: node scripts/fix-imported-prices.mjs
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing Supabase env in .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Convert Mathematical Bold / fancy alphanumerics to plain ASCII. */
function toPlainAscii(value) {
  let out = ''
  for (const ch of String(value || '')) {
    const cp = ch.codePointAt(0)
    // Mathematical Bold Capital A–Z
    if (cp >= 0x1d400 && cp <= 0x1d419) {
      out += String.fromCharCode(cp - 0x1d400 + 65)
      continue
    }
    // Mathematical Bold Small a–z
    if (cp >= 0x1d41a && cp <= 0x1d433) {
      out += String.fromCharCode(cp - 0x1d41a + 97)
      continue
    }
    // Mathematical Bold Digits 0–9
    if (cp >= 0x1d7ce && cp <= 0x1d7d7) {
      out += String.fromCharCode(cp - 0x1d7ce + 48)
      continue
    }
    out += ch
  }
  return out
}

function priceAndPackage(row) {
  const plain = toPlainAscii(row.package_name || '').toLowerCase()
  const digits = plain.replace(/[^\d]/g, '')

  if (plain.includes('package 3') || plain.includes('5500') || digits.includes('5500')) {
    return {
      price: 5500,
      package_id: 'mana-makeup',
      package_name: 'Package 3 (Legacy)',
    }
  }
  if (plain.includes('mana') || plain.includes('6000') || digits.includes('6000')) {
    return {
      price: 6000,
      package_id: 'mana-makeup',
      package_name: 'MANA PACKAGE',
    }
  }
  if (plain.includes('fico') || plain.includes('3000') || digits.includes('3000')) {
    return {
      price: 3000,
      package_id: 'fico-package',
      package_name: 'FICO PACKAGE',
    }
  }
  return null
}

async function main() {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, package_id, package_name, price, note, customer_email')
    .like('id', 'FM-100%')
    .eq('customer_email', 'imported@ficomana.studio')

  if (error) {
    console.error('Fetch failed:', error.message)
    process.exit(1)
  }

  console.log(`Found ${data?.length || 0} imported bookings.\n`)

  let updated = 0
  let skipped = 0

  for (const row of data || []) {
    const fix = priceAndPackage(row)
    if (!fix) {
      console.log(`  ? ${row.id} — unknown package (${row.package_name}), skipped`)
      skipped++
      continue
    }

    const same =
      Number(row.price) === fix.price &&
      row.package_id === fix.package_id &&
      row.package_name === fix.package_name

    if (same) {
      skipped++
      continue
    }

    const { error: upErr } = await supabase
      .from('bookings')
      .update({
        price: fix.price,
        package_id: fix.package_id,
        package_name: fix.package_name,
      })
      .eq('id', row.id)

    if (upErr) {
      console.error(`  ✗ ${row.id}: ${upErr.message}`)
      skipped++
    } else {
      console.log(
        `  ✓ ${row.id} — ${fix.package_name}: ₱${row.price} → ₱${fix.price} (${row.package_id} → ${fix.package_id})`,
      )
      updated++
    }
  }

  console.log(`\nUpdated: ${updated} · Unchanged/skipped: ${skipped}`)
}

main().catch(console.error)
