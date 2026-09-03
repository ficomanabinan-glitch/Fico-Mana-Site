import { config } from 'dotenv'
config({ path: '.env.local' })
import { syncPackagesToDb } from '../lib/supabase-store'
import { getSupabaseAdmin } from '../lib/supabase/admin'

async function run() {
  const admin = getSupabaseAdmin()
  if (!admin) {
    console.error('No admin client')
    return
  }
  const result = await syncPackagesToDb(admin)
  console.log('Sync result:', result)
}
run()
