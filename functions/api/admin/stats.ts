import { authenticateAdmin, failure, jsonResponse, type PagesContext } from './_shared'

interface CountsRow {
  total_users: number
  total_sales: number
  pending_orders: number
  pending_receipts: number
}

interface RevenueRow {
  day: string
  revenue: number
  orders: number
}

/** Dashboard totals and sales by order creation date, using UTC calendar days. */
export async function onRequestGet(context: PagesContext): Promise<Response> {
  const auth = await authenticateAdmin(context.request, context.env)
  if (!auth.ok) return failure(auth.status, auth.code, auth.message)

  try {
    const db = context.env.DB!
    const today = new Date()
    const endDay = today.toISOString().slice(0, 10)
    const startDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 6))
      .toISOString().slice(0, 10)
    const counts = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM users) AS total_users,
      (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status IN ('completed', 'paid')) AS total_sales,
      (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pending_orders,
      (SELECT COUNT(*) FROM payment_receipts WHERE status = 'PENDING') AS pending_receipts`).first<CountsRow>()
    if (!counts) throw new Error('Missing dashboard totals')

    const result = await db.prepare(`SELECT date(created_at) AS day, SUM(total) AS revenue, COUNT(*) AS orders
      FROM orders
      WHERE status IN ('completed', 'paid')
        AND date(created_at) BETWEEN ? AND ?
      GROUP BY date(created_at)
      ORDER BY day`).bind(startDay, endDay).all<RevenueRow>()

    const revenueByDay = new Map(result.results.map((row) => [row.day, row]))
    const revenue = revenueByDay.size === 0 ? [] : Array.from({ length: 7 }, (_, index) => {
      const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 6 + index))
        .toISOString().slice(0, 10)
      const row = revenueByDay.get(day)
      return { label: day, revenue: Number(row?.revenue ?? 0), orders: Number(row?.orders ?? 0) }
    })

    return jsonResponse({
      success: true,
      data: {
        totalUsers: Number(counts.total_users),
        totalSales: Number(counts.total_sales),
        pendingOrders: Number(counts.pending_orders),
        pendingReceipts: Number(counts.pending_receipts),
        revenue,
      },
    })
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'خواندن آمار داشبورد از پایگاه داده انجام نشد.')
  }
}
