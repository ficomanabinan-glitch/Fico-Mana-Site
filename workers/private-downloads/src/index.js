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

// STORE + ZIP64: local header/extra + descriptor + central header/extra.
// No compression or archive-wide buffers: JPEGs are already compressed.
function zipContentLength(entries) {
  const encoder = new TextEncoder()
  return entries.reduce(
    (total, entry) => total + BigInt(entry.byteSize) + (entry.directory ? 124n : 148n) + 2n * BigInt(encoder.encode(entry.name).byteLength),
    98n,
  )
}

// Slicing-by-four CRC32 avoids a byte-at-a-time checksum bottleneck on large shoots.
// These immutable lookup tables contain no request state.
const crcTables = Array.from({ length: 4 }, () => new Uint32Array(256))
for (let index = 0; index < 256; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0)
  crcTables[0][index] = value >>> 0
}
for (let table = 1; table < 4; table += 1) {
  for (let index = 0; index < 256; index += 1) {
    let value = crcTables[table - 1][index]
    value = (value >>> 8) ^ crcTables[0][value & 255]
    crcTables[table][index] = value >>> 0
  }
}

function crc32Update(crc, bytes) {
  let index = 0
  while (index + 4 <= bytes.byteLength) {
    const value = crc ^ (bytes[index] | (bytes[index + 1] << 8) | (bytes[index + 2] << 16) | (bytes[index + 3] << 24))
    crc = crcTables[3][value & 255] ^ crcTables[2][(value >>> 8) & 255] ^ crcTables[1][(value >>> 16) & 255] ^ crcTables[0][value >>> 24]
    index += 4
  }
  while (index < bytes.byteLength) crc = (crc >>> 8) ^ crcTables[0][(crc ^ bytes[index++]) & 255]
  return crc >>> 0
}

function zipHeader(entry, offset, crc, central, modified) {
  const name = new TextEncoder().encode(entry.name)
  const length = central ? 46 : 30
  const extraLength = central ? 28 : 20
  const bytes = new Uint8Array(length + name.byteLength + extraLength)
  const view = new DataView(bytes.buffer)
  const date = modified instanceof Date && Number.isFinite(modified.getTime()) ? modified : new Date()
  const year = Math.min(2107, Math.max(1980, date.getUTCFullYear()))
  const time = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >>> 1)
  const day = ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()
  view.setUint32(0, central ? 0x02014b50 : 0x04034b50, true)
  if (central) view.setUint16(4, 45, true)
  const base = central ? 6 : 4
  view.setUint16(base, 45, true)
  view.setUint16(base + 2, entry.directory ? 0x0800 : 0x0808, true)
  view.setUint16(base + 6, time, true)
  view.setUint16(base + 8, day, true)
  view.setUint32(base + 10, central ? crc : 0, true)
  view.setUint32(base + 14, 0xffffffff, true)
  view.setUint32(base + 18, 0xffffffff, true)
  view.setUint16(base + 22, name.byteLength, true)
  view.setUint16(base + 24, extraLength, true)
  if (central) {
    view.setUint32(38, entry.directory ? 0x10 : 0, true)
    view.setUint32(42, 0xffffffff, true)
  }
  bytes.set(name, length)
  const extra = length + name.byteLength
  view.setUint16(extra, 1, true)
  view.setUint16(extra + 2, extraLength - 4, true)
  view.setBigUint64(extra + 4, BigInt(entry.byteSize), true)
  view.setBigUint64(extra + 12, BigInt(entry.byteSize), true)
  if (central) view.setBigUint64(extra + 20, offset, true)
  return bytes
}

function zipDescriptor(size, crc) {
  const bytes = new Uint8Array(24)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x08074b50, true)
  view.setUint32(4, crc, true)
  view.setBigUint64(8, BigInt(size), true)
  view.setBigUint64(16, BigInt(size), true)
  return bytes
}

function zipFooter(count, offset, size) {
  const bytes = new Uint8Array(98)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x06064b50, true)
  view.setBigUint64(4, 44n, true)
  view.setUint16(12, 45, true)
  view.setUint16(14, 45, true)
  view.setBigUint64(24, BigInt(count), true)
  view.setBigUint64(32, BigInt(count), true)
  view.setBigUint64(40, size, true)
  view.setBigUint64(48, offset, true)
  view.setUint32(56, 0x07064b50, true)
  view.setBigUint64(64, offset + size, true)
  view.setUint32(72, 1, true)
  view.setUint32(76, 0x06054b50, true)
  view.setUint16(84, 0xffff, true)
  view.setUint16(86, 0xffff, true)
  view.setUint32(88, 0xffffffff, true)
  view.setUint32(92, 0xffffffff, true)
  return bytes
}

async function streamZip(entries, writable, env) {
  const writer = writable.getWriter()
  const centralHeaders = []
  let sourceReader = null
  let offset = 0n
  // Closing the browser must cancel a pending R2 read too, not leave its slot reserved.
  writer.closed.catch(error => sourceReader?.cancel(error).catch(() => undefined))
  try {
    for (const entry of entries) {
      let source
      let modified
      if (!entry.directory) {
        if (entry.storageKey) {
          const object = await env.PRIVATE_PHOTOS.get(String(entry.storageKey))
          if (!object?.body) throw new Error('A photo is unavailable.')
          source = object.body
          modified = object.uploaded
        } else if (entry.inlineBytes instanceof Uint8Array) {
          source = new ReadableStream({ start(controller) { controller.enqueue(entry.inlineBytes); controller.close() } })
        } else throw new Error('A download entry is invalid.')
        sourceReader = source.getReader()
      }
      const startOffset = offset
      const header = zipHeader(entry, startOffset, 0, false, modified)
      await writer.write(header)
      offset += BigInt(header.byteLength)
      let crc = 0xffffffff
      let copied = 0
      if (sourceReader) {
        for (;;) {
          const result = await sourceReader.read()
          if (result.done) break
          copied += result.value.byteLength
          if (copied > entry.byteSize) throw new Error('A photo exceeded its verified size.')
          crc = crc32Update(crc, result.value)
          await writer.write(result.value)
        }
        sourceReader.releaseLock()
        sourceReader = null
        if (copied !== entry.byteSize) throw new Error('A photo did not match its verified size.')
        crc = (crc ^ 0xffffffff) >>> 0
        const descriptor = zipDescriptor(copied, crc)
        await writer.write(descriptor)
        offset += BigInt(copied + descriptor.byteLength)
      } else crc = 0
      centralHeaders.push(zipHeader(entry, startOffset, crc, true, modified))
    }
    const centralOffset = offset
    for (const header of centralHeaders) { await writer.write(header); offset += BigInt(header.byteLength) }
    await writer.write(zipFooter(entries.length, centralOffset, offset - centralOffset))
    await writer.close()
  } catch (error) {
    await sourceReader?.cancel(error).catch(() => undefined)
    await writer.abort(error).catch(() => undefined)
    throw error
  } finally { writer.releaseLock() }
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
  if (new TextEncoder().encode(path).byteLength > 65535 || !parts.length || parts.some(part => !part || part === '.' || part === '..' || /[\u0000-\u001f]/.test(part))) {
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
    for (const entry of entries) entry.name = safeArchivePath(entry.name)
    if (new Set([...directories, ...entries.map(entry => entry.name)]).size !== directories.length + entries.length) throw new Error('The download contains duplicate filenames.')
    if ([...directories, ...entries.map(entry => entry.name)].reduce((size, name) => size + new TextEncoder().encode(name).byteLength, 0) > 4 * 1024 * 1024) {
      throw new Error('The download contains too much filename metadata.')
    }
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
  const streamTask = (async () => {
    let success = false
    try {
      await streamZip(zipEntries, writable, env)
      success = true
    } catch (error) {
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
