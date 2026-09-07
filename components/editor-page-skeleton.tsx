'use client'

import { usePathname } from 'next/navigation'
import { adminPanel } from '@/lib/admin-ui'

type EditorSkeletonVariant = 'dashboard' | 'queue' | 'onsite' | 'batch'

function SkeletonBar({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-white/[0.08] ${className}`} />
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading editor dashboard">
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 sm:flex-row sm:justify-between">
        <div className="space-y-3">
          <SkeletonBar className="h-3 w-48" />
          <SkeletonBar className="h-9 w-80 max-w-[75vw]" />
          <SkeletonBar className="h-4 w-[min(38rem,80vw)]" />
        </div>
        <SkeletonBar className="h-9 w-40" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={`${adminPanel} space-y-3 p-4`}>
            <SkeletonBar className="h-3 w-28" />
            <SkeletonBar className="h-9 w-16" />
          </div>
        ))}
      </div>
      <div className={`${adminPanel} space-y-4 p-card`}>
        <SkeletonBar className="h-4 w-40" />
        <div className="grid gap-px overflow-hidden bg-white/[0.06] sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-3 bg-[#222222] p-4">
              <SkeletonBar className="h-3 w-20" />
              <SkeletonBar className="h-8 w-24" />
              <SkeletonBar className="h-3 w-32" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className={`${adminPanel} space-y-4 p-5`}>
            <SkeletonBar className="h-3 w-24" />
            <SkeletonBar className="h-6 w-48" />
            <SkeletonBar className="h-4 w-full" />
            <div className="flex gap-2"><SkeletonBar className="h-10 w-40" /><SkeletonBar className="h-10 w-32" /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function QueueSkeleton() {
  return (
    <div className="space-y-5 animate-pulse" aria-label="Loading editing queue">
      <div className={`${adminPanel} grid min-w-0 gap-4 p-4`}>
        <div className="grid min-w-0 gap-3 2xl:grid-cols-[minmax(16rem,1fr)_auto_auto]">
          <SkeletonBar className="h-11 w-full" />
          <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap">
            <SkeletonBar className="h-[70px] w-full sm:h-11 sm:w-64" />
            <SkeletonBar className="h-[70px] w-full sm:h-11 sm:w-72" />
          </div>
          <SkeletonBar className="h-11 w-full 2xl:w-28" />
        </div>
        <div className="grid min-w-0 gap-2"><SkeletonBar className="h-[18px] w-20" /><SkeletonBar className="h-11 w-full" /></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <SkeletonBar key={index} className="h-[76px] w-full rounded-control" />)}</div>
        <SkeletonBar className="h-28 w-full sm:h-20 lg:h-10" />
      </div>
      <SkeletonBar className="h-[70px] w-full rounded-control sm:h-[54px]" />
      <div className="space-y-4">
        <div className="space-y-2 border-b border-white/[0.08] pb-3"><SkeletonBar className="h-3 w-20" /><SkeletonBar className="h-5 w-52 max-w-full" /></div>
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className={`${adminPanel} overflow-hidden`}>
            <div className="flex min-w-0 flex-col justify-between gap-4 border-b border-white/[0.08] p-5 2xl:flex-row">
              <div className="min-w-0 space-y-3"><SkeletonBar className="h-3 w-28" /><SkeletonBar className="h-7 w-64 max-w-full" /><SkeletonBar className="h-3 w-44 max-w-full" /></div>
              <div className="flex min-w-0 flex-wrap gap-2">{Array.from({length:4}).map((_, actionIndex) => <SkeletonBar key={actionIndex} className="h-11 w-36 max-w-full" />)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 xl:grid-cols-7">{Array.from({ length: 7 }).map((_, metricIndex) => <div key={metricIndex} className="min-w-0 space-y-2 rounded-control border border-white/[0.07] bg-black/10 p-3"><SkeletonBar className="h-[18px] w-24 max-w-full" /><SkeletonBar className="h-7 w-8" /></div>)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function OnsiteSkeleton() {
  return (
    <div className="space-y-5 animate-pulse" aria-label="Loading onsite upload">
      <div className={`${adminPanel} space-y-5 p-5`}>
        <div className="flex flex-col justify-between gap-4 sm:flex-row">
          <div className="min-w-0 space-y-3"><SkeletonBar className="h-[18px] w-28" /><SkeletonBar className="h-16 w-96 max-w-full sm:h-10" /><SkeletonBar className="h-4 w-[min(38rem,100%)]" /></div>
          <SkeletonBar className="h-14 w-52" />
        </div>
        <SkeletonBar className="h-11 w-full" />
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className={`${adminPanel} grid gap-4 p-card 2xl:grid-cols-2 2xl:items-center`}>
          <div className="min-w-0 space-y-3"><SkeletonBar className="h-6 w-48 max-w-full" /><SkeletonBar className="h-[18px] w-72 max-w-full" /><SkeletonBar className="h-[18px] w-40" /><SkeletonBar className="h-[18px] w-80 max-w-full" /></div>
          <div className="flex flex-wrap items-start gap-2"><SkeletonBar className="h-11 w-36" /><SkeletonBar className="h-11 w-24" /><SkeletonBar className="h-11 w-32" /><SkeletonBar className="h-11 w-28" /></div>
        </div>
      ))}
    </div>
  )
}

function BatchSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading editing batch">
      <div className="flex flex-col justify-between gap-4 border-b border-white/[0.08] pb-5 sm:flex-row">
        <div className="space-y-3"><SkeletonBar className="h-3 w-28" /><SkeletonBar className="h-8 w-48" /><SkeletonBar className="h-3 w-64" /></div>
        <div className="flex flex-wrap gap-2"><SkeletonBar className="h-10 w-40" /><SkeletonBar className="h-10 w-36" /><SkeletonBar className="h-10 w-40" /></div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-white/[0.06] sm:grid-cols-4 xl:grid-cols-8">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="space-y-2 bg-[#222222] p-4"><SkeletonBar className="h-2 w-16" /><SkeletonBar className="h-7 w-10" /></div>)}</div>
      <div className={`${adminPanel} overflow-hidden`}>
        <div className="space-y-2 border-b border-white/[0.08] p-4"><SkeletonBar className="h-3 w-24" /><SkeletonBar className="h-5 w-64" /></div>
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="flex flex-col justify-between gap-4 border-b border-white/[0.06] p-4 last:border-0 sm:flex-row"><div className="space-y-3"><SkeletonBar className="h-5 w-48" /><SkeletonBar className="h-3 w-80 max-w-[70vw]" /><SkeletonBar className="h-3 w-64" /></div><div className="flex gap-2"><SkeletonBar className="h-9 w-28" /><SkeletonBar className="h-9 w-28" /></div></div>)}
      </div>
    </div>
  )
}

export function EditorPageSkeleton({ variant }: { variant: EditorSkeletonVariant }) {
  if (variant === 'queue') return <QueueSkeleton />
  if (variant === 'onsite') return <OnsiteSkeleton />
  if (variant === 'batch') return <BatchSkeleton />
  return <DashboardSkeleton />
}

export default function RouteAwareEditorSkeleton() {
  const pathname = usePathname()
  if (pathname.includes('/queue')) return <EditorPageSkeleton variant="queue" />
  if (pathname.includes('/onsite')) return <EditorPageSkeleton variant="onsite" />
  if (pathname.includes('/batch/')) return <EditorPageSkeleton variant="batch" />
  return <EditorPageSkeleton variant="dashboard" />
}
