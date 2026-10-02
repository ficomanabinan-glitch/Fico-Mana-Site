import ClientWorkspace from '@/components/client-workspace'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Client workspace | FICO MANA', robots: { index: false, follow: false } }

export default async function ClientWorkspacePage({ params, searchParams }: {
  params: Promise<{ clientId: string }>
  searchParams: Promise<{ booking?: string | string[] }>
}) {
  const [{ clientId }, query] = await Promise.all([params, searchParams])
  return <ClientWorkspace clientId={clientId} bookingId={typeof query.booking === 'string' ? query.booking : undefined}/>
}
