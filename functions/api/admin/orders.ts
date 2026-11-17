/**
 * Cloudflare Pages Function — GET /api/admin/orders
 *
 * Every order in D1 with its customer profile, for the admin «سفارش‌ها» tab.
 * Admin-only; fixtures are never returned.
 */

import {
  authenticateAdmin,
  failure,
  jsonResponse,
  type PagesContext,
} from './_shared'

interface OrderRow {
  id: string
  user_id: string
  product_id: string
  product_title: string
  kind: string
  quantity: number
  subtotal: number
  discount: number
  total: number
  status: string
  payment_method: string | null
  delivery_note: string | null
  created_at: string
  first_name: string | null
  last_name: string | null
  username: string | null
  telegram_id: number | null
}

const ORDER_LIMIT = 500

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const auth = await authenticateAdmin(context.request, context.env)
  if (!auth.ok) return failure(auth.status, auth.code, auth.message)

  const db = context.env.DB!
  let rows: OrderRow[]
  try {
    const result = await db
      .prepare(
        `SELECT o.id, o.user_id, o.product_id, o.product_title, o.kind, o.quantity,
                o.subtotal, o.discount, o.total, o.status, o.payment_method,
                o.delivery_note, o.created_at,
                u.first_name, u.last_name, u.username, u.telegram_id
         FROM orders o
         LEFT JOIN users u ON u.id = o.user_id
         ORDER BY o.created_at DESC
         LIMIT ?`,
      )
      .bind(ORDER_LIMIT)
      .all<OrderRow>()
    rows = result.results ?? []
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'خواندن سفارش‌ها از پایگاه داده انجام نشد.')
  }

  return jsonResponse({
    success: true,
    data: rows.map((row) => {
      const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
      return {
        id: row.id,
        userId: row.user_id,
        userName: fullName || row.username || (row.telegram_id ? `کاربر ${row.telegram_id}` : undefined),
        telegramId: row.telegram_id ?? undefined,
        items: [
          {
            productId: row.product_id,
            title: row.product_title,
            kind: row.kind === 'vpn' ? 'vpn' : 'account',
            quantity: Number(row.quantity ?? 1),
            unitPrice: Number(row.subtotal),
          },
        ],
        subtotal: Number(row.subtotal),
        discount: Number(row.discount),
        total: Number(row.total),
        currency: 'IRT',
        status: row.status,
        kind: row.kind === 'vpn' ? 'vpn' : 'account',
        paymentMethod: row.payment_method === 'card' ? 'card' : 'wallet',
        deliveryNote: row.delivery_note ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.created_at,
      }
    }),
    meta: { count: rows.length, limit: ORDER_LIMIT },
  })
}
