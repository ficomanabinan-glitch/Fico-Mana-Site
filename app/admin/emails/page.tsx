'use client'

import { useEffect, useState } from 'react'
import { getEmailLogs, EmailLog } from '@/lib/data-store'
import { Search, Clock, Eye, X } from 'lucide-react'
import {
  adminPage,
  adminCard,
  adminPanel,
  adminInput,
  adminBtnGhost,
  adminOverlay,
  adminModal,
  adminSpinnerWrap,
  adminSpinner,
  emailStatusBadge,
} from '@/lib/admin-ui'
import AdminPageHeader from '@/components/admin-page-header'
import AdminOpsNotes from '@/components/admin-ops-notes'
import { useOnAdminDbSync } from '@/components/admin-auto-sync'
import { useAdminToast } from '@/components/admin-toast-provider'

export default function EmailLogsConsole() {
  const toast = useAdminToast()
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [filteredLogs, setFilteredLogs] = useState<EmailLog[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLog, setSelectedLog] = useState<EmailLog | null>(null)

  const fetchLogs = async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const data = await getEmailLogs()
      setLogs(data)
      setFilteredLogs(data)
    } catch (err) {
      console.error(err)
      if (!silent) toast.error('Sync failed', 'Could not load email logs from database.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchLogs(true)
  }, [])

  useOnAdminDbSync(() => fetchLogs(true))

  useEffect(() => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      setFilteredLogs(
        logs.filter(
          (l) =>
            l.recipientEmail.toLowerCase().includes(term) ||
            l.subject.toLowerCase().includes(term) ||
            l.bookingId.toLowerCase().includes(term),
        ),
      )
    } else {
      setFilteredLogs(logs)
    }
  }, [searchTerm, logs])

  if (loading) {
    return (
      <div className={adminSpinnerWrap}>
        <div className={adminSpinner} />
      </div>
    )
  }

  return (
    <div className={adminPage}>
      <AdminPageHeader
        title="System Email Logs"
        subtitle="Live feed of emails dispatched by the booking and verification system."
        onRefresh={() => fetchLogs()}
        refreshing={refreshing}
      />

      <AdminOpsNotes />

      <div className={`${adminCard} p-4`}>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by recipient, subject, or booking reference..."
            className={`${adminInput} pl-11`}
          />
        </div>
      </div>

      <div className={`${adminPanel} overflow-hidden divide-y divide-white/5`}>
        {filteredLogs.length === 0 ? (
          <div className="p-16 text-center text-white/40 text-xs">No system email logs found.</div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className="p-5 hover:bg-white/[0.02] transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-primary">{log.bookingId}</span>
                  <span className="text-white/20">&bull;</span>
                  <span className="font-semibold text-white/80">{log.recipientEmail}</span>
                  <span className="text-white/20">&bull;</span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 uppercase ${emailStatusBadge(log.status as 'SENT' | 'FAILED')}`}>
                    {log.status}
                  </span>
                </div>
                <h4 className="font-bold text-white truncate">{log.subject}</h4>
                <div className="flex items-center gap-1 text-[10px] text-white/40">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(log.sentAt).toLocaleString()}</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedLog(log)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 ${adminBtnGhost}`}
              >
                <Eye className="w-3.5 h-3.5" /> View Body
              </button>
            </div>
          ))
        )}
      </div>

      {selectedLog && (
        <div className={`${adminOverlay} items-center justify-center p-4`}>
          <div className={`${adminModal} max-w-2xl w-full flex flex-col h-[85vh]`}>
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <div className="space-y-0.5">
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Email Inspector</span>
                <h3 className="font-bold text-white">{selectedLog.subject}</h3>
                <p className="text-[10px] text-white/40">
                  Sent to: {selectedLog.recipientEmail} on {new Date(selectedLog.sentAt).toLocaleString()}
                </p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="p-1.5 hover:bg-white/5 text-white/40">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 bg-black/40 p-4 sm:p-6 overflow-y-auto flex justify-center items-start">
              {/* iframe isolates email HTML from admin dark-theme text (avoids white-on-white). */}
              <iframe
                title="Email body preview"
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/><base target="_blank"/><style>
                  html,body{margin:0;padding:0;background:#f1f5f9;color:#0f172a;}
                  body{padding:16px;font-family:system-ui,-apple-system,sans-serif;}
                  a{color:#0500D0;}
                </style></head><body>${selectedLog.body}</body></html>`}
                className="w-full max-w-[640px] min-h-[420px] h-[min(60vh,560px)] bg-white shadow-md border border-white/10 rounded-sm"
                sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
              />
            </div>

            <div className="p-4 border-t border-white/10 flex justify-end">
              <button onClick={() => setSelectedLog(null)} className={`px-5 py-2.5 ${adminBtnGhost}`}>
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
