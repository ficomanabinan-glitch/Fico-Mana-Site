import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

type ResourceType = 'photos' | 'video' | 'invoice' | 'agreement' | 'meeting_document' | 'project_update' | 'other'
const TYPES = new Set<ResourceType>(['photos','video','invoice','agreement','meeting_document','project_update','other'])

type Body = {
  resourceType?: ResourceType
  title?: string
  url?: string
  content?: string
  isVisible?: boolean
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = await requireStaffAuth()
  if (authError) return authError
  const { id } = await params
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
  const { data, error } = await admin
    .from('client_portal_resources')
    .select('*')
    .eq('booking_id', id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error: authError } = await requireStaffAuth()
  if (authError) return authError
  try {
    const { id } = await params
    const body = (await request.json()) as Body
    const resourceType = body.resourceType || 'other'
    const title = body.title?.trim() || ''
    const url = body.url?.trim() || null
    const content = body.content?.trim() || null
    if (!TYPES.has(resourceType)) return NextResponse.json({ error: 'Invalid resource type.' }, { status: 400 })
    if (!title) return NextResponse.json({ error: 'Resource title is required.' }, { status: 400 })
    if (!url && !content) return NextResponse.json({ error: 'Add a URL or update text.' }, { status: 400 })
    if (url && !/^https:\/\//i.test(url)) return NextResponse.json({ error: 'Resource URL must use HTTPS.' }, { status: 400 })

    const admin = getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
    const { data: booking } = await admin.from('bookings').select('id').eq('id', id).maybeSingle()
    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })

    const { data, error } = await admin
      .from('client_portal_resources')
      .insert({
        booking_id: id,
        resource_type: resourceType,
        title,
        url,
        content,
        is_visible: body.isVisible !== false,
      })
      .select('*')
      .single()
    if (error || !data) throw new Error(error?.message || 'Could not save portal resource.')

    await admin.from('provisioning_audit').insert({
      booking_id: id,
      action: 'portal_resource_added',
      actor_type: 'staff',
      actor_id: user?.id || null,
      external_resource_id: String(data.id),
      metadata: { resourceType, title, visible: body.isVisible !== false },
    })
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save resource.' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error: authError } = await requireStaffAuth()
  if (authError) return authError
  try {
    const { id } = await params
    const body = (await request.json()) as { resourceId?: string }
    const resourceId = body.resourceId?.trim()
    if (!resourceId) return NextResponse.json({ error: 'Resource ID is required.' }, { status: 400 })
    const admin = getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
    const { data, error } = await admin
      .from('client_portal_resources')
      .delete()
      .eq('booking_id', id)
      .eq('id', resourceId)
      .select('id')
    if (error) throw new Error(error.message)
    if (!data?.length) return NextResponse.json({ error: 'Resource not found.' }, { status: 404 })
    await admin.from('provisioning_audit').insert({
      booking_id: id,
      action: 'portal_resource_removed',
      actor_type: 'staff',
      actor_id: user?.id || null,
      external_resource_id: resourceId,
      metadata: {},
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not remove resource.' }, { status: 500 })
  }
}
