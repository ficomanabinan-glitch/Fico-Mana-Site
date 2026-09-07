'use client'

import { usePathname } from 'next/navigation'

type Variant = 'dashboard' | 'bookings' | 'verification' | 'calendar' | 'emails' | 'filtering'

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-white/[0.08] ${className}`} />
}

function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2.5">
        <Bar className="h-7 w-56" />
        <Bar className="h-4 w-[min(34rem,75vw)]" />
      </div>
      <Bar className="h-10 w-32" />
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading dashboard">
      <HeaderSkeleton />

      <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <Bar className="h-11 w-full" />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[118px] rounded-xl border border-white/10 bg-white/[0.03] p-5 flex gap-4">
            <div className="h-11 w-11 rounded-xl bg-white/[0.09] shrink-0" />
            <div className="flex-1 space-y-3 pt-0.5">
              <Bar className="h-3 w-24" />
              <Bar className="h-7 w-20" />
              <Bar className="h-3 w-36 max-w-full" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 h-[360px] rounded-xl border border-white/10 bg-white/[0.025] p-5">
          <div className="flex justify-between items-center border-b border-white/10 pb-4">
            <div className="space-y-2"><Bar className="h-4 w-44" /><Bar className="h-3 w-20" /></div>
            <Bar className="h-9 w-28" />
          </div>
          <div className="space-y-4 pt-5">
            {Array.from({ length: 5 }).map((_, i) => <Bar key={i} className="h-11 w-full" />)}
          </div>
        </div>
        <div className="lg:col-span-5 h-[360px] rounded-xl border border-white/10 bg-white/[0.025] p-5">
          <Bar className="h-4 w-36 mb-6" />
          <div className="h-[250px] flex items-end gap-3">
            {[45, 70, 38, 82, 58, 92, 64].map((h, i) => (
              <div key={i} className="flex-1 rounded-t bg-white/[0.07]" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function BookingsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading bookings">
      <HeaderSkeleton />

      <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <Bar className="h-10 sm:col-span-2 lg:col-span-2" />
        <Bar className="h-10" />
        <Bar className="h-10" />
        <Bar className="h-10" />
        <Bar className="h-10" />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.025] overflow-hidden">
        <div className="h-12 border-b border-white/10 px-4 grid grid-cols-[1.2fr_1fr_1fr_.9fr_.8fr] gap-4 items-center">
          {Array.from({ length: 5 }).map((_, i) => <Bar key={i} className="h-3" />)}
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="min-h-16 border-b last:border-b-0 border-white/[0.06] px-4 grid grid-cols-[1.2fr_1fr_1fr_.9fr_.8fr] gap-4 items-center">
            {Array.from({ length: 5 }).map((_, j) => (
              <Bar key={j} className={`h-4 ${j === 0 ? 'w-4/5' : 'w-full'}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function VerificationSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading verification queue">
      <HeaderSkeleton />

      <div className="border border-white/10 bg-white/[0.025] p-4 space-y-3">
        <Bar className="h-10 w-full" />
        <Bar className="h-3 w-40" />
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border border-white/10 bg-white/[0.025] overflow-hidden min-h-[430px]">
            <div className="h-48 bg-white/[0.07] border-b border-white/10" />
            <div className="p-5 space-y-4">
              <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
                <div className="space-y-2 flex-1"><Bar className="h-4 w-28" /><Bar className="h-3 w-20" /></div>
                <Bar className="h-5 w-20" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Bar className="h-3 w-16" /><Bar className="h-4 w-24" /><Bar className="h-3 w-20" /></div>
                <div className="space-y-2"><Bar className="h-3 w-20" /><Bar className="h-4 w-full" /></div>
              </div>
              <div className="border-t border-white/10 pt-3 flex justify-between"><Bar className="h-3 w-24" /><Bar className="h-4 w-14" /></div>
            </div>
            <div className="border-t border-white/10 bg-white/[0.02] p-3 grid grid-cols-2 gap-2">
              <Bar className="h-9 w-full" /><Bar className="h-9 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CalendarSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading calendar">
      <HeaderSkeleton />

      <div className="grid xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] gap-6 items-start">
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 min-h-[430px]">
          <div className="flex justify-between mb-5"><Bar className="h-4 w-28" /><Bar className="h-8 w-20" /></div>
          <div className="grid grid-cols-7 gap-2 mb-3">
            {Array.from({ length: 7 }).map((_, i) => <Bar key={i} className="h-3" />)}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 42 }).map((_, i) => <div key={i} className="aspect-square rounded bg-white/[0.06]" />)}
          </div>
        </div>

        <div className="space-y-5">
          <div className="min-h-[190px] rounded-xl border border-white/10 bg-white/[0.025] p-5 space-y-4">
            <Bar className="h-5 w-44" /><Bar className="h-10 w-full" /><Bar className="h-10 w-3/4" />
          </div>
          <div className="min-h-[300px] rounded-xl border border-white/10 bg-white/[0.025] p-5 space-y-4">
            <Bar className="h-5 w-40" />
            {Array.from({ length: 4 }).map((_, i) => <Bar key={i} className="h-12 w-full" />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function EmailsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading email logs">
      <HeaderSkeleton />

      <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <Bar className="h-11 w-full" />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.025] overflow-hidden divide-y divide-white/[0.06]">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="p-5 flex items-center justify-between gap-5 min-h-[92px]">
            <div className="flex-1 space-y-2"><Bar className="h-3 w-2/3" /><Bar className="h-4 w-1/2" /><Bar className="h-3 w-32" /></div>
            <Bar className="h-9 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}

function FilteringSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading filtering dashboard">
      <HeaderSkeleton />

      <div className="rounded-xl border border-white/10 bg-white/[0.025] p-1.5 flex gap-1 overflow-hidden">
        <Bar className="h-10 w-[112px] shrink-0" />
        <Bar className="h-10 w-[132px] shrink-0" />
        <Bar className="h-10 w-[106px] shrink-0" />
        <Bar className="h-10 w-[92px] shrink-0" />
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="min-h-[145px] rounded-xl border border-white/10 bg-white/[0.025] p-5 flex justify-between gap-3">
            <div className="space-y-3 flex-1"><Bar className="h-3 w-24" /><Bar className="h-8 w-16" /><Bar className="h-3 w-full" /><Bar className="h-3 w-20" /></div>
            <div className="h-9 w-9 rounded-lg bg-white/[0.08]" />
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="min-h-[335px] rounded-xl border border-white/10 bg-white/[0.025] p-5">
          <div className="flex justify-between mb-5"><div className="space-y-2"><Bar className="h-3 w-20" /><Bar className="h-4 w-40" /></div><Bar className="h-3 w-20" /></div>
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2"><div className="flex justify-between"><Bar className="h-5 w-28" /><Bar className="h-4 w-7" /></div><Bar className="h-1.5 w-full" /></div>
            ))}
          </div>
        </div>

        <div className="min-h-[335px] rounded-xl border border-white/10 bg-white/[0.025] overflow-hidden">
          <div className="p-4 border-b border-white/10 flex justify-between"><div className="space-y-2"><Bar className="h-3 w-20" /><Bar className="h-4 w-40" /></div><Bar className="h-3 w-16" /></div>
          <div className="divide-y divide-white/[0.06]">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="p-4 flex justify-between gap-4"><div className="space-y-2 flex-1"><Bar className="h-4 w-40" /><Bar className="h-3 w-52 max-w-full" /></div><div className="space-y-2"><Bar className="h-3 w-20" /><Bar className="h-3 w-12 ml-auto" /></div></div>)}
          </div>
        </div>
      </div>
    </div>
  )
}

export function AdminPageSkeleton({ variant }: { variant: Variant }) {
  if (variant === 'bookings') return <BookingsSkeleton />
  if (variant === 'verification') return <VerificationSkeleton />
  if (variant === 'calendar') return <CalendarSkeleton />
  if (variant === 'emails') return <EmailsSkeleton />
  if (variant === 'filtering') return <FilteringSkeleton />
  return <DashboardSkeleton />
}

export default function RouteAwareAdminSkeleton() {
  const pathname = usePathname()

  if (pathname.includes('/bookings')) return <AdminPageSkeleton variant="bookings" />
  if (pathname.includes('/verification')) return <AdminPageSkeleton variant="verification" />
  if (pathname.includes('/calendar')) return <AdminPageSkeleton variant="calendar" />
  if (pathname.includes('/emails')) return <AdminPageSkeleton variant="emails" />
  if (pathname.includes('/filtering')) return <AdminPageSkeleton variant="filtering" />
  return <AdminPageSkeleton variant="dashboard" />
}
