export default function AdminLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading dashboard">
      <div className="space-y-3">
        <div className="h-7 w-56 rounded-md bg-white/10" />
        <div className="h-4 w-full max-w-xl rounded bg-white/[0.06]" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <div className="h-3 w-20 rounded bg-white/10" />
            <div className="mt-4 h-7 w-14 rounded bg-white/10" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.025] overflow-hidden">
        <div className="h-12 border-b border-white/10 px-4 flex items-center gap-4">
          <div className="h-3 w-24 rounded bg-white/10" />
          <div className="h-3 w-32 rounded bg-white/[0.07]" />
          <div className="ml-auto h-8 w-24 rounded-md bg-white/[0.07]" />
        </div>
        <div className="divide-y divide-white/[0.06]">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="grid grid-cols-[1.2fr_1fr_.8fr] gap-4 px-4 py-4">
              <div className="h-4 rounded bg-white/[0.08]" />
              <div className="h-4 rounded bg-white/[0.06]" />
              <div className="h-4 rounded bg-white/[0.05]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
