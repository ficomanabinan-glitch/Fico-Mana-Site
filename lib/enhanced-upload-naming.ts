type NamedUpload = { relative_path: string; file_name: string }

/** The source path stays stable for retries and print matching; only Drive's display name changes. */
export function enhancedUploadName(clientName: string, sourceName: string, relativePath: string, existing: NamedUpload[]) {
  const extension = sourceName.match(/\.[a-z0-9]+$/i)?.[0]
  if (!extension) throw new Error('The enhanced photo needs its original image extension.')
  const numbered = /^ENHANCED ([1-9]\d*) - .+\.[a-z0-9]+$/i
  const reserved = existing.find(file => file.relative_path === relativePath && numbered.test(file.file_name))
  if (reserved) return reserved.file_name
  const name = clientName.normalize('NFKC').toUpperCase()
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!name) throw new Error('The booking needs a client name before enhanced photos can be uploaded.')
  const number = existing.reduce((max, file) => Math.max(max, Number(file.file_name.match(numbered)?.[1] || 0)), 0) + 1
  if (!Number.isSafeInteger(number)) throw new Error('The enhanced-photo numbering could not be verified.')
  const prefix = `ENHANCED ${number} - `
  return `${prefix}${name.slice(0, 140 - prefix.length - extension.length).trim()}${extension}`
}
