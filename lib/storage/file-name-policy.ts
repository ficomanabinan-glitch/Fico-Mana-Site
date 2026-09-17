export function normalizedFileName(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US')
}

export function normalizedFolderFilePath(value: string) {
  return value
    .normalize('NFKC')
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim().toLocaleLowerCase('en-US'))
    .join('/')
}

export function hasSameFileName(left: string, right: string) {
  return normalizedFileName(left) === normalizedFileName(right)
}

export function hasSameFolderFilePath(left: string, right: string) {
  return normalizedFolderFilePath(left) === normalizedFolderFilePath(right)
}
