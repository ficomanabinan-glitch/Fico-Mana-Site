import { validateProductionSecurityEnvironment } from '@/lib/security/environment'

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') validateProductionSecurityEnvironment()
}
