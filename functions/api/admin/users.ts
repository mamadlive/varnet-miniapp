/**
 * Cloudflare Pages Function — GET /api/admin/users
 *
 * Admin user list read from D1. The panel still renders local fixtures in
 * `VITE_DEMO_MODE` without a Telegram session; inside Telegram this is the
 * source of truth, and every row id is a valid target for
 * `POST /api/admin/wallet/adjust`.
 */

import {
  authenticateAdmin,
  failure,
  jsonResponse,
  type PagesContext,
} from './_shared'

interface UserRow {
  id: string
  telegram_id: number
  username: string | null
  first_name: string | null
  last_name: string | null
  role: string | null
  balance: number | null
  currency: string | null
  created_at: string
}

const USER_LIMIT = 500

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const auth = await authenticateAdmin(context.request, context.env)
  if (!auth.ok) return failure(auth.status, auth.code, auth.message)

  let rows: UserRow[]
  try {
    const result = await context.env.DB!
      .prepare(
        `SELECT id, telegram_id, username, first_name, last_name, role, balance, currency, created_at
         FROM users
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(USER_LIMIT)
      .all<UserRow>()
    rows = result.results ?? []
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'خواندن کاربران از پایگاه داده انجام نشد.')
  }

  return jsonResponse({
    success: true,
    data: rows.map((row) => ({
      id: row.id,
      telegramId: Number(row.telegram_id),
      username: row.username ?? undefined,
      firstName: row.first_name ?? 'کاربر',
      lastName: row.last_name ?? undefined,
      role: row.role === 'admin' ? 'admin' : 'user',
      balance: Number(row.balance ?? 0),
      currency: row.currency ?? 'IRT',
      verified: false,
      createdAt: row.created_at,
    })),
    meta: { count: rows.length, limit: USER_LIMIT },
  })
}
