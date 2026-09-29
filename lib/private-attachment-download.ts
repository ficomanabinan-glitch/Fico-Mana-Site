'use client'

export async function startPrivateAttachmentDownload(endpoint: string) {
  const response = await fetch(endpoint, { method: 'POST', credentials: 'include', cache: 'no-store' })
  const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!response.ok || !body.url) throw new Error(body.error || 'The download could not be prepared. Please try again.')
  const url = new URL(body.url)
  if (url.protocol !== 'https:' || !url.pathname.match(/^\/(download|file)\/[0-9a-f-]+$/i)) {
    throw new Error('The private download link was invalid. Please try again.')
  }
  window.location.assign(url.href)
}
