import { z } from 'zod'

export const bookingReferenceSchema = z
  .string()
  .trim()
  .min(4)
  .max(100)
  .regex(/^[A-Za-z0-9-]+$/, 'Invalid booking reference.')

export const customerEmailSchema = z.string().trim().toLowerCase().email().max(320)

export const googleDriveFolderUrlSchema = z
  .string()
  .trim()
  .max(2_000)
  .url()
  .refine((value) => {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'drive.google.com' && url.pathname.startsWith('/drive/folders/')
  }, 'A Google Drive folder URL is required.')

export const portalSessionSchema = z
  .object({
    publicId: z.string().trim().min(8).max(200),
    signature: z.string().trim().regex(/^[a-f0-9]{64}$/i),
  })
  .strict()

export const publicBookingLookupSchema = z
  .object({ id: bookingReferenceSchema, email: customerEmailSchema })
  .strict()

export const publicRawSubmissionSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    email: customerEmailSchema,
    rawPhotoLink: googleDriveFolderUrlSchema,
    bookingId: bookingReferenceSchema.optional(),
  })
  .strict()

export const publicRawLinkSubmitSchema = z
  .object({ email: customerEmailSchema, rawPhotoLink: googleDriveFolderUrlSchema })
  .strict()

export const publicReceiptResubmitSchema = z
  .object({
    email: customerEmailSchema,
    receiptUrl: z.string().trim().regex(/^\/api\/receipts\/[0-9a-f-]{36}$/i).max(100),
    transactionRef: z.string().trim().max(160).optional(),
    paymentMethod: z.enum(['GCash', 'BPI']).optional(),
  })
  .strict()

const portalEnhancementPreferenceSchema = z.enum(['standard', 'less', 'raw'])
const portalPrintCategorySchema = z.enum([
  'TOGA_PICTURE_4R',
  'ALAMPAY_BARONG_4R',
  'FRAME_8R',
  'WALLET_SIZE',
])

export const portalDrivePhotosSchema = z.object({ pin: z.string().regex(/^[0-9]{4}$/) }).strict()

export const portalSelectionSchema = z
  .object({
    pin: z.string().regex(/^[0-9]{4}$/),
    // fileIds remains accepted for older portal links. New clients send the
    // explicit included/extra arrays so the server can price Extra Edit safely.
    fileIds: z.array(z.string().uuid()).min(1).max(205),
    includedFileIds: z.array(z.string().uuid()).max(5).optional(),
    extraEditFileIds: z.array(z.string().uuid()).max(200).optional(),
    preferences: z
      .array(z.object({ fileId: z.string().uuid(), preference: portalEnhancementPreferenceSchema }).strict())
      .max(205)
      .default([]),
    printAllocations: z
      .array(
        z
          .object({ category: portalPrintCategorySchema, fileId: z.string().uuid(), quantity: z.number().int().min(1).max(4) })
          .strict(),
      )
      .max(7)
      .default([]),
    addons: z
      .array(
        z
          .object({ addonId: z.string().uuid(), quantity: z.number().int().min(1).max(500), photoCount: z.number().int().min(0).max(200).default(0) })
          .strict(),
      )
      .max(4)
      .default([]),
    acknowledgeNoRevision: z.boolean().default(false),
  })
  .strict()

const databaseIdSchema = z.string().uuid()
const driveFileIdSchema = z.string().trim().min(10).max(200).regex(/^[A-Za-z0-9_-]+$/)
const uploadMimeTypeSchema = z
  .string()
  .trim()
  .min(3)
  .max(100)
  .regex(/^(?:image\/(?:jpeg|png|webp|tiff|heic|heif)|application\/octet-stream)$/i)

export const editorBatchUploadStartSchema = z
  .object({
    clients: z.array(z.object({
      bookingId: bookingReferenceSchema,
      expectedFiles: z.number().int().min(1).max(1_000),
    }).strict()).min(1).max(500),
  })
  .strict()

export const editorUploadSessionSchema = z
  .object({
    uploadJobId: databaseIdSchema,
    bookingId: bookingReferenceSchema,
    relativePath: z.string().min(1).max(500),
    fileName: z.string().trim().min(1).max(255),
    mimeType: uploadMimeTypeSchema,
    fileSize: z.number().int().positive().max(500 * 1024 * 1024),
    checksum: z.string().trim().regex(/^[a-f0-9]{64}$/i),
  })
  .strict()

export const editorUploadCompleteSchema = z
  .object({
    uploadJobId: databaseIdSchema,
    uploadFileId: databaseIdSchema,
    driveFileId: driveFileIdSchema,
    mimeType: uploadMimeTypeSchema,
  })
  .strict()

export const editorUploadFailureSchema = z
  .object({
    uploadJobId: databaseIdSchema,
    uploadFileId: databaseIdSchema,
    error: z.string().trim().min(1).max(1_000),
  })
  .strict()

export const editorClientUploadFinalizeSchema = z
  .object({ uploadJobId: databaseIdSchema, bookingId: bookingReferenceSchema })
  .strict()

export const editorBatchUploadFinalizeSchema = z
  .object({ uploadJobId: databaseIdSchema })
  .strict()

export const editorJobStatusSchema = z
  .object({
    status: z.enum([
      'WAITING_FOR_SELECTION',
      'READY_FOR_EDITING',
      'DOWNLOADED',
      'EDITING',
      'READY_TO_UPLOAD',
      'UPLOADING',
      'DELIVERED',
      'UPLOAD_FAILED',
    ]),
  })
  .strict()

export const clientSelectionStatusSchema = z
  .object({
    status: z.enum([
      'Not Started',
      'Selection In Progress',
      'Submitted',
      'Editing',
      'Ready for Printing',
      'Ready for Release',
      'Released',
    ]),
  })
  .strict()

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional()
const optionalHttpsUrl = z
  .string()
  .trim()
  .max(2_000)
  .refine((value) => value === '' || (() => {
    try { return new URL(value).protocol === 'https:' } catch { return false }
  })(), 'URL must use HTTPS.')
  .optional()

const paymentRecordSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    amount: z.number().finite().nonnegative().max(10_000_000),
    method: z.enum(['GCash', 'Cash', 'Card', 'Maya', 'Bank Transfer', 'BPI']),
    type: z.enum(['Deposit', 'Balance Payment']),
    transactionRef: optionalText(160),
    date: z.string().trim().min(8).max(40),
  })
  .strict()

/** Full booking payload accepted by the shared public/admin write endpoint. */
export const bookingMutationSchema = z
  .object({
    id: bookingReferenceSchema,
    customerName: z.string().trim().min(2).max(160),
    customerEmail: customerEmailSchema,
    customerPhone: z.string().trim().min(5).max(40),
    customerFbLink: optionalHttpsUrl.default(''),
    customerFbName: z.string().trim().max(160).default(''),
    packageId: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
    packageName: z.string().trim().min(1).max(200),
    packageSlotType: z.enum(['makeup', 'standard']).optional(),
    selectionLimit: z.number().int().min(0).max(500).optional(),
    bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    bookingTime: z.string().trim().min(1).max(160),
    slotId: optionalText(100),
    arrivalTime: optionalText(160),
    shootTime: optionalText(160),
    isWalkIn: z.boolean().optional(),
    note: optionalText(5_000),
    staffNotes: optionalText(5_000),
    schoolName: optionalText(200),
    course: optionalText(200),
    hoodColor: optionalText(100),
    togaColor: optionalText(100),
    tasselColor: optionalText(100),
    backgroundColor: optionalText(100),
    depositAmount: z.number().finite().nonnegative().max(10_000_000),
    price: z.number().finite().nonnegative().max(10_000_000),
    transactionRef: optionalText(160),
    bookingStatus: z.enum(['Pending Payment', 'Pending Verification', 'Confirmed', 'Rejected', 'Cancelled', 'Completed', 'No Show']),
    paymentStatus: z.enum(['Unpaid', 'Pending Verification', 'Paid Deposit', 'Paid Full', 'Refunded']),
    rejectionReason: optionalText(1_000),
    rejectionReasonId: optionalText(100),
    createdAt: z.string().trim().min(8).max(40),
    receiptUrl: z.string().trim().regex(/^\/api\/receipts\/[0-9a-f-]{36}$/i).max(100).optional(),
    paymentHistory: z.array(paymentRecordSchema).max(100),
    driveLink: optionalHttpsUrl,
    rawPhotoLink: optionalHttpsUrl,
    rawPhotoStatus: z.enum(['Pending Review', 'Approved', 'Rejected']).optional(),
    rawPhotoNotes: optionalText(5_000),
    rawPhotoSubmittedAt: optionalText(40),
    rawPhotoApprovedAt: optionalText(40),
    editedPhotoLink: optionalHttpsUrl,
    editedPhotoDeliveredAt: optionalText(40),
  })
  .strict()
