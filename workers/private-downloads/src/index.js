import { Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function json(error, status) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
  })
}

async function tokenHash(token) {
  const bytes = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function rpc(env, name, body) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.message || 'Download authorization failed.')
  return result
}

function cleanDownloadName(value) {
  return String(value || 'FICO-MANA-PHOTOS.zip').replace(/["\r\n]/g, '').slice(0, 180)
}

function inlineBytes(value) {
  const binary = atob(String(value || ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function complete(env, manifestId, hash, success) {
  try {
    await rpc(env, 'complete_private_download_manifest', {
      p_manifest: manifestId,
      p_token_hash: hash,
      p_success: success,
    })
  } catch (error) {
    console.error('Download completion update failed', error instanceof Error ? error.message : 'unknown error')
  }
}

async function runRetention(env) {
  if (!env.RETENTION_SECRET) return
  let claim
  try {
    claim = await rpc(env, 'claim_storage_retention_batch', {
      p_secret: env.RETENTION_SECRET,
      p_limit: 1000,
    })
  } catch (error) {
    console.error('Storage retention claim failed', error instanceof Error ? error.message : 'unknown error')
    return
  }
  if (!claim?.enabled || !Array.isArray(claim.items)) return
  const fileIds = claim.items.map((item) => String(item.fileId || '')).filter(Boolean)
  const keys = [...new Set(claim.items.flatMap((item) => Array.isArray(item.keys) ? item.keys : [])
    .map((key) => String(key || '')).filter(Boolean))]
  let success = false
  let errorMessage = null
  try {
    for (let start = 0; start < keys.length; start += 1000) {
      await env.PRIVATE_PHOTOS.delete(keys.slice(start, start + 1000))
    }
    success = true
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'R2 deletion failed.'
    console.error('Storage retention deletion failed', errorMessage)
  }
  try {
    await rpc(env, 'complete_storage_retention_batch', {
      p_secret: env.RETENTION_SECRET,
      p_run_id: claim.runId,
      p_file_ids: fileIds,
      p_deleted_objects: success ? keys.length : 0,
      p_success: success,
      p_error: errorMessage,
    })
  } catch (error) {
    console.error('Storage retention completion failed', error instanceof Error ? error.message : 'unknown error')
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET') return json('Method not allowed.', 405)
    const url = new URL(request.url)
    const match = url.pathname.match(/^\/download\/([^/]+)$/)
    const manifestId = match ? decodeURIComponent(match[1]) : ''
    const token = url.searchParams.get('token') || ''
    if (!UUID.test(manifestId) || token.length < 32 || token.length > 128) return json('This download link is invalid.', 404)
    if (env.DOWNLOAD_RATE_LIMITER) {
      const actor = request.headers.get('cf-connecting-ip') || 'unknown'
      const limited = await env.DOWNLOAD_RATE_LIMITER.limit({ key: actor })
      if (!limited.success) return json('Too many download attempts. Wait one minute, then try again.', 429)
    }
    const hash = await tokenHash(token)
    let manifest
    try {
      manifest = await rpc(env, 'resolve_private_download_manifest', { p_manifest: manifestId, p_token_hash: hash })
    } catch {
      return json('This private download link is unavailable or has expired.', 410)
    }
    const entries = Array.isArray(manifest?.entries) ? manifest.entries : []
    if (!entries.length || entries.length > 2000) return json('No downloadable photos are available.', 404)

    const { readable, writable } = new TransformStream()
    const archive = new ZipWriter(writable, { level: 0, zip64: true, useWebWorkers: false })
    void (async () => {
      let success = false
      try {
        for (const entry of entries) {
          const name = String(entry.name || 'file')
          if (entry.storageKey) {
            const object = await env.PRIVATE_PHOTOS.get(String(entry.storageKey))
            if (!object?.body) throw new Error('A photo is unavailable.')
            await archive.add(name, object.body, {
              level: 0,
              zip64: true,
              lastModDate: object.uploaded || new Date(),
            })
          } else if (typeof entry.inlineBase64 === 'string') {
            await archive.add(name, new Uint8ArrayReader(inlineBytes(entry.inlineBase64)), {
              level: 0,
              zip64: true,
            })
          } else {
            throw new Error('A download entry is invalid.')
          }
        }
        await archive.close()
        success = true
      } catch (error) {
        try { await archive.close() } catch { /* stream may already be closed */ }
        console.error('Private ZIP stream failed', error instanceof Error ? error.message : 'unknown error')
      } finally {
        await complete(env, manifestId, hash, success)
      }
    })()

    return new Response(readable, {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${cleanDownloadName(manifest.fileName)}"`,
        'cache-control': 'private, no-store',
        'content-security-policy': "default-src 'none'; sandbox",
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      },
    })
  },
  async scheduled(_controller, env, context) {
    context.waitUntil(runRetention(env))
  },
}
