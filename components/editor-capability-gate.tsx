'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useEditorSession } from '@/components/editor-portal-shell'
import { EditorPageSkeleton } from '@/components/editor-page-skeleton'

type Capability = 'edit' | 'onsite'
type SkeletonVariant = 'dashboard' | 'queue' | 'onsite' | 'batch'

export default function EditorCapabilityGate({
  capability,
  fallbackHref,
  skeleton,
  children,
}: {
  capability: Capability
  fallbackHref: string
  skeleton: SkeletonVariant
  children: ReactNode
}) {
  const session = useEditorSession()
  const router = useRouter()
  const allowed = Boolean(session?.capabilities[capability])

  useEffect(() => {
    if (session && !allowed) router.replace(fallbackHref)
  }, [allowed, fallbackHref, router, session])

  // EditorPortalShell already validates the authenticated session before it
  // renders children. This gate only handles capability-based UI routing; all
  // editor APIs continue to enforce authorization on the server.
  if (!session || !allowed) return <EditorPageSkeleton variant={skeleton} />
  return <>{children}</>
}
