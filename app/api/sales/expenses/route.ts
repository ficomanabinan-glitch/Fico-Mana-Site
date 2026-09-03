import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { listSalesExpenses } from '@/lib/sales-store'

const TYPES = new Set(['fixed', 'variable'])
const RECURRENCES = new Set(['one_time', 'monthly'])

function cleanExpense(body: Record<string, unknown>) {
  const expenseType = String(body.expenseType ?? '')
  const name = String(body.name ?? '').trim()
  const category = String(body.category ?? 'Other').trim() || 'Other'
  const amount = Number(body.amount)
  const expenseDate = String(body.expenseDate ?? '').trim()
  const recurrence = String(body.recurrence ?? 'one_time')
  const startDate = body.startDate ? String(body.startDate) : null
  const endDate = body.endDate ? String(body.endDate) : null
  const bookingId = body.bookingId ? String(body.bookingId).trim() : null
  const notes = body.notes ? String(body.notes).trim() : null
  const isActive = body.isActive === undefined ? true : Boolean(body.isActive)

  if (!TYPES.has(expenseType) || !name || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate) || !RECURRENCES.has(recurrence)) {
    throw new Error('Enter a valid expense type, name, positive amount, date, and recurrence.')
  }
  if (recurrence === 'monthly' && expenseType !== 'fixed') throw new Error('Only fixed expenses can recur monthly.')
  if (endDate && startDate && endDate < startDate) throw new Error('End date cannot be before start date.')

  return {
    expense_type: expenseType,
    name,
    category,
    amount,
    expense_date: expenseDate,
    recurrence,
    start_date: recurrence === 'monthly' ? startDate || expenseDate : null,
    end_date: recurrence === 'monthly' ? endDate : null,
    booking_id: expenseType === 'variable' ? bookingId : null,
    notes,
    is_active: isActive,
    updated_at: new Date().toISOString(),
  }
}

export async function GET() {
  const { error: authError } = await requireStaffAuth()
  if (authError) return authError
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
  try {
    return NextResponse.json(await listSalesExpenses(admin))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load expenses.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { user, error: authError } = await requireStaffAuth()
  if (authError) return authError
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
  try {
    const payload = cleanExpense(await request.json())
    const { data, error } = await admin.from('sales_expenses').insert({ ...payload, created_by: user?.id ?? null }).select('*').single()
    if (error) throw new Error(error.message)
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create expense.' }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  const { error: authError } = await requireStaffAuth()
  if (authError) return authError
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
  try {
    const body = await request.json()
    const id = String(body.id ?? '').trim()
    if (!id) return NextResponse.json({ error: 'Expense ID is required.' }, { status: 400 })
    const payload = cleanExpense(body)
    const { error } = await admin.from('sales_expenses').update(payload).eq('id', id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update expense.' }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  const { error: authError } = await requireStaffAuth()
  if (authError) return authError
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
  const id = new URL(request.url).searchParams.get('id')?.trim()
  if (!id) return NextResponse.json({ error: 'Expense ID is required.' }, { status: 400 })
  const { error } = await admin.from('sales_expenses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
