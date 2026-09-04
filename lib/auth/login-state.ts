export type LoginErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'SERVER_ERROR'

export type LoginActionState = {
  success: boolean
  code?: LoginErrorCode
  message?: string
  retryAfterSeconds?: number
  retryAt?: number
}

export const initialLoginState: LoginActionState = { success: false }
