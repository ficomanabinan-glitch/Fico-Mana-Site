'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { emptyConsoleData, sampleConsoleData, type ConsoleData } from '@/lib/new-admin/presentation-data'

const sources = { bookings: '/api/bookings', batches: '/api/editor-workflow/batches', sales: '/api/sales/summary?period=month', drive: '/api/provisioning', packages: '/api/admin/packages' } as const
type Context = { data: ConsoleData; loading: boolean; refreshing: boolean; errors: string[]; sample: boolean; setSample: (value: boolean) => void; refresh: () => Promise<void> }
const DataContext = createContext<Context | null>(null)
export class ConsoleAccessError extends Error {}

export async function readConsoleJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'include' })
  if ([401,403,428].includes(response.status)) throw new ConsoleAccessError('Your secure session needs attention. Try: sign in and complete verification again.')
  if (!response.ok) throw new Error('The records could not be loaded. Try: refresh this view or open the existing console.')
  return response.json() as Promise<T>
}

export function NewAdminDataProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const router = useRouter()
  const [live, setLive] = useState<ConsoleData>(emptyConsoleData)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [sample, setSample] = useState(false)
  const request = useRef<Promise<void> | null>(null)
  const generation = useRef(0)
  const refresh = useCallback(() => {
    if (request.current) return request.current
    setRefreshing(true)
    const version = generation.current
    const work = (async () => {
      const entries = Object.entries(sources) as Array<[keyof ConsoleData, string]>
      const results = await Promise.allSettled(entries.map(async ([name, url]) => [name, await readConsoleJson(url)] as const))
      if (version !== generation.current) return
      const patch: Partial<ConsoleData> = {}
      const failures: string[] = []
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') Object.assign(patch, { [result.value[0]]: result.value[1] })
        else failures.push(`${entries[index][0]}: ${result.reason instanceof Error ? result.reason.message : 'Try: refresh this view.'}`)
      })
      const denied = results.some(result => result.status === 'rejected' && result.reason instanceof ConsoleAccessError)
      setLive(previous => denied ? emptyConsoleData : ({ ...previous, ...patch }))
      setErrors(failures)
      setLoading(false)
      setRefreshing(false)
    })()
    request.current = work
    void work.finally(() => { if (request.current === work) request.current = null })
    return work
  }, [])
  useEffect(() => { void refresh(); return () => { generation.current += 1; request.current = null } }, [refresh])
  useEffect(() => {
    const { data: { subscription } } = createSupabaseBrowserClient().auth.onAuthStateChange((_event, session) => {
      if (!session || session.user.id !== userId) {
        generation.current += 1; request.current = null
        setLive(emptyConsoleData); setSample(false); setRefreshing(false)
        setErrors(['Your account session changed. Try: sign in to continue.'])
        router.refresh()
      }
    })
    return () => subscription.unsubscribe()
  }, [router,userId])
  const samples = useMemo(() => sampleConsoleData(), [])
  return <DataContext.Provider value={{ data: sample ? samples : live, loading: !sample && loading, refreshing, errors: sample ? [] : errors, sample, setSample, refresh }}>{children}</DataContext.Provider>
}
export function useConsoleData() { const context = useContext(DataContext); if (!context) throw new Error('New admin provider is missing'); return context }
