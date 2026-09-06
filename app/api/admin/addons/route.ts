import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireStaffAuth } from '@/lib/auth-api'
import { canUseWorkflow, getWorkflowAccess } from '@/lib/auth/workflow'
import { secureErrorResponse } from '@/lib/security/error-response'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }
const addonSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(''),
  priceAmount: z.number().finite().nonnegative().max(10_000_000),
  pricingType: z.enum(['fixed', 'per_photo', 'per_piece']),
  displayOrder: z.number().int().min(0).max(9_999),
  maxQuantity: z.number().int().min(1).max(500),
  status: z.enum(['active', 'disabled', 'archived']),
}).strict()

function mapAddon(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description || ''),
    priceAmount: Number(row.price_amount || 0),
    pricingType: String(row.pricing_type),
    displayOrder: Number(row.display_order || 0),
    maxQuantity: Number(row.max_quantity || 1),
    status: String(row.status),
    updatedAt: String(row.updated_at || ''),
  }
}

async function authorize(request?: Request) {
  const auth = await requireStaffAuth(request)
  if (auth.error || !auth.user) return { error: auth.error, access: null }
  const access = await getWorkflowAccess(auth.user)
  if (!access || !canUseWorkflow(access, 'admin')) {
    return { error: NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 }), access: null }
  }
  return { error: null, access }
}

export async function GET() {
  const auth = await authorize()
  if (auth.error || !auth.access) return auth.error
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
  try {
    const { data, error } = await admin.from('addon_catalog').select('*').eq('workspace_id', auth.access.workspaceId).order('display_order').order('name')
    if (error) throw new Error(error.message)
    return NextResponse.json((data || []).map(mapAddon), { headers: noStoreHeaders })
  } catch (error) {
    return secureErrorResponse(error, 'Failed to load add-ons.', { context: 'GET /api/admin/addons' })
  }
}

export async function POST(request: Request) {
  const auth = await authorize(request)
  if (auth.error || !auth.access) return auth.error
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
  try {
    const parsed = addonSchema.omit({ id: true }).safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Enter valid add-on details.' }, { status: 400 })
    const value = parsed.data
    const { data, error } = await admin.from('addon_catalog').insert({
      workspace_id: auth.access.workspaceId,
      name: value.name,
      description: value.description,
      price_amount: value.priceAmount,
      pricing_type: value.pricingType,
      display_order: value.displayOrder,
      max_quantity: value.maxQuantity,
      status: value.status,
    }).select('*').single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'An add-on with this name already exists.' }, { status: 409 })
      throw new Error(error.message)
    }
    return NextResponse.json(mapAddon(data), { status: 201, headers: noStoreHeaders })
  } catch (error) {
    return secureErrorResponse(error, 'Failed to create add-on.', { request, context: 'POST /api/admin/addons' })
  }
}

export async function PATCH(request: Request) {
  const auth = await authorize(request)
  if (auth.error || !auth.access) return auth.error
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
  try {
    const parsed = addonSchema.required({ id: true }).safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Enter valid add-on details.' }, { status: 400 })
    const value = parsed.data
    const { data, error } = await admin.from('addon_catalog').update({
      name: value.name,
      description: value.description,
      price_amount: value.priceAmount,
      pricing_type: value.pricingType,
      display_order: value.displayOrder,
      max_quantity: value.maxQuantity,
      status: value.status,
    }).eq('workspace_id', auth.access.workspaceId).eq('id', value.id).select('*').maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return NextResponse.json({ error: 'Add-on not found.' }, { status: 404 })
    return NextResponse.json(mapAddon(data), { headers: noStoreHeaders })
  } catch (error) {
    return secureErrorResponse(error, 'Failed to update add-on.', { request, context: 'PATCH /api/admin/addons' })
  }
}
