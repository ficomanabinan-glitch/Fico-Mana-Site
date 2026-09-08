const pulse = 'animate-pulse rounded-control bg-white/[0.07]'

export default function PortalPageSkeleton() {
  return (
    <main className="client-portal min-h-screen bg-[#171717] text-white" aria-label="Loading Client Portal">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 sm:py-12">
        <header className="border-b border-white/10 pb-6">
          <div className={`${pulse} h-3 w-44`} />
          <div className="mt-4 flex items-end justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-3"><div className={`${pulse} h-10 w-72 max-w-full`} /><div className={`${pulse} h-3 w-24`} /></div>
            <div className={`${pulse} hidden h-16 w-36 sm:block`} />
          </div>
        </header>
        <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,420px)]">
          <section className="min-w-0 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 2 }).map((_, index) => <div key={index} className="rounded-card border border-white/10 p-6"><div className={`${pulse} h-3 w-28`} /><div className={`${pulse} mt-5 h-6 w-40`} /><div className={`${pulse} mt-3 h-3 w-32`} /></div>)}</div>
            <div className="rounded-card border border-white/10 p-6"><div className={`${pulse} h-6 w-56 max-w-full`} /><div className={`${pulse} mt-4 h-12 w-full`} /><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className={`${pulse} aspect-[4/5] w-full rounded-card`} />)}</div></div>
          </section>
          <aside className="space-y-5"><div className="rounded-card border border-white/10 p-6"><div className={`${pulse} h-4 w-40`} />{Array.from({ length: 5 }).map((_, index) => <div key={index} className={`${pulse} mt-4 h-4 w-full`} />)}</div><div className={`${pulse} h-64 w-full rounded-card`} /></aside>
        </div>
      </div>
    </main>
  )
}
