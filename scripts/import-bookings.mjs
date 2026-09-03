/**
 * Import historical bookings from owner's spreadsheet data.
 * These bookings have no email/phone — imports with placeholders.
 *
 * Usage: node scripts/import-bookings.mjs
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// Load .env.local
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
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Convert Mathematical Bold / fancy alphanumerics (from Google Sheets) to plain ASCII. */
function toPlainAscii(value) {
  let out = ''
  for (const ch of String(value || '')) {
    const cp = ch.codePointAt(0)
    if (cp >= 0x1d400 && cp <= 0x1d419) {
      out += String.fromCharCode(cp - 0x1d400 + 65)
      continue
    }
    if (cp >= 0x1d41a && cp <= 0x1d433) {
      out += String.fromCharCode(cp - 0x1d41a + 97)
      continue
    }
    if (cp >= 0x1d7ce && cp <= 0x1d7d7) {
      out += String.fromCharCode(cp - 0x1d7ce + 48)
      continue
    }
    out += ch
  }
  return out
}

// Package mapping — use the price they actually booked at (legacy rates)
function mapPackage(pkgText) {
  const lower = toPlainAscii(pkgText).toLowerCase()
  if (lower.includes('package 3') || lower.includes('5,500') || lower.includes('5500')) {
    return { id: 'mana-makeup', name: 'Package 3 (Legacy)', price: 5500 }
  }
  if (lower.includes('mana') || lower.includes('6,000') || lower.includes('6000')) {
    return { id: 'mana-makeup', name: 'MANA PACKAGE', price: 6000 }
  }
  if (lower.includes('fico') || lower.includes('3,000') || lower.includes('3000')) {
    return { id: 'fico-package', name: 'FICO PACKAGE', price: 3000 }
  }
  return { id: 'fico-package', name: 'FICO PACKAGE', price: 3000 }
}

// Generate booking ID
let idCounter = 100000
async function generateId() {
  idCounter++
  return `FM-${idCounter}`
}

// Parse time like "8:30:00 AM" or "2:00:00 PM"
// Also fixes likely AM/PM typos (studio hours are 8AM-4:30PM)
function parseSessionTime(timeStr) {
  if (!timeStr) return null
  const match = timeStr.match(/(\d{1,2}):(\d{2}):\d{2}\s*(AM|PM)/i)
  if (!match) return timeStr
  let hour = parseInt(match[1], 10)
  const min = match[2]
  let ampm = match[3].toUpperCase()
  
  // Fix likely typos: times between 1-7 marked as AM are probably PM
  // (studio doesn't operate at 1AM, 2AM, etc.)
  if (ampm === 'AM' && hour >= 1 && hour <= 7) {
    ampm = 'PM'
  }
  
  if (ampm === 'PM' && hour < 12) hour += 12
  if (ampm === 'AM' && hour === 12) hour = 0
  
  // Format as "H:MM AM/PM"
  const displayHour = hour % 12 || 12
  const displayAmPm = hour < 12 ? 'AM' : 'PM'
  return `${displayHour}:${min} ${displayAmPm}`
}

// Parse date like "7/15/2026" or just use the provided date
function parseDate(dateStr, year = 2026) {
  // If it's just "July 15" style
  const monthMatch = dateStr.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i)
  if (monthMatch) {
    const months = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 }
    const m = months[monthMatch[1].toLowerCase()]
    const d = parseInt(monthMatch[2], 10)
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  // If it's "M/D/YYYY" style
  const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slashMatch) {
    return `${slashMatch[3]}-${String(slashMatch[1]).padStart(2, '0')}-${String(slashMatch[2]).padStart(2, '0')}`
  }
  return null
}

// Owner's booking data (paste from spreadsheet)
const RAW_DATA = `
July 15
6/19/2026 19:05:13	Darvin Darunday 	𝐅𝐈𝐂𝐎 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟑,𝟎𝟎𝟎	2:30:00 PM
7/4/2026 7:45:16	Cielo Ortiz	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	8:30:00 AM
6/1/2026 9:53:43	Alyssa Faye C. Valdez	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	9:00:00 AM
6/28/2026 22:08:21	Francesca Rimas	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	9:30:00 AM
7/7/2026 15:22:27	Maria Immaculate P. Dayco	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	10:30:00 AM
7/13/2026 18:50:21	John Harvey A. Reyes	𝐅𝐈𝐂𝐎 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟑,𝟎𝟎𝟎	1:00:00 PM
6/19/2026 18:55:10	Sunshine Felizarte	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	2:00:00 PM
7/6/2026 16:38:43	Joyce Ivy C. Harina	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	2:00:00 PM
6/19/2026 19:24:06	Michael Almeria 	𝐅𝐈𝐂𝐎 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟑,𝟎𝟎𝟎	3:00:00 PM
6/22/2026 16:04:44	Jemmaica Catibayan	𝐅𝐈𝐂𝐎 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟑,𝟎𝟎𝟎	3:30:00 PM

July 16
5/24/2026 15:57:39	Veronica Bagtasos	Package  3 - 𝐏𝐡𝐩 𝟓,𝟓𝟎𝟎	10:00:00 AM
6/22/2026 15:53:55	Bianca Canog	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	11:00:00 AM
6/22/2026 16:07:13	Jannel Ross Hosmillo	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	11:30:00 AM
7/8/2026 23:07:26	Nhel Gutierrez	𝐅𝐈𝐂𝐎 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟑,𝟎𝟎𝟎	1:30:00 PM

July 17
7/4/2026 22:03:40	Katrina Mei H. Andal	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	8:00:00 AM
6/25/2026 17:24:27	Antoinette Tormes 	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	9:30:00 AM
6/25/2026 17:24:31	Kristine Joy Balaquit	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	10:00:00 AM
6/25/2026 17:24:28	Gallerie G. Baldovino 	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	11:00:00 AM
6/25/2026 17:24:16	Nathale Ebron	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	11:30:00 AM
7/2/2026 10:56:09	Yeuanne Faith Carandang	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	12:00:00 PM
7/4/2026 23:11:18	Pearl Marie Valencia	𝐅𝐈𝐂𝐎 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟑,𝟎𝟎𝟎	12:30:00 PM
7/4/2026 23:21:53	Arabella Nadine Bagorio	𝐅𝐈𝐂𝐎 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟑,𝟎𝟎𝟎	1:00:00 PM
7/4/2026 22:31:58	Fenilla Kim Orense	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	1:30:00 PM
7/4/2026 22:29:28	Princess Samuelyn Lazaga	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	2:30:00 PM
7/4/2026 23:03:09	Xiena Kassandra Reyes	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	3:00:00 PM

July 18
7/4/2026 12:32:50	Cyrille Kristine Jao	𝐅𝐈𝐂𝐎 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟑,𝟎𝟎𝟎	8:00:00 AM
7/4/2026 7:23:38	Justine Joy Canapati	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	9:00:00 AM
7/3/2026 16:28:47	Hershi Gwen Jumaquio	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	9:30:00 AM
5/20/2026 12:14:56	Maurene Kaye Sanchez	Package  3 - 𝐏𝐡𝐩 𝟓,𝟓𝟎𝟎	10:00:00 AM
6/6/2026 14:36:53	Justlyn Kishi Taculod	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	11:00:00 AM
6/25/2026 0:30:24	Franchesca Quartz Sakandal	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	11:30:00 AM
6/26/2026 15:39:52	Bless Taguilaso	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	12:00:00 PM
6/27/2026 20:33:00	Kayla Leigh J. De Borja	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	12:30:00 PM
5/30/2026 3:23:49	Diane Manzanilla	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	1:00:00 PM
6/27/2026 22:52:40	Jhorie Adona Loquinerio	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	1:30:00 PM
6/30/2026 19:42:42	Julia Alessandra F. Fernandez	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	2:00:00 PM
7/7/2026 20:38:34	Reign Nicole P. Baylon	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	3:00:00 PM
7/4/2026 23:26:53	Geminiano D. Noche III	𝐅𝐈𝐂𝐎 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟑,𝟎𝟎𝟎	3:30:00 PM

July 19
6/30/2026 14:57:59	Ashley Romero	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	9:00:00 AM
6/30/2026 15:01:33	REIGN EINJEL RECENA	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	9:30:00 AM
7/8/2026 20:41:55	Rheanel Gwen B. Buduan	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	10:30:00 AM
6/26/2026 16:59:09	Patrick Barawid	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	1:00:00 PM
7/9/2026 22:15:51	Leslie Amorganda	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	1:00:00 PM

July 20
7/3/2026 21:38:03	Kaye Wagan	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	12:00:00 PM
7/9/2026 9:20:15	Mia Joy Aguila	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	1:00:00 PM

July 21
7/10/2026 12:59:46	Precious Melody Punzalan	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	10:30:00 AM
7/12/2026 11:46:21	Krystal. Aloha Catipon	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	1:00:00 PM

July 22
7/7/2026 23:04:39	Maika Nicole Domondon	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	8:00:00 AM
7/10/2026 11:45:17	FIONA NICOLE ALILANG	𝐅𝐈𝐂𝐎 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟑,𝟎𝟎𝟎	8:30:00 AM

July 24
7/9/2026 10:32:21	Hershey Mantilla	𝐅𝐈𝐂𝐎 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟑,𝟎𝟎𝟎	8:30:00 AM
7/9/2026 10:27:46	Diana Buban	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	10:00:00 AM

July 25
7/13/2026 14:12:11	Mariel Ann M. Dia	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	9:30:00 AM
7/4/2026 16:01:43	Princess Elsa C. Mauricio 	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	10:00:00 AM
7/4/2026 16:11:08	Realei Louiz Bacaling	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	10:00:00 AM
6/27/2026 22:47:55	Marienella Balajadia	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	11:30:00 AM
6/27/2026 22:40:13	Mikaela T. Balajadia 	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	12:00:00 PM
6/27/2026 22:39:40	Beverly Francia	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	12:30:00 PM
6/27/2026 22:21:23	Deonila Mae B. Gaitera	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	1:00:00 PM
6/27/2026 22:53:24	Trixie Mamaradlo	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	1:30:00 PM
6/27/2026 22:45:36	Daniela Fortin	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	2:00:00 PM
6/28/2026 20:37:39	Joyce Ann Mae Amparo	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	2:30:00 PM

July 26
7/9/2026 20:13:51	Rainalyn G. Batalon	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	8:00:00 AM
7/11/2026 17:37:44	Samantha P. Manrique	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	8:30:00 AM
5/23/2026 16:25:25	Erin Jozel M. Madlangbayan	Package  3 - 𝐏𝐡𝐩 𝟓,𝟓𝟎𝟎	9:30:00 AM
7/11/2026 8:31:26	Allyana Valle	𝐅𝐈𝐂𝐎 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟑,𝟎𝟎𝟎	10:30:00 AM
7/11/2026 13:38:45	Crishamelle Am-is	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	12:00:00 PM
7/11/2026 13:33:34	Rocel L. Diones	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	12:30:00 PM
7/11/2026 13:33:16	Marszel M. Dagatan	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	3:00:00 PM

July 27
6/25/2026 8:46:43	Ariana Ella Lorena 	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	8:00:00 AM
6/25/2026 9:04:29	Necole Arnaldo	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	9:00:00 AM
6/25/2026 9:48:59	Pauline Rose A. Barraquio	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	9:30:00 AM
6/30/2026 1:41:02	AVRILLE M. GALLETO	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	1:30:00 PM

July 29
6/26/2026 12:28:21	Hannah Cominguez	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	9:00:00 AM

July 30
7/2/2026 13:40:22	Kristine Panganiban	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	8:00:00 AM
7/10/2026 0:07:10	Ana Arabella M. Cerda	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	8:00:00 AM
6/30/2026 19:32:19	Jhellaine Ann Caramay	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	11:00:00 AM
7/2/2026 12:49:58	Jhanna Arayan	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	11:30:00 AM

August 1
7/12/2026 0:55:06	June Merlie Caloza	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	3:00:00 PM

August 2
6/29/2026 8:56:23	Catherine Joaquin Perez	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	2:30:00 PM

August 7
6/26/2026 0:28:41	Marinelle Fernandez 	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	3:00:00 PM

August 9
6/19/2026 10:59:39	Jannea Poserio	𝐌𝐀𝐍𝐀 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟔,𝟎𝟎𝟎	1:30:00 PM
`

// Parse the raw data
function parseBookings() {
  const lines = RAW_DATA.trim().split('\n')
  const bookings = []
  let currentDate = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Check if it's a date header (e.g., "July 15")
    const dateHeader = trimmed.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}$/i)
    if (dateHeader) {
      currentDate = parseDate(trimmed, 2026)
      continue
    }

    // Skip header rows
    if (trimmed.includes('BOOK STAMP') || trimmed.includes('NAME') || trimmed.includes('PACKAGE') || trimmed.includes('TIME')) continue
    if (trimmed.startsWith('NASA')) continue

    // Parse booking line: "6/19/2026 19:05:13	Darvin Darunday 	𝐅𝐈𝐂𝐎 𝐏𝐚𝐜𝐤𝐚𝐠𝐞 - 𝐏𝐡𝐩 𝟑,𝟎𝟎𝟎	2:30:00 PM"
    const parts = trimmed.split('\t').filter(p => p.trim())
    if (parts.length >= 3 && currentDate) {
      // Could be: [bookStamp, name, package, time] or [name, package, time]
      let name, pkg, time, bookStamp
      
      if (parts[0].match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
        // Has book stamp
        bookStamp = parts[0]
        name = parts[1]?.trim()
        pkg = parts[2]?.trim()
        time = parts[3]?.trim()
      } else {
        // No book stamp
        name = parts[0]?.trim()
        pkg = parts[1]?.trim()
        time = parts[2]?.trim()
      }

      if (name && pkg) {
        const pkgInfo = mapPackage(pkg)
        const sessionTime = parseSessionTime(time) || 'TBD'
        
        bookings.push({
          bookingDate: currentDate,
          customerName: name,
          packageId: pkgInfo.id,
          packageName: pkgInfo.name,
          price: pkgInfo.price,
          bookingTime: sessionTime,
          createdAt: bookStamp ? new Date(bookStamp).toISOString() : new Date().toISOString(),
        })
      }
    }
  }

  return bookings
}

async function importBookings() {
  const bookings = parseBookings()
  console.log(`\nParsed ${bookings.length} bookings to import.\n`)

  // Get existing IDs to avoid conflicts
  const { data: existing } = await supabase.from('bookings').select('id')
  const existingIds = new Set((existing || []).map(b => b.id))

  // Find max ID number
  let maxNum = 100000
  for (const id of existingIds) {
    const match = id.match(/FM-(\d+)/)
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10))
  }
  idCounter = maxNum

  let imported = 0
  let skipped = 0

  for (const booking of bookings) {
    const id = await generateId()
    
    const row = {
      id,
      customer_name: booking.customerName,
      customer_email: 'imported@ficomana.studio', // Placeholder
      customer_phone: '0000000000', // Placeholder
      customer_fb_link: '',
      customer_fb_name: booking.customerName,
      package_id: booking.packageId,
      package_name: booking.packageName,
      booking_date: booking.bookingDate,
      booking_time: booking.bookingTime,
      deposit_amount: 500,
      price: booking.price,
      booking_status: 'Confirmed', // Historical bookings are confirmed
      payment_status: 'Paid Deposit',
      payment_history: JSON.stringify([{
        id: `dep-${id}`,
        amount: 500,
        method: 'BPI',
        type: 'Deposit',
        date: booking.createdAt,
      }]),
      created_at: booking.createdAt,
      note: `Imported from legacy system · Original time: ${booking.bookingTime}`,
    }

    const { error } = await supabase.from('bookings').insert(row)
    if (error) {
      console.error(`  ✗ ${booking.customerName} (${booking.bookingDate}): ${error.message}`)
      skipped++
    } else {
      console.log(`  ✓ ${id} — ${booking.customerName} — ${booking.bookingDate} ${booking.bookingTime}`)
      imported++
    }
  }

  console.log(`\n✓ Imported: ${imported}`)
  console.log(`✗ Skipped: ${skipped}`)
  console.log(`\nDone. Bookings are marked as "Confirmed" with placeholder email (imported@ficomana.studio).`)
  console.log(`Staff can update contact info in the admin panel.\n`)
}

importBookings().catch(console.error)
