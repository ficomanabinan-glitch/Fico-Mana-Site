import type { Metadata } from 'next'
import { Suspense } from 'react'
import AdminLogin from './login-form'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center text-white/50 text-sm">
          Loading...
        </div>
      }
    >
      <AdminLogin />
    </Suspense>
  )
}
