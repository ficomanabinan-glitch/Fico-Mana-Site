/** Print instructions are derived from saved selections, never trusted from an uploaded JSON file. */
const PRINTS = {
  TOGA_PICTURE_4R: { prefix: 'TOGA PICTURE', quantity: 1, size: '4R' },
  ALAMPAY_BARONG_4R: { prefix: 'ALAMBAY BARONG', quantity: 1, size: '4R' },
  FRAME_8R: { prefix: 'FRAME', quantity: 1, size: '8R' },
  WALLET_SIZE: { prefix: 'WALLET SIZE', quantity: 4, size: 'wallet' },
} as const

export type SavedPrintAllocation = {
  category: string
  gallery_file_id: string
  quantity: number
}
export type PrintGalleryFile = { id: string; file_name: string }
export type EnhancedPrintSource = {
  storage_key: string
  file_name: string
  checksum: string
  relative_path?: string
}

export function enhancedPrintSourceName(file: EnhancedPrintSource) {
  // New client-facing names omit camera IDs. The verified source path retains them.
  return file.relative_path?.split('/').at(-1) || file.file_name
}
export type PrintOutput = {
  key: string
  category: string
  size: string
  copy_number: number
  source_gallery_file_id: string
  source_file_name: string
  name_prefix: string
  status: 'awaiting_enhanced_upload' | 'ready'
  enhanced_storage_key: string | null
  enhanced_checksum: string | null
  output_file_name: string | null
  print_storage_key: string | null
}

function filenameKey(value: string) {
  return value.normalize('NFKC').trim().replace(/^ENHANCED - /i, '').toLowerCase()
}

function stem(value: string) {
  return filenameKey(value).replace(/\.[^.]+$/, '')
}

export function buildPrintManifest(input: {
  bookingId: string
  selectionId: string
  allocations: SavedPrintAllocation[]
  gallery: PrintGalleryFile[]
}) {
  const outputs: PrintOutput[] = []
  const seen = new Set<string>()
  const walletAllocations = input.allocations.filter(allocation => allocation.category === 'WALLET_SIZE')
  const walletFiles = new Set(walletAllocations.map(allocation => allocation.gallery_file_id))
  if (input.allocations.length && (walletAllocations.length < 1 || walletAllocations.length > 4 || walletFiles.size !== walletAllocations.length)) {
    throw new Error('The saved Wallet Size choices are invalid. Try: ask the administrator to review the client selection.')
  }
  let walletCopy = 0
  for (const allocation of input.allocations) {
    const isWallet = allocation.category === 'WALLET_SIZE'
    if (!Object.hasOwn(PRINTS, allocation.category) || (!isWallet && seen.has(allocation.category))) {
      throw new Error('The saved print choices are invalid. Try: ask the administrator to review the client selection.')
    }
    seen.add(allocation.category)
    const rule = PRINTS[allocation.category as keyof typeof PRINTS]
    const file = input.gallery.find(row => row.id === allocation.gallery_file_id)
    const validQuantity = isWallet
      ? allocation.quantity === 1 || (walletAllocations.length === 1 && allocation.quantity === rule.quantity)
      : allocation.quantity === rule.quantity
    if (!file || !validQuantity) {
      throw new Error('A saved print choice is incomplete. Try: ask the administrator to review the client selection.')
    }
    for (let copy = 1; copy <= allocation.quantity; copy++) {
      const copyNumber = isWallet ? ++walletCopy : copy
      outputs.push({
        key: `${allocation.category}:${copyNumber}`,
        category: allocation.category,
        size: rule.size,
        copy_number: copyNumber,
        source_gallery_file_id: file.id,
        source_file_name: file.file_name,
        name_prefix: isWallet ? `${rule.prefix} ${copyNumber}` : rule.prefix,
        status: 'awaiting_enhanced_upload',
        enhanced_storage_key: null,
        enhanced_checksum: null,
        output_file_name: null,
        print_storage_key: null,
      })
    }
  }
  // Older selections without any print allocation remain valid; a partially saved set does not.
  if (seen.size && seen.size !== Object.keys(PRINTS).length) {
    throw new Error('Some print choices are missing. Try: ask the administrator to review the client selection.')
  }
  return {
    kind: 'fico-mana-print-manifest' as const,
    schema_version: 1,
    booking_id: input.bookingId,
    selection_id: input.selectionId,
    source_stage: 'verified_enhanced_uploads_only' as const,
    prints_folder: 'PRINTS',
    filename_rule: 'Keep the original filename or its exact basename when exporting to a new image format.',
    outputs,
  }
}

export type PrintManifest = ReturnType<typeof buildPrintManifest>

/** Never match by order, trailing digits, fuzzy names, or a different client's files. */
export function matchEnhancedPrintSource(output: PrintOutput, files: EnhancedPrintSource[]) {
  const candidates = [...new Map(files.map(file => [file.storage_key, file])).values()]
    .filter(file => /^[a-f0-9]{64}$/i.test(file.checksum))
  const exact = candidates.filter(file => filenameKey(enhancedPrintSourceName(file)) === filenameKey(output.source_file_name))
  const matches = exact.length ? exact : candidates.filter(file => stem(enhancedPrintSourceName(file)) === stem(output.source_file_name))
  if (matches.length !== 1) {
    throw new Error(matches.length
      ? `More than one enhanced photo matches ${output.source_file_name}. Try: keep one enhanced file with that original filename in this client's SELECTED/EDITED folder, then retry.`
      : `The enhanced photo for ${output.source_file_name} is missing. Try: export it using the original filename (the image extension may change), put it in this client's SELECTED/EDITED folder, then retry.`)
  }
  return matches[0]
}

export function printOutputName(output: PrintOutput, enhancedFileName: string) {
  // Preserve the enhanced image's real extension; renaming never converts image bytes.
  const safeName = enhancedFileName.normalize('NFKC').replace(/^ENHANCED - /i, '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ').trim()
  if (!safeName || safeName.length > 180) throw new Error('The enhanced filename is too long. Try: use the original photo filename.')
  return `${output.name_prefix} - ${safeName}`
}
