import ClientPortalPage, { type PortalData } from '@/components/client-portal-page'

export const metadata = {
  title: 'Sample Client Portal | FICO MANA',
  description: 'Practice selecting graduation photos in the FICO MANA Client Portal with safe sample data.',
}

const samplePhotos = [
  ['/booking_model_preview.jpg', 'SAMPLE-01.JPG'],
  ['/booking_model1.jpg', 'SAMPLE-02.JPG'],
  ['/fatima.jpg', 'SAMPLE-03.JPG'],
  ['/gallery-1.png', 'SAMPLE-04.PNG'],
  ['/gallery-2.png', 'SAMPLE-05.PNG'],
  ['/gallery-3.png', 'SAMPLE-06.PNG'],
] as const

export default function SamplePortalPage() {
  const publicId = 'sample-client-portal'
  const gallery = samplePhotos.map(([previewUrl, fileName], index) => ({ id: `sample-${index + 1}`, fileName, mimeType: previewUrl.endsWith('.png') ? 'image/png' : 'image/jpeg', previewUrl }))
  const data: PortalData = {
    booking: { id: 'SAMPLE-BOOKING', customerName: 'Sample Graduation Client', packageName: 'Sample Graduation Package', bookingDate: '2026-09-14', bookingTime: '10:00 AM', bookingStatus: 'Sample', paymentStatus: 'Sample deposit', price: 6500, depositAmount: 500, amountPaid: 500 },
    portalId: publicId,
    shareUrl: 'https://ficomana.com/portal/sample',
    expiry: null,
    selection: { id: 'sample-selection', status: 'OPEN', requiredCount: 5, includedLimit: 5, clientStatus: 'Sample selection', noRevisionAcknowledged: false, selectedIds: [], selectedItems: [], printAllocations: [], addonOrders: [], totalAddonAmount: 0 },
    gallery,
    galleryTotal: gallery.length,
    galleryOffset: 0,
    galleryLimit: 48,
    editingStatus: 'WAITING_FOR_SELECTION',
    addonCatalog: [{ id: 'sample-extra-edit', name: 'Extra Edit', description: '', price: 400, pricingType: 'per_photo', maxQuantity: 1 }],
    deliverables: [],
    resources: [],
    downloadAllUrl: '#',
    rawDownloadAllUrl: null,
    rawDownloadRequestUrl: null,
    rawDownloadAccess: null,
    warnings: [],
  }

  return <ClientPortalPage publicId={publicId} initialData={data} sampleMode />
}
