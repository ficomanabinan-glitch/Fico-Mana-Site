import { redirect } from 'next/navigation'

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

/** Keep legacy /filtering links working while rendering inside the admin shell. */
export default async function FilteringRedirectPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {}
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item)
    } else if (value !== undefined) {
      query.set(key, value)
    }
  }

  const suffix = query.toString()
  redirect(`/admin/filtering${suffix ? `?${suffix}` : ''}`)
}
