import type { SupabaseClient } from '@supabase/supabase-js'
import type { Booking, PaymentRecord } from '@/lib/data-store'
import type { SalesExpense, SalesSettings } from '@/lib/sales-finance'

export type SalesBooking = Pick<
  Booking,
  'id' | 'bookingDate' | 'bookingStatus' | 'paymentStatus' | 'price' | 'paymentHistory' |
  'createdAt' | 'packageId' | 'packageName' | 'discountAmount'
>

const PAGE_SIZE = 1000

function mapPaymentHistory(value: unknown): PaymentRecord[] {
  if (Array.isArray(value)) return value as PaymentRecord[]
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as PaymentRecord[]) : []
  } catch {
    return []
  }
}

export function mapExpense(row: Record<string, unknown>): SalesExpense {
  return {
    id: String(row.id),
    expenseType: row.expense_type as SalesExpense['expenseType'],
    name: String(row.name),
    category: String(row.category),
    amount: Number(row.amount ?? 0),
    expenseDate: String(row.expense_date),
    recurrence: row.recurrence as SalesExpense['recurrence'],
    startDate: row.start_date ? String(row.start_date) : null,
    endDate: row.end_date ? String(row.end_date) : null,
    bookingId: row.booking_id ? String(row.booking_id) : null,
    notes: row.notes ? String(row.notes) : null,
    isActive: Boolean(row.is_active),
  }
}

export async function getSalesSettings(client: SupabaseClient): Promise<SalesSettings> {
  const { data, error } = await client
    .from('sales_settings')
    .select('monthly_revenue_target,desired_monthly_profit,desired_profit_margin')
    .eq('id', 'default')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return {
    monthlyRevenueTarget: Number(data?.monthly_revenue_target ?? 0),
    desiredMonthlyProfit: Number(data?.desired_monthly_profit ?? 0),
    desiredProfitMargin: Number(data?.desired_profit_margin ?? 0),
  }
}

export async function listSalesExpenses(
  client: SupabaseClient,
  { activeOnly = false, ordered = true }: { activeOnly?: boolean; ordered?: boolean } = {},
): Promise<SalesExpense[]> {
  const result: SalesExpense[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const baseQuery = client
      .from('sales_expenses')
      .select('id,expense_type,name,category,amount,expense_date,recurrence,start_date,end_date,booking_id,notes,is_active,created_at')
    const filteredQuery = activeOnly ? baseQuery.eq('is_active', true) : baseQuery
    const orderedQuery = ordered
      ? filteredQuery.order('expense_date', { ascending: false }).order('created_at', { ascending: false }).order('id')
      : filteredQuery.order('id')
    const { data, error } = await orderedQuery.range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    result.push(...(data ?? []).map((row) => mapExpense(row as Record<string, unknown>)))
    if ((data ?? []).length < PAGE_SIZE) return result
  }
}

export async function listSalesBookings(client: SupabaseClient): Promise<SalesBooking[]> {
  const result: SalesBooking[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from('bookings')
      .select('id,booking_date,booking_status,payment_status,price,payment_history,created_at,package_id,package_name,discount_amount')
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    result.push(...(data ?? []).map((row) => ({
      id: String(row.id),
      bookingDate: String(row.booking_date || ''),
      bookingStatus: row.booking_status as SalesBooking['bookingStatus'],
      paymentStatus: row.payment_status as SalesBooking['paymentStatus'],
      price: Number(row.price ?? 0),
      paymentHistory: mapPaymentHistory(row.payment_history),
      createdAt: String(row.created_at || ''),
      packageId: String(row.package_id || ''),
      packageName: String(row.package_name || 'Unassigned package'),
      discountAmount: Number(row.discount_amount ?? 0),
    })))
    if ((data ?? []).length < PAGE_SIZE) return result
  }
}

export async function listSalesAddonOrders(client: SupabaseClient) {
  const result: { bookingId: string; name: string; quantity: number; totalAmount: number }[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from('client_addon_orders')
      .select('id,booking_id,name_snapshot,quantity,total_amount')
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    result.push(...(data ?? []).map((row) => ({
      bookingId: String(row.booking_id),
      name: String(row.name_snapshot || 'Other add-on'),
      quantity: Number(row.quantity ?? 0),
      totalAmount: Number(row.total_amount ?? 0),
    })))
    if ((data ?? []).length < PAGE_SIZE) return result
  }
}
