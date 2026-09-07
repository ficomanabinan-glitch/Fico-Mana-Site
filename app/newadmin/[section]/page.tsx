import { notFound } from 'next/navigation'
import NewAdminPage from '@/components/new-admin/pages'
import { newAdminSections, type NewAdminSection } from '@/lib/new-admin/routing'

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!Object.hasOwn(newAdminSections, section)) notFound()
  return <NewAdminPage section={section as NewAdminSection} />
}
