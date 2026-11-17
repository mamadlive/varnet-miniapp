/**
 * Cloudflare Pages Function — GET /api/admin/receipts
 *
 * Card-to-card claims (wallet top-ups and direct product purchases) awaiting an
 * admin decision. `?status=PENDING|APPROVED|REJECTED|all` filters the list;
 * the default is PENDING.
 */

import {
  authenticateAdmin,
  failure,
  jsonResponse,
  type PagesContext,
} from './_shared'

interface ReceiptRow {
  id: string
  user_id: string
  telegram_id: number
  purpose: string
  order_id: string | null
  amount: number
  currency: string
  reference: string
  status: string
  note: string | null
  created_at: string
  reviewed_at: string | null
  first_name: string | null
  last_name: string | null
  username: string | null
  product_title: string | null
}

const RECEIPT_LIMIT = 300
const STATUSES = new Set(['PENDING', 'APPROVED', 'REJECTED'])

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const auth = await authenticateAdmin(context.request, context.env)
  if (!auth.ok) return failure(auth.status, auth.code, auth.message)

  const url = new URL(context.request.url)
  const requested = (url.searchParams.get('status') ?? 'PENDING').toUpperCase()
  const status = STATUSES.has(requested) ? requested : null

  const db = context.env.DB!
  try {
    const sql = `SELECT r.id, r.user_id, r.telegram_id, r.purpose, r.order_id, r.amount,
                        r.currency, r.reference, r.status, r.note, r.created_at, r.reviewed_at,
                        u.first_name, u.last_name, u.username, o.product_title
                 FROM payment_receipts r
                 LEFT JOIN users u ON u.id = r.user_id
                 LEFT JOIN orders o ON o.id = r.order_id
                 ${status ? 'WHERE r.status = ?' : ''}
                 ORDER BY r.created_at DESC
                 LIMIT ?`
    const statement = db.prepare(sql)
    const result = status
      ? await statement.bind(status, RECEIPT_LIMIT).all<ReceiptRow>()
      : await statement.bind(RECEIPT_LIMIT).all<ReceiptRow>()

    const rows = result.results ?? []
    return jsonResponse({
      success: true,
      data: rows.map((row) => {
        const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
        return {
          id: row.id,
          userId: row.user_id,
          telegramId: row.telegram_id,
          userName: fullName || row.username || `کاربر ${row.telegram_id}`,
          purpose: row.purpose,
          orderId: row.order_id ?? undefined,
          productTitle: row.product_title ?? undefined,
          amount: Number(row.amount),
          currency: row.currency,
          reference: row.reference,
          status: row.status,
          note: row.note ?? undefined,
          createdAt: row.created_at,
          reviewedAt: row.reviewed_at ?? undefined,
        }
      }),
      meta: { count: rows.length, limit: RECEIPT_LIMIT, status: status ?? 'all' },
    })
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'خواندن فیش‌های واریز انجام نشد.')
  }
}
