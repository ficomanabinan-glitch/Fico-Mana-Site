import type { SupabaseClient } from '@supabase/supabase-js'
import { GraduationWorkflowOnlyError, usesGraduationWorkflow } from './package-workflow.ts'

export async function packageUsesGraduationWorkflow(admin: SupabaseClient, packageId: string) {
  const { data, error } = await admin.from('packages').select('category').eq('id', packageId).maybeSingle()
  if (error) throw new Error('Package rules could not be checked. Try: refresh and check Package Manager.')
  return usesGraduationWorkflow(data?.category)
}

export async function graduationPackageIds(admin: SupabaseClient) {
  const ids: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.from('packages').select('id').eq('category', 'graduation')
      .order('id').range(offset, offset + 999)
    if (error) throw new Error('Package rules could not be checked. Try: refresh and check Package Manager.')
    ids.push(...(data || []).map(row => String(row.id)))
    if (!data || data.length < 1000) return ids
  }
}

export async function assertGraduationBooking(admin: SupabaseClient, bookingId: string, workspaceId?: string) {
  let query = admin.from('bookings').select('package_id').eq('id', bookingId)
  if (workspaceId) query = query.eq('workspace_id', workspaceId)
  const { data, error } = await query.single()
  if (error || !data) throw new Error('Booking not found in this workspace.')
  if (!await packageUsesGraduationWorkflow(admin, String(data.package_id))) throw new GraduationWorkflowOnlyError()
}

export async function graduationBookingIds(admin: SupabaseClient, workspaceId: string, bookingIds: string[]) {
  const packageIds = await graduationPackageIds(admin)
  if (!packageIds.length || !bookingIds.length) return new Set<string>()
  const allowed = new Set<string>()
  for (let index = 0; index < bookingIds.length; index += 500) {
    const { data, error } = await admin.from('bookings').select('id').eq('workspace_id', workspaceId)
      .in('package_id', packageIds).in('id', bookingIds.slice(index, index + 500))
    if (error) throw new Error('Package rules could not be checked. Try: refresh and check Package Manager.')
    for (const row of data || []) allowed.add(String(row.id))
  }
  return allowed
}
