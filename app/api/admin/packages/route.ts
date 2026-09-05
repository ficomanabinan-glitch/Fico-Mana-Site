import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { mapDbPackageRow, type DbPackageRow } from '@/lib/booking-db'
import {
  packageManagerInputToRow,
  validatePackageManagerInput,
} from '@/lib/package-management'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

async function recordPackageAudit(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  actorId: string | null,
  action: 'PACKAGE_CREATED' | 'PACKAGE_UPDATED',
  packageId: string,
  metadata: Record<string, unknown>,
) {
  const { data: workspace } = await admin
    .from('workspaces')
    .select('id')
    .eq('slug', 'fico-mana')
    .maybeSingle()
  if (!workspace?.id) return
  await admin.from('workflow_audit_logs').insert({
    workspace_id: workspace.id,
    actor_type: 'staff',
    actor_id: actorId,
    action,
    metadata: { packageId, ...metadata },
  })
}

async function listAllPackages(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const { data, error } = await admin
    .from('packages')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as DbPackageRow[]).map(mapDbPackageRow)
}

export async function GET() {
  const { error: authError } = await requireStaffAuth()
  if (authError) return authError
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })

  try {
    return NextResponse.json(await listAllPackages(admin), { headers: noStoreHeaders })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load packages.' },
      { status: 500, headers: noStoreHeaders },
    )
  }
}

export async function POST(request: Request) {
  const { user, error: authError } = await requireStaffAuth()
  if (authError) return authError
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })

  try {
    const parsed = validatePackageManagerInput(await request.json())
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { data, error } = await admin
      .from('packages')
      .insert(packageManagerInputToRow(parsed.value))
      .select('*')
      .single()
    if (error) {
      const status = error.code === '23505' ? 409 : 500
      return NextResponse.json(
        { error: status === 409 ? 'That package ID already exists.' : error.message },
        { status },
      )
    }
    await recordPackageAudit(admin, user?.id ?? null, 'PACKAGE_CREATED', parsed.value.id, {
      selectionLimit: parsed.value.selectionLimit,
      active: parsed.value.isActive,
    })
    revalidatePath('/')
    revalidatePath('/packages')
    return NextResponse.json(mapDbPackageRow(data as DbPackageRow), { status: 201, headers: noStoreHeaders })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create package.' },
      { status: 500, headers: noStoreHeaders },
    )
  }
}

export async function PATCH(request: Request) {
  const { user, error: authError } = await requireStaffAuth()
  if (authError) return authError
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })

  try {
    const parsed = validatePackageManagerInput(await request.json())
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const row = packageManagerInputToRow(parsed.value)
    const updates: Partial<typeof row> = { ...row }
    delete updates.id
    const { data, error } = await admin
      .from('packages')
      .update(updates)
      .eq('id', parsed.value.id)
      .select('*')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return NextResponse.json({ error: 'Package not found.' }, { status: 404 })

    await recordPackageAudit(admin, user?.id ?? null, 'PACKAGE_UPDATED', parsed.value.id, {
      selectionLimit: parsed.value.selectionLimit,
      active: parsed.value.isActive,
    })
    revalidatePath('/')
    revalidatePath('/packages')
    return NextResponse.json(mapDbPackageRow(data as DbPackageRow), { headers: noStoreHeaders })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update package.' },
      { status: 500, headers: noStoreHeaders },
    )
  }
}
