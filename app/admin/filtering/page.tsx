import { redirect } from 'next/navigation'

/** Raw photo filtering now lives in its own standalone dashboard. */
export default function AdminFilteringRedirectPage() {
  redirect('/filtering')
}
