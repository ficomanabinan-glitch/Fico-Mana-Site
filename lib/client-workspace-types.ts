/** Serializable staff DTOs. Never import server services into browser components. */
export type WorkspaceSection<T> = {
  status: 'ready' | 'empty' | 'partial' | 'unavailable'
  data: T | null
  message?: string
}

export type ClientWorkspaceIdentity = {
  id: string | null
  reference: string
  identitySource: 'client' | 'booking'
  name: string
  email: string | null
  phone: string | null
  createdAt: string | null
}

export type WorkspacePayment = {
  id: string
  amount: number
  method: string
  type: string
  transactionRef: string | null
  date: string | null
  verifiedAt: string | null
  status: string
}

export type WorkspaceBooking = {
  id: string
  clientId: string | null
  customerName: string
  customerEmail: string | null
  customerPhone: string | null
  customerFbName: string | null
  customerFbLink: string | null
  packageId: string
  packageName: string
  selectionLimit: number | null
  bookingDate: string
  bookingTime: string | null
  slotId: string | null
  arrivalTime: string | null
  shootTime: string | null
  clientPriority: number | null
  isWalkIn: boolean
  bookingStatus: string
  paymentStatus: string
  price: number
  depositAmount: number
  discountAmount: number
  discountLabel: string | null
  paymentHistory: WorkspacePayment[]
  receiptAvailable: boolean
  receiptHref: string | null
  transactionRef: string | null
  rejectionReason: string | null
  note: string | null
  staffNotes: string | null
  schoolName: string | null
  course: string | null
  hoodColor: string | null
  togaColor: string | null
  tasselColor: string | null
  backgroundColor: string | null
  createdAt: string | null
  confirmedAt: string | null
  rawPhotoStatus: string | null
  rawPhotoNotes: string | null
  rawPhotoSubmittedAt: string | null
  rawPhotoApprovedAt: string | null
  editedPhotoDeliveredAt: string | null
}

export type WorkspacePackage = {
  id: string
  category: string
  title: string
  description: string | null
  features: string[]
  duration: string | null
  selectionLimit: number | null
  usesOnsiteWorkflow: boolean
  usesSelectionWorkflow: boolean
}

export type ClientWorkspaceLinks = {
  workspace: string
  booking: string
  payment: string
  selection: string
  onsite: string
  queue: string
  portalManagement: string
  portal: string
  files: string
  batch: string | null
  upload: string | null
  retryUpload: string | null
}

export type ClientWorkspaceCore = {
  kind: 'core'
  client: ClientWorkspaceIdentity
  bookings: WorkspaceBooking[]
  selectedBookingId: string
  booking: WorkspaceBooking
  package: WorkspaceSection<WorkspacePackage>
  links: ClientWorkspaceLinks
}

export type ClientWorkspaceSearchResult = {
  clientId: string | null
  clientReference: string
  identitySource: 'client' | 'booking'
  bookingId: string
  name: string
  contactHint: string | null
  packageName: string
  shootDate: string
  bookingStatus: string
  paymentStatus: string
  productionStatus: string | null
  href: string
}

export type ClientWorkspaceSearch = {
  query: string
  results: ClientWorkspaceSearchResult[]
  hasMore: boolean
}

export type ClientWorkspaceAttention = {
  items: Array<{
    bookingId: string
    clientId: string | null
    name: string
    shootDate: string
    actionId: string
    label: string
    explanation: string
    href: string
    priority: number
  }>
  truncated: boolean
  unavailableSources: string[]
}

export type WorkspacePayments = {
  source: 'payments' | 'booking-history' | 'none'
  packageTotal: number
  amountPaid: number
  packageBalance: number
  paymentStatus: string
  records: WorkspacePayment[]
  receiptAvailable: boolean
  receiptHref: string | null
  receiptSubmittedAt?: string | null
}

export type WorkspaceStorage = {
  provisioningStatus: string
  provider: string | null
  status: string | null
  provisionedAt: string | null
  lastRetryAt: string | null
  hasError: boolean
}

export type WorkspaceSelectedPhoto = {
  id: string
  fileName: string | null
  preference: string
  extraEdit: boolean
}

export type WorkspaceSelection = {
  status: string
  clientStatus: string
  reviewStatus: string | null
  requiredCount: number
  includedLimit: number
  selectedCount: number | null
  extraEditCount: number | null
  submittedAt: string | null
  reopenedAt: string | null
  approvedAt: string | null
  noRevisionAcknowledged: boolean
  totalAddonAmount: number
  resetInProgress: boolean
  photos: WorkspaceSelectedPhoto[] | null
}

export type WorkspacePrint = {
  category: string
  label: string
  quantity: number
  fileId: string
  fileName: string | null
  storageStatus: string | null
}

export type WorkspaceAddon = {
  name: string
  description: string | null
  pricingType: string
  unitPrice: number
  quantity: number
  photoCount: number
  total: number
  photos: Array<{ id: string; fileName: string | null }>
}

export type WorkspaceProduction = {
  jobId: string
  status: string
  selectedCount: number
  expectedOutputCount: number
  assignedEditorName: string | null
  photographerName: string | null
  downloadedAt: string | null
  editingStartedAt: string | null
  readyToUploadAt: string | null
  deliveredAt: string | null
  updatedAt: string | null
  hasError: boolean
  batch: { id: string; status: string; shootDate: string; location: string; createdAt?: string | null } | null
  uploads: Array<{
    id: string
    status: string
    expectedFiles: number
    uploadedFiles: number
    attemptCount: number
    failedFiles: number | null
    updatedAt: string | null
    hasError: boolean
  }> | null
}

export type WorkspacePortal = {
  status: string
  expired: boolean
  createdAt: string | null
  lastAccessedAt: string | null
  accessEmailSentAt: string | null
  deliverablesUploadedAt: string | null
  firstDownloadAt: string | null
  expiresAt: string | null
  downloadExpiryDays: number | null
  pendingDownloadRequests: number | null
  completedOriginalDownloads: number | null
  latestDownloadRequestAt: string | null
}

export type WorkspaceFile = {
  id: string
  fileName: string
  size: number | null
  status: string
  timestamp: string | null
  kind: 'raw' | 'enhanced'
}

export type WorkspaceFiles = {
  rawCount: number | null
  rawFailedCount: number | null
  rawUploadingCount: number | null
  enhancedCount: number | null
  enhancedFailedCount: number | null
  lastRawUploadAt: string | null
  lastEnhancedUploadAt: string | null
  recentFiles: WorkspaceFile[]
}

export type WorkspaceActivity = {
  id: string
  timestamp: string
  label: string
  source: 'booking' | 'payment' | 'selection' | 'production' | 'portal' | 'workflow' | 'email'
}

export type ClientWorkspaceDetails = {
  kind: 'details'
  bookingId: string
  links: ClientWorkspaceLinks
  sections: {
    payments: WorkspaceSection<WorkspacePayments>
    storage: WorkspaceSection<WorkspaceStorage>
    selection: WorkspaceSection<WorkspaceSelection>
    prints: WorkspaceSection<WorkspacePrint[]>
    addons: WorkspaceSection<WorkspaceAddon[]>
    production: WorkspaceSection<WorkspaceProduction>
    portal: WorkspaceSection<WorkspacePortal>
    files: WorkspaceSection<WorkspaceFiles>
    activity: WorkspaceSection<WorkspaceActivity[]>
  }
}
