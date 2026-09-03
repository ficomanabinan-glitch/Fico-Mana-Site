import type { SupabaseClient } from '@supabase/supabase-js'
import type { SalesExpense, SalesSettings } from '@/lib/sales-finance'

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
  const { data, error } = await client.from('sales_settings').select('*').eq('id', 'default').maybeSingle()
  if (error) throw new Error(error.message)
  return {
    monthlyRevenueTarget: Number(data?.monthly_revenue_target ?? 0),
    desiredMonthlyProfit: Number(data?.desired_monthly_profit ?? 0),
    desiredProfitMargin: Number(data?.desired_profit_margin ?? 0),
  }
}

export async function listSalesExpenses(client: SupabaseClient): Promise<SalesExpense[]> {
  const { data, error } = await client
    .from('sales_expenses')
    .select('*')
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapExpense(row as Record<string, unknown>))
}
