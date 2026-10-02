'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { safeClientWorkspaceReturn, staffWorkflowHref } from '@/lib/client-workspace-navigation'

export default function ClientWorkspaceReturn() {
  return <Suspense><ReturnLink/></Suspense>
}
function ReturnLink() {
  const searchParams = useSearchParams()
  const value = searchParams.get('return')
  const [href, setHref] = useState<string | null>(null)
  useEffect(() => {
    const update = () => {
      const path = safeClientWorkspaceReturn(value)
      setHref(path ? staffWorkflowHref(path, window.location.origin) : null)
    }
    update()
  }, [value])
  if (!href) return null
  return <Link href={href} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-control border border-white/15 px-3 text-sm text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary"><ArrowLeft aria-hidden="true" className="size-4"/>Back to client workspace</Link>
}
