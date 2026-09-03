import { Suspense } from 'react'
import AdminLogin from './login-form'

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
