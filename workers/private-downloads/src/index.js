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

function inlineBytes(value) {
  const binary = atob(String(value || ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function complete(env, manifestId, hash, success) {
  let lastError = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const completed = await rpc(env, 'complete_private_download_manifest', {
        p_manifest: manifestId,
        p_token_hash: hash,
        p_success: success,
      })
      if (completed === false) throw new Error('Download completion was not accepted.')
      return true
    } catch (error) {
      lastError = error
    }
  }
  console.error('Download completion update failed', lastError instanceof Error ? lastError.message : 'unknown error')
  return false
}

function positiveSize(value) {
  const size = Number(value)
  return Number.isSafeInteger(size) && size > 0 ? size : 0
}

function attachmentName(value, extension) {
  const cleaned = String(value || 'FICO-MANA-PHOTOS')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 170) || 'FICO-MANA-PHOTOS'
  return extension && !cleaned.toLowerCase().endsWith(extension) ? `${cleaned}${extension}` : cleaned
}

function attachmentDisposition(value, extension) {
  const name = attachmentName(value, extension)
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

// zip.js STORE + ZIP64 has a fixed overhead for these non-empty entries.
// Verified against the produced bytes in the Worker regression tests.
function zipContentLength(entries) {
  const encoder = new TextEncoder()
  return entries.reduce(
    (total, entry) => total + BigInt(entry.byteSize) + (entry.directory ? 134n : 158n) + 2n * BigInt(encoder.encode(entry.name).byteLength),
    98n,
  )
}

async function preflightEntries(entries, env) {
  const checked = []
  for (let start = 0; start < entries.length; start += 16) {
    const batch = entries.slice(start, start + 16)
    const results = await Promise.all(batch.map(async (entry) => {
      const name = String(entry.name || 'file')
      if (entry.storageKey) {
        const object = await env.PRIVATE_PHOTOS.head(String(entry.storageKey))
        const byteSize = positiveSize(object?.size)
        if (!byteSize) throw new Error(`${name} is unavailable in private storage.`)
        const expectedSize = positiveSize(entry.byteSize)
        if (expectedSize && expectedSize !== byteSize) throw new Error(`${name} did not match its stored size.`)
        return { ...entry, name, byteSize }
      }
      if (typeof entry.inlineBase64 === 'string') {
        const bytes = inlineBytes(entry.inlineBase64)
        if (!bytes.byteLength) throw new Error(`${name} is empty.`)
        return { ...entry, name, byteSize: bytes.byteLength, inlineBytes: bytes }
      }
      throw new Error(`${name} is not a valid download entry.`)
    }))
    checked.push(...results)
  }
  return checked
}

function folderCors(request) {
  const origin = request.headers.get('origin') || ''
  return ['https://ficomana.com', 'https://www.ficomana.com', 'https://editor.ficomana.com', 'https://admin.ficomana.com', 'https://newadmin.ficomana.com'].includes(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1):3100$/.test(origin)
    ? { 'access-control-allow-origin': origin, vary: 'Origin' }
    : { vary: 'Origin' }
}

function folderError(request, message, status) {
  const response = json(message, status)
  for (const [key, value] of Object.entries(folderCors(request))) response.headers.set(key, value)
  return response
}

async function handleFolderDownload(request, env, context, manifestId, token) {
  if (!UUID.test(manifestId) || token.length < 32 || token.length > 128) {
    return folderError(request, 'This download link is invalid.', 404)
  }
  if (env.DOWNLOAD_RATE_LIMITER) {
    const actor = request.headers.get('cf-connecting-ip') || 'unknown'
    const limited = await env.DOWNLOAD_RATE_LIMITER.limit({ key: actor })
    if (!limited.success) return folderError(request, 'Too many download attempts. Wait one minute, then try again.', 429)
  }
  const hash = await tokenHash(token)
  let manifest
  try {
    manifest = await rpc(env, 'resolve_private_download_manifest', { p_manifest: manifestId, p_token_hash: hash })
  } catch {
    return folderError(request, 'This private download link is unavailable or has expired.', 410)
  }
  const manifestEntries = Array.isArray(manifest?.entries) ? manifest.entries : []
  if (!manifestEntries.length || manifestEntries.length > 9000) {
    return folderError(request, 'No downloadable photos are available.', 404)
  }
  const directories = manifestEntries.filter(entry => String(entry.name || '').endsWith('/')).map(entry => String(entry.name).replace(/\/$/, ''))
  const fileEntries = manifestEntries.filter(entry => !String(entry.name || '').endsWith('/'))
  if (!fileEntries.length) return folderError(request, 'No downloadable files are available.', 404)
  let entries
  try {
    entries = await preflightEntries(fileEntries, env)
  } catch (error) {
    await complete(env, manifestId, hash, false)
    console.error('Private folder preflight failed', error instanceof Error ? error.message : 'unknown error')
    return folderError(request, 'One or more photos are temporarily unavailable. No download was counted; please try again.', 409)
  }
  const header = new TextEncoder().encode(`${JSON.stringify({ files: entries.map((entry) => ({ name: entry.name, size: entry.byteSize })), directories })}\n`)
  const totalBytes = entries.reduce((sum, entry) => sum + BigInt(entry.byteSize), BigInt(header.byteLength))
  if (totalBytes > BigInt(Number.MAX_SAFE_INTEGER)) {
    await complete(env, manifestId, hash, false)
    return folderError(request, 'This folder is too large to prepare safely.', 413)
  }
  const { readable, writable } = typeof FixedLengthStream === 'function'
    ? new FixedLengthStream(totalBytes)
    : new TransformStream()
  const streamTask = (async () => {
    const writer = writable.getWriter()
    let success = false
    try {
      await writer.write(header)
      for (const entry of entries) {
        const source = entry.storageKey
          ? (await env.PRIVATE_PHOTOS.get(String(entry.storageKey)))?.body
          : entry.inlineBytes instanceof Uint8Array
            ? new ReadableStream({ start(controller) { controller.enqueue(entry.inlineBytes); controller.close() } })
            : null
        if (!source) throw new Error('A file is unavailable.')
        const reader = source.getReader()
        let readBytes = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          readBytes += value.byteLength
          if (readBytes > entry.byteSize) throw new Error('A photo exceeded its verified size.')
          await writer.write(value)
        }
        if (readBytes !== entry.byteSize) throw new Error('A photo did not match its verified size.')
      }
      await writer.close()
      success = true
    } catch (error) {
      await writer.abort(error).catch(() => undefined)
      console.error('Private folder stream failed', error instanceof Error ? error.message : 'unknown error')
    } finally {
      await complete(env, manifestId, hash, success)
    }
  })()
  context?.waitUntil?.(streamTask)
  return new Response(readable, {
    headers: {
      'content-type': 'application/x-ficomana-photo-folder',
      'content-length': totalBytes.toString(),
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      ...folderCors(request),
    },
  })
}

function safeArchivePath(value) {
  const path = String(value || '').replaceAll('\\', '/')
  const parts = path.replace(/\/$/, '').split('/')
  if (!parts.length || parts.some(part => !part || part === '.' || part === '..' || /[\u0000-\u001f]/.test(part))) {
    throw new Error('The download contains an unsafe filename.')
  }
  return path
}

async function handleAttachment(request, env, context, manifestId, token, format) {
  if (!UUID.test(manifestId) || token.length < 32 || token.length > 128) {
    return json('This download link is invalid.', 404)
  }
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
  const manifestEntries = Array.isArray(manifest?.entries) ? manifest.entries : []
  if (!manifestEntries.length || manifestEntries.length > 9000) return json('No downloadable photos are available.', 404)
  const rawFiles = manifestEntries.filter(entry => !String(entry.name || '').endsWith('/'))
  if (format === 'file' && (rawFiles.length !== 1 || manifestEntries.length !== 1 ||
    !['PORTAL_ORIGINAL_SINGLE', 'PORTAL_DELIVERABLES'].includes(manifest?.kind))) {
    return json('This link cannot download an individual photo.', 404)
  }
  let entries
  let directories
  try {
    directories = manifestEntries.filter(entry => String(entry.name || '').endsWith('/'))
      .map(entry => safeArchivePath(entry.name))
    entries = await preflightEntries(rawFiles, env)
    for (const entry of entries) safeArchivePath(entry.name)
    if (!entries.length) throw new Error('No downloadable files are available.')
  } catch (error) {
    await complete(env, manifestId, hash, false)
    console.error('Private attachment preflight failed', error instanceof Error ? error.message : 'unknown error')
    return json('One or more photos are temporarily unavailable. No download was counted; please try again.', 409)
  }

  if (format === 'file') {
    const entry = entries[0]
    const { readable, writable } = typeof FixedLengthStream === 'function'
      ? new FixedLengthStream(entry.byteSize)
      : new TransformStream()
    const streamTask = (async () => {
      const writer = writable.getWriter()
      let success = false
      try {
        const source = (await env.PRIVATE_PHOTOS.get(String(entry.storageKey)))?.body
        if (!source) throw new Error('The photo is unavailable.')
        const reader = source.getReader()
        let copied = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          copied += value.byteLength
          if (copied > entry.byteSize) throw new Error('The photo exceeded its verified size.')
          await writer.write(value)
        }
        if (copied !== entry.byteSize) throw new Error('The photo did not match its verified size.')
        await writer.close()
        success = true
      } catch (error) {
        await writer.abort(error).catch(() => undefined)
        console.error('Private photo stream failed', error instanceof Error ? error.message : 'unknown error')
      } finally {
        await complete(env, manifestId, hash, success)
      }
    })()
    context?.waitUntil?.(streamTask)
    return new Response(readable, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': attachmentDisposition(manifest.fileName),
        'content-length': String(entry.byteSize),
        'cache-control': 'private, no-store',
        'content-security-policy': "default-src 'none'; sandbox",
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      },
    })
  }

  const zipEntries = [...directories.map(name => ({ name, byteSize: 0, directory: true })), ...entries]
  const archiveBytes = zipContentLength(zipEntries)
  if (archiveBytes > BigInt(Number.MAX_SAFE_INTEGER)) {
    await complete(env, manifestId, hash, false)
    return json('This ZIP is too large to prepare safely.', 413)
  }
  const { readable, writable } = typeof FixedLengthStream === 'function'
    ? new FixedLengthStream(archiveBytes)
    : new TransformStream()
  const archive = new ZipWriter(writable, { level: 0, zip64: true, useWebWorkers: false })
  const streamTask = (async () => {
    let success = false
    try {
      for (const entry of zipEntries) {
        if (entry.directory) {
          await archive.add(entry.name, new Uint8ArrayReader(new Uint8Array(0)), { level: 0, zip64: true, directory: true })
        } else if (entry.storageKey) {
          const object = await env.PRIVATE_PHOTOS.get(String(entry.storageKey))
          if (!object?.body) throw new Error('A photo is unavailable.')
          await archive.add(entry.name, object.body, { level: 0, zip64: true, lastModDate: object.uploaded || new Date() })
        } else if (entry.inlineBytes instanceof Uint8Array) {
          await archive.add(entry.name, new Uint8ArrayReader(entry.inlineBytes), { level: 0, zip64: true })
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
  context?.waitUntil?.(streamTask)
  return new Response(readable, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': attachmentDisposition(manifest.fileName, '.zip'),
      'content-length': archiveBytes.toString(),
      'cache-control': 'private, no-store',
      'content-security-policy': "default-src 'none'; sandbox",
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  })
}

async function runRetention(env) {
  if (!env.RETENTION_SECRET) return
  // One nightly invocation drains a bounded backlog. An empty run stops
  // immediately; failures stop too, so a broken backend cannot spin.
  for (let batch = 0; batch < 50; batch += 1) {
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
      const completed = await rpc(env, 'complete_storage_retention_batch', {
        p_secret: env.RETENTION_SECRET,
        p_run_id: claim.runId,
        p_file_ids: fileIds,
        p_deleted_objects: success ? keys.length : 0,
        p_success: success,
        p_error: errorMessage,
      })
      if (!completed) throw new Error('Retention completion was not accepted.')
    } catch (error) {
      console.error('Storage retention completion failed', error instanceof Error ? error.message : 'unknown error')
      return
    }
    if (!success || fileIds.length === 0) return
  }
}

const privateDownloadWorker = {
  async fetch(request, env, context) {
    const url = new URL(request.url)
    const attachmentMatch = url.pathname.match(/^\/(download|file)\/([^/]+)$/)
    if (attachmentMatch) {
      if (request.method !== 'GET') return json('Method not allowed.', 405)
      return handleAttachment(request, env, context, decodeURIComponent(attachmentMatch[2]), url.searchParams.get('token') || '', attachmentMatch[1] === 'file' ? 'file' : 'zip')
    }
    const folderMatch = url.pathname.match(/^\/folder\/([^/]+)$/)
    if (folderMatch) {
      if (request.method !== 'GET') return folderError(request, 'Method not allowed.', 405)
      return handleFolderDownload(request, env, context, decodeURIComponent(folderMatch[1]), url.searchParams.get('token') || '')
    }
    return json('This private download link is unavailable.', 404)
  },
  async scheduled(_controller, env, context) {
    context.waitUntil(runRetention(env))
  },
}

export default privateDownloadWorker
