import { createHash } from 'node:crypto'
import { z } from 'zod'

export const emailHealthRequest = z.object({
  to: z.string().trim().max(254).email(),
  requestId: z.string().uuid(),
}).strict()

export function buildEmailHealthCheck(from: string, actorId: string, input: z.infer<typeof emailHealthRequest>) {
  // Keep both the key and message identical on a retry. No booking records are created.
  const digest = createHash('sha256').update(JSON.stringify([actorId, input.to, input.requestId])).digest('hex')
  return {
    payload: {
      from, to: input.to,
      subject: 'FICO MANA — Resend production test',
      text: 'This is a test email from FICO MANA. Receiving this message confirms delivery from the website email service. No booking or payment was created.',
      html: '<p>This is a test email from <strong>FICO MANA</strong>.</p><p>Receiving this message confirms delivery from the website email service.</p><p>No booking or payment was created.</p>',
    },
    options: { idempotencyKey: `email-health/${digest}` },
  }
}

type HealthMessage = ReturnType<typeof buildEmailHealthCheck>
type HealthSender = (payload: HealthMessage['payload'], options: HealthMessage['options']) => Promise<{
  data: { id: string } | null
  error: { name: string } | null
}>

export async function sendEmailHealthCheck(message: HealthMessage, send: HealthSender) {
  const result = await send(message.payload, message.options)
  if (result.error || !result.data?.id) {
    const name = result.error?.name
    const solution = name === 'validation_error' || name === 'restricted_api_key'
      ? 'Try: verify the sender domain in Resend and check that the production API key can send from it.'
      : name === 'invalid_api_key' || name === 'missing_api_key'
        ? 'Try: update the production Resend API key in Vercel, then redeploy.'
        : name === 'rate_limit_exceeded' || name === 'daily_quota_exceeded' || name === 'monthly_quota_exceeded'
          ? 'Try: wait for the Resend limit to reset or check your sending quota.'
          : 'Try: check Resend email logs, then retry this same request.'
    throw new Error(`Resend did not confirm acceptance. ${solution}`)
  }
  return { success: true as const, deliveryStatus: 'accepted' as const, resendId: result.data.id, to: message.payload.to }
}
