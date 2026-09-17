import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'

class RawUploadError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const subject = loadTs<typeof import('../lib/raw-upload-generation.ts')>('lib/raw-upload-generation.ts', {
  '@/lib/raw-upload-contract': { RawUploadError },
})

type SelectionState = { raw_upload_generation: number; raw_reset_id: string | null }

function adminForMissingSelection(options: { insertErrorCode?: string } = {}) {
  let selectionReads = 0
  let inserted: Record<string, unknown> | null = null
  const state: SelectionState = { raw_upload_generation: 0, raw_reset_id: null }

  return {
    get inserted() { return inserted },
    client: {
      from(table: string) {
        if (table === 'bookings') {
          const query = {
            select() { return query },
            eq() { return query },
            async maybeSingle() { return { data: { selection_limit: 8 }, error: null } },
          }
          return query
        }
        if (table !== 'photo_selections') throw new Error(`Unexpected table: ${table}`)
        const query = {
          select() { return query },
          eq() { return query },
          async maybeSingle() {
            selectionReads += 1
            return selectionReads === 1 ? { data: null, error: null } : { data: state, error: null }
          },
          async insert(value: Record<string, unknown>) {
            inserted = value
            return options.insertErrorCode
              ? { error: { code: options.insertErrorCode } }
              : { error: null }
          },
        }
        return query
      },
    },
  }
}

test('first upload creates only the missing selection control row', async () => {
  const admin = adminForMissingSelection()
  const generation = await subject.rawUploadGeneration(admin.client as never, 'workspace-1', 'FM-647257')

  assert.equal(generation, 0)
  assert.deepEqual(admin.inserted, {
    workspace_id: 'workspace-1',
    booking_id: 'FM-647257',
    status: 'OPEN',
    client_status: 'Not Started',
    required_count: 8,
    included_limit: 5,
  })
})

test('first upload tolerates another session creating the control row', async () => {
  const admin = adminForMissingSelection({ insertErrorCode: '23505' })
  assert.equal(await subject.rawUploadGeneration(admin.client as never, 'workspace-1', 'FM-647257'), 0)
})

test('existing reset state still blocks an upload session', async () => {
  const state = { raw_upload_generation: 3, raw_reset_id: 'reset-1' }
  const query = {
    select() { return query },
    eq() { return query },
    async maybeSingle() { return { data: state, error: null } },
  }
  const admin = { from() { return query } }

  await assert.rejects(
    subject.rawUploadGeneration(admin as never, 'workspace-1', 'FM-647257'),
    (error: unknown) => error instanceof RawUploadError && error.status === 409 && /being cleared/.test(error.message),
  )
})
