/**
 * Cloudflare Pages Function — GET /api/static-ip/services
 *
 * «سرویس‌های من» for static IP: every `kind = 'vpn'` order of the signed-in
 * customer that is pending, paid or completed, straight from D1. The order
 * status is exposed so the Mini App can gate the config download until the
 * admin approves and delivers the service.
 */

import { authenticateUser, userIdFor, type UserContext } from '../_lib/userAuth'

interface ServiceRow {
  id: string
  product_title: string
  total: number
  currency: string
  status: string
  delivery_note: string | null
  created_at: string
  updated_at: string | null
}

const SERVICE_LIMIT = 50

const RESPONSE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS })
}

function failure(status: number, code: string, message: string): Response {
  return jsonResponse({ success: false, code, message }, status)
}

export async function onRequestGet(context: UserContext): Promise<Response> {
  const auth = await authenticateUser(context.request, context.env)
  if (!auth.ok) return failure(auth.status, auth.code, auth.message)

  const db = context.env.DB
  if (!db) return failure(503, 'DB_NOT_CONFIGURED', 'پایگاه داده سرویس‌ها در سرور تنظیم نشده است.')

  let rows: ServiceRow[]
  try {
    const result = await db
      .prepare(
        `SELECT id, product_title, total, currency, status, delivery_note, created_at, updated_at
         FROM orders
         WHERE user_id = ? AND kind = 'vpn'
           AND status IN ('pending', 'paid', 'completed')
         ORDER BY COALESCE(updated_at, created_at) DESC
         LIMIT ?`,
      )
      .bind(userIdFor(auth.user), SERVICE_LIMIT)
      .all<ServiceRow>()
    rows = result.results ?? []
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'خواندن سرویس‌های فعال از پایگاه داده انجام نشد.')
  }

  return jsonResponse({
    success: true,
    data: rows.map((row) => ({
      id: row.id,
      orderId: row.id,
      planName: row.product_title,
      status: row.status,
      deliveryNote: row.delivery_note,
      amount: Number(row.total),
      currency: 'IRT',
      purchasedAt: row.created_at,
      completedAt: row.updated_at ?? row.created_at,
    })),
    meta: { count: rows.length, limit: SERVICE_LIMIT },
  })
}
