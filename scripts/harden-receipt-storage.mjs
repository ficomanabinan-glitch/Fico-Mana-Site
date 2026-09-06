import process from 'node:process'
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

loadEnv({ path: '.env.local', quiet: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const secret = (
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
)?.trim()

if (!url || !secret) {
  throw new Error(
    'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY before hardening receipt storage.',
  )
}

const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: current, error: readError } = await supabase.storage.getBucket('receipts')
if (readError || !current) {
  throw new Error('The receipts bucket was not found in the selected Supabase project.')
}

const { error: updateError } = await supabase.storage.updateBucket('receipts', {
  public: false,
  fileSizeLimit: 5 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
})
if (updateError) throw new Error(`Receipt bucket hardening failed: ${updateError.message}`)

const { data: verified, error: verifyError } = await supabase.storage.getBucket('receipts')
if (verifyError || !verified || verified.public) {
  throw new Error('Receipt bucket verification failed: the bucket is still public.')
}

console.log('Receipt storage verified: private, 5 MB maximum, image MIME allowlist enabled.')
