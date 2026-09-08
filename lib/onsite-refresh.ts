import { invalidateEditorBatchCache } from '@/lib/editor-read-cache'

/** Signal a read refresh only; never broadcast client records or credentials. */
export function notifyOnsitePhotosChanged() {
  invalidateEditorBatchCache()
  window.dispatchEvent(new Event('admin:db-synced'))
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('fico-workflow-refresh')
    channel.postMessage('photos-changed')
    channel.close()
  }
}
