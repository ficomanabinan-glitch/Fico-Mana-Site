import { notFound } from 'next/navigation'
import ProvisioningPage from '@/app/admin/provisioning/page'
import { AdminToastProvider } from '@/components/admin-toast-provider'
import StaffQueryProvider from '@/components/staff-query-provider'
import LocalPreviewProvider from './local-preview-provider'

export default function LocalClientPortalsPreview() {
  if (process.env.NODE_ENV !== 'development') notFound()

  return (
    <main className="editor-console min-h-screen bg-[#181818] p-4 text-white sm:p-6 lg:p-8">
      <LocalPreviewProvider>
        <StaffQueryProvider>
          <AdminToastProvider>
            <ProvisioningPage />
          </AdminToastProvider>
        </StaffQueryProvider>
      </LocalPreviewProvider>
    </main>
  )
}
