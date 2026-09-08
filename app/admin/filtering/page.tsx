import { redirect } from 'next/navigation'

export default async function AdminFilteringPage({ searchParams }: { searchParams: Promise<{ search?: string; tab?: string }> }) {
  const query = await searchParams
  const params = new URLSearchParams()
  if (query.search) params.set('search', query.search)
  if (query.tab) params.set('tab', query.tab)
  const base = process.env.NODE_ENV === 'production' ? 'https://editor.ficomana.com' : ''
  redirect(`${base}/editor/filtering${params.size ? `?${params}` : ''}`)
}
