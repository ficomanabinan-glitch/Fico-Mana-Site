'use server'

import type { LoginActionState } from '@/lib/auth/login-state'

/**
 * Fail-closed compatibility action for the retired admin authenticator.
 *
 * The visible /admin screen no longer calls this action, but keeping this export
 * as an inert dead end ensures any stale client bundle or previously generated
 * Server Action reference can never authenticate a user.
 */
export async function loginAdmin(): Promise<LoginActionState> {
  return {
    success: false,
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid email or password.',
  }
}
