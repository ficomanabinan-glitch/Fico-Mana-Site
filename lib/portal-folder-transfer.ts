export type FolderTransferProgress = {
  writtenBytes: number
  totalBytes: number
  savedFiles: number
  totalFiles: number
  fileName: string
}

type FolderEntry = { name: string; size: number }

function safeLocalName(value: string) {
  const clean = value.normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').trim().slice(0, 180)
  if (!clean || clean === '.' || clean === '..') throw new Error('A photo has an invalid filename.')
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean) ? `_${clean}` : clean
}

export function clientPhotoFolderName(customerName: string, reference: string) {
  return safeLocalName(`${customerName} - ${reference}`)
}

function safeRelativePath(value: string) {
  const parts = value.replaceAll('\\', '/').split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error('The folder contains an unsafe path.')
  return parts.map(safeLocalName).join('/')
}

function parseHeader(value: string): { files: FolderEntry[]; directories: string[] } {
  const header = JSON.parse(value) as { files?: unknown; directories?: unknown }
  if (!Array.isArray(header.files) || header.files.length < 1 || header.files.length > 9000) {
    throw new Error('The photo folder list is invalid.')
  }
  const names = new Set<string>()
  const files = header.files.map((item: unknown) => {
    const file = item as Partial<FolderEntry>
    if (typeof file.name !== 'string' || !Number.isSafeInteger(file.size) || Number(file.size) <= 0) {
      throw new Error('A photo in the folder has invalid details.')
    }
    const name = safeRelativePath(file.name)
    if (names.has(name.toLocaleLowerCase('en'))) throw new Error('The folder contains duplicate photo names.')
    names.add(name.toLocaleLowerCase('en'))
    return { name, size: Number(file.size) }
  })
  if (header.directories !== undefined && (!Array.isArray(header.directories) || header.directories.length > 9000)) {
    throw new Error('The folder list is invalid.')
  }
  const directories = (header.directories || []).map((name: unknown) => {
    if (typeof name !== 'string') throw new Error('The folder list is invalid.')
    return safeRelativePath(name.replace(/\/$/, ''))
  })
  return { files, directories }
}

async function nestedFolder(root: FileSystemDirectoryHandle, parts: string[]) {
  let current = root
  for (const part of parts) current = await current.getDirectoryHandle(part, { create: true })
  return current
}

export async function savePortalFolderStream(
  stream: ReadableStream<Uint8Array>,
  folder: FileSystemDirectoryHandle,
  onProgress: (progress: FolderTransferProgress) => void,
) {
  const reader = stream.getReader()
  let chunk: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
  let offset = 0
  let activeWriter: FileSystemWritableFileStream | null = null
  async function nextChunk() {
    while (offset >= chunk.byteLength) {
      const next = await reader.read()
      if (next.done) throw new Error('The connection ended before all photos arrived.')
      chunk = next.value
      offset = 0
    }
  }
  try {
    const headerBytes: number[] = []
    while (true) {
      await nextChunk()
      const byte = chunk[offset++]
      if (byte === 10) break
      headerBytes.push(byte)
      if (headerBytes.length > 2_000_000) throw new Error('The photo folder list is too large.')
    }
    const { files, directories } = parseHeader(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(headerBytes)))
    for (const directory of directories) await nestedFolder(folder, directory.split('/'))
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
    if (!Number.isSafeInteger(totalBytes)) throw new Error('The photo folder is too large.')
    let writtenBytes = 0
    let savedFiles = 0
    let lastProgressAt = 0
    for (const file of files) {
      const parts = file.name.split('/')
      const parent = await nestedFolder(folder, parts.slice(0, -1))
      const handle = await parent.getFileHandle(parts.at(-1)!, { create: true })
      activeWriter = await handle.createWritable()
      let remaining = file.size
      while (remaining > 0) {
        await nextChunk()
        const bytes = chunk.subarray(offset, offset + Math.min(remaining, chunk.byteLength - offset))
        await activeWriter.write(bytes)
        offset += bytes.byteLength
        remaining -= bytes.byteLength
        writtenBytes += bytes.byteLength
        const now = Date.now()
        if (remaining === 0 || now - lastProgressAt >= 200) {
          onProgress({ writtenBytes, totalBytes, savedFiles, totalFiles: files.length, fileName: file.name })
          lastProgressAt = now
        }
      }
      await activeWriter.close()
      activeWriter = null
      savedFiles += 1
      onProgress({ writtenBytes, totalBytes, savedFiles, totalFiles: files.length, fileName: file.name })
    }
    if (offset < chunk.byteLength || !(await reader.read()).done) throw new Error('The photo folder contained unexpected extra data.')
    return { totalBytes, savedFiles }
  } catch (error) {
    if (activeWriter) await activeWriter.abort().catch(() => undefined)
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
}

export async function downloadPrivateFolder(
  downloadUrl: string,
  folderName: string,
  onProgress: (progress: FolderTransferProgress) => void,
) {
  const picker = (window as Window & { showDirectoryPicker?: (options: { id: string; mode: 'readwrite'; startIn: 'downloads' }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker
  if (!picker) throw new Error('Saving a complete photo folder requires desktop Chrome or Edge. Open this portal there to choose a save location.')
  let destination: FileSystemDirectoryHandle
  try {
    // This must run immediately from the button click while user activation is live.
    destination = await picker.call(window, { id: 'ficomana-photo-save', mode: 'readwrite', startIn: 'downloads' })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw new Error('Chrome could not open that location. Create and select a folder inside Downloads, or choose a folder in Documents. Do not select Downloads itself.')
  }
  const safeFolderName = safeLocalName(folderName)
  // Chrome may protect the Downloads root. If the user creates the named folder
  // inside Downloads and selects it, write there instead of nesting it twice.
  const folder = destination.name?.toLocaleLowerCase('en') === safeFolderName.toLocaleLowerCase('en')
    ? destination
    : await destination.getDirectoryHandle(safeFolderName, { create: true })
  const prepared = await fetch(downloadUrl, { method: 'POST', credentials: 'include', cache: 'no-store' })
  const body = (await prepared.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!prepared.ok || !body.url) throw new Error(body.error || 'The folder could not be prepared. Please try again.')
  const response = await fetch(body.url, { cache: 'no-store' })
  if (!response.ok || !response.body) {
    const detail = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(detail.error || 'The photos could not be transferred. Please try again.')
  }
  const result = await savePortalFolderStream(response.body, folder, onProgress)
  return { ...result, folderName }
}

export async function downloadPortalPhotoFolder(
  downloadUrl: string,
  customerName: string,
  bookingReference: string,
  onProgress: (progress: FolderTransferProgress) => void,
) {
  return downloadPrivateFolder(downloadUrl, clientPhotoFolderName(customerName, bookingReference), onProgress)
}
