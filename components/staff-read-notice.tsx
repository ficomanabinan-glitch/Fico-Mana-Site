'use client'

/** Failed reads must never look like a successfully empty operational queue. */
export default function StaffReadNotice({ message, retryLabel, busy, onRetry }: {
  message: string; retryLabel: string; busy: boolean; onRetry: () => void
}) {
  return <section role="alert" className="flex flex-col gap-4 rounded-panel border border-amber-300/25 bg-amber-300/5 p-5 text-sm text-white/85 sm:flex-row sm:items-center sm:justify-between">
    <p>{message}</p>
    <button type="button" disabled={busy} onClick={onRetry} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-control border border-white/20 px-4 font-semibold text-[#C4CEFF] outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[#C4CEFF] disabled:opacity-60">{busy ? 'Retrying…' : retryLabel}</button>
  </section>
}
