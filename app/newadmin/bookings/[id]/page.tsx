import { NewAdminBookingDetail } from '@/components/new-admin/pages'
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <NewAdminBookingDetail id={(await params).id} />
}
