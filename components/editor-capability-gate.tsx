'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useEditorSession } from '@/components/editor-portal-shell'

type EditorCapability = 'edit' | 'onsite'

/**
 * The persistent Editor shell has already validated the session. This gate
 * keeps route transitions client-side while protected APIs still authorize
 * every read and mutation on the server.
 */
export default function EditorCapabilityGate({
  capability,
  fallback,
  children,
}: {
  capability: EditorCapability
  fallback: string
  children: ReactNode
}) {
  const session = useEditorSession()
  const router = useRouter()
  const allowed = Boolean(session?.capabilities[capability])

  useEffect(() => {
    if (session && !allowed) router.replace(fallback)
  }, [allowed, fallback, router, session])

  if (!session || !allowed) return null
  return <>{children}</>
}
