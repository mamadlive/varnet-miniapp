/**
 * Cloudflare Pages Function — GET /api/static-ip/services
 *
 * «سرویس‌های من» for static IP: every `kind = 'vpn'` order of the signed-in
 * customer that is pending, paid or completed, straight from D1. The order
 * status is exposed so the Mini App can gate the config download until the
 * admin approves and delivers the service.
 */

import { authenticateUser, userIdFor, type UserContext } from '../_lib/userAuth'
import { readServiceAccess, type ServiceAccessState } from '../_lib/staticIpAccess'

interface ServiceRow {
  id: string
  product_title: string
  total: number
  currency: string
  status: string
  delivery_note: string | null
  created_at: string
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
        `SELECT id, product_title, total, currency, status, delivery_note, created_at
         FROM orders
         WHERE user_id = ? AND kind = 'vpn'
           AND status IN ('pending', 'paid', 'completed')
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(userIdFor(auth.user), SERVICE_LIMIT)
      .all<ServiceRow>()
    rows = result.results ?? []
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'خواندن سرویس‌های فعال از پایگاه داده انجام نشد.')
  }

  // One access read per distinct order; index by order id.
  const accessById = new Map<string, ServiceAccessState>()
  for (const row of rows) {
    if (accessById.has(row.id)) continue
    const lookup = await readServiceAccess(db, row.id)
    // A failed access read must not silently expose a suspended config.
    if (!lookup.ok) {
      return failure(503, 'DB_UNAVAILABLE', 'خواندن وضعیت سرویس‌ها از پایگاه داده انجام نشد.')
    }
    accessById.set(row.id, lookup.access)
  }

  return jsonResponse({
    success: true,
    data: rows.map((row) => {
      const access = accessById.get(row.id)!
      return {
        id: row.id,
        orderId: row.id,
        planName: row.product_title,
        status: row.status,
        // Delivery notes are withheld while suspended.
        deliveryNote: access.suspended ? null : row.delivery_note,
        access: {
          state: access.suspended ? 'suspended' : 'active',
          reason: access.reason,
          suspendedAt: access.suspendedAt,
        },
        amount: Number(row.total),
        currency: 'IRT',
        purchasedAt: row.created_at,
        completedAt: row.created_at,
      }
    }),
    meta: { count: rows.length, limit: SERVICE_LIMIT },
  })
}
