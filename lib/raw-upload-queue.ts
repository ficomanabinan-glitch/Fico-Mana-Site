import { uploadRawDirect } from '@/lib/raw-upload-client'

export const RAW_UPLOAD_CONCURRENCY = 3
type ActiveFile = { index: number; name: string; loaded: number; total: number; verifying: boolean }
export type RawQueueProgress = {
  uploaded: number; total: number; failed: File[]; bytesProcessed: number; totalBytes: number
  activeFiles: ActiveFile[]; status: 'uploading' | 'complete' | 'partial'; lastError: string | null
}

// Shared by all client cards in this page. Three clients do not create nine transfers.
let running = 0
const waiting: Array<() => void> = []
async function takeSlot() {
  if (running < RAW_UPLOAD_CONCURRENCY) running++
  else await new Promise<void>(resolve => waiting.push(resolve))
  return () => { const next = waiting.shift(); if (next) next(); else running-- }
}

/** Bound memory/network work, retain per-file retries and count only actual transferred bytes. */
export async function uploadRawQueue(
  bookingId: string, supplied: File[], onProgress: (state: RawQueueProgress) => void,
  transfer: typeof uploadRawDirect = uploadRawDirect,
) {
  const files = [...new Set(supplied)]
  const loaded = files.map(() => 0)
  const failures = new Map<number, File>()
  const active = new Map<number, ActiveFile>()
  let uploaded = 0, next = 0, finished = 0
  let lastError: string | null = null
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  function snapshot(): RawQueueProgress {
    return {
      uploaded, total: files.length, failed: [...failures.entries()].sort(([a], [b]) => a - b).map(([, file]) => file),
      bytesProcessed: loaded.reduce((sum, bytes) => sum + bytes, 0), totalBytes,
      activeFiles: [...active.values()].map(file => ({ ...file })),
      status: finished === files.length ? (failures.size ? 'partial' : 'complete') : 'uploading', lastError,
    }
  }
  const emit = () => onProgress(snapshot())
  emit()
  async function worker() {
    while (next < files.length) {
      const index = next++, file = files[index]
      const release = await takeSlot()
      active.set(index, { index, name: file.name, loaded: 0, total: file.size, verifying: false })
      emit()
      try {
        await transfer(bookingId, file, bytes => {
          loaded[index] = Math.max(0, Math.min(file.size, bytes))
          active.set(index, { index, name: file.name, loaded: loaded[index], total: file.size, verifying: loaded[index] >= file.size })
          emit()
        })
        loaded[index] = file.size
        uploaded++
      } catch (error) {
        failures.set(index, file)
        lastError = error instanceof Error ? error.message : 'The photo could not be uploaded.'
        if (!/\bTry:/i.test(lastError)) lastError += ' Try: retry the failed file. If it repeats, reload the page and select it again.'
      } finally {
        active.delete(index); finished++; release(); emit()
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(RAW_UPLOAD_CONCURRENCY, files.length) }, worker))
  return snapshot()
}
