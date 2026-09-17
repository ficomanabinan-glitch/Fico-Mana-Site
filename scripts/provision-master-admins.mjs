import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const MASTER_ADMINS = [
  ['master1@ficomana.com', 'Master Admin 1'],
  ['master2@ficomana.com', 'Master Admin 2'],
  ['master3@ficomana.com', 'Master Admin 3'],
  ['master4@ficomana.com', 'Master Admin 4'],
  ['master5@ficomana.com', 'Master Admin 5'],
]

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim()
const password = process.env.MASTER_ADMIN_SHARED_PASSWORD || ''
const confirmation = process.env.MASTER_ADMIN_PROVISION_CONFIRM || ''

if (!url || !secret) throw new Error('Supabase server credentials are required.')
if (!url.startsWith('https://')) throw new Error('Provisioning requires an HTTPS Supabase project URL.')
if (password.length < 12) throw new Error('MASTER_ADMIN_SHARED_PASSWORD must be at least 12 characters.')
if (confirmation !== 'PROVISION_FIVE_MASTER_ADMINS') {
  throw new Error('Set MASTER_ADMIN_PROVISION_CONFIRM=PROVISION_FIVE_MASTER_ADMINS after checking the target project.')
}

const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function existingUsers() {
  const users = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 1000) return users
  }
}

const { data: workspace, error: workspaceError } = await admin
  .from('workspaces')
  .select('id,status')
  .eq('slug', 'fico-mana')
  .single()

if (workspaceError || !workspace || workspace.status !== 'active') {
  throw new Error('The active fico-mana workspace was not found.')
}

const knownUsers = await existingUsers()

for (const [email, displayName] of MASTER_ADMINS) {
  const existing = knownUsers.find((user) => user.email?.toLowerCase() === email)
  const metadata = {
    ...(existing?.app_metadata || {}),
    role: 'owner',
    roles: ['owner', 'admin'],
  }

  const result = existing
    ? await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        app_metadata: metadata,
      })
    : await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: metadata,
      })

  if (result.error || !result.data.user) throw result.error || new Error(`Could not provision ${email}.`)

  const { error: membershipError } = await admin.from('workspace_members').upsert({
    workspace_id: workspace.id,
    user_id: result.data.user.id,
    role: 'owner',
    display_name: displayName,
  }, { onConflict: 'workspace_id,user_id' })

  if (membershipError) throw membershipError
  console.log(`${email}: ready`)
}

console.log('Five master administrators are ready. Credentials were kept private.')
