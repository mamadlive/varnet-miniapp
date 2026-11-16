/**
 * Cloudflare Pages Function — GET /api/admin/users
 *
 * Admin user list read from D1. The authenticated admin is upserted first, so
 * a panel opened by an allow-listed account always contains at least that
 * account (and its id is a valid `POST /api/admin/wallet/adjust` target).
 * No fixtures are returned under any circumstances.
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

  const db = context.env.DB!
  const selfId = `usr_tg_${auth.user.id}`
  const now = new Date().toISOString()

  try {
    // Self-provision the caller so they can top up their own wallet even before
    // their first purchase. Existing profile fields are never cleared.
    await db
      .prepare(
        `INSERT INTO users (id, telegram_id, username, first_name, last_name, balance, currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 'IRT', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           username = COALESCE(excluded.username, users.username),
           first_name = COALESCE(excluded.first_name, users.first_name),
           last_name = COALESCE(excluded.last_name, users.last_name),
           updated_at = excluded.updated_at`,
      )
      .bind(
        selfId,
        auth.user.id,
        auth.user.username?.trim() || null,
        auth.user.first_name?.trim() || null,
        auth.user.last_name?.trim() || null,
        now,
        now,
      )
      .run()
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'ثبت حساب مدیر در پایگاه داده انجام نشد.')
  }

  let rows: UserRow[]
  try {
    const result = await db
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
      // Access is already verified above, so the caller's own row is presented
      // as an admin without persisting a role change.
      role: row.id === selfId || row.role === 'admin' ? 'admin' : 'user',
      balance: Number(row.balance ?? 0),
      currency: row.currency ?? 'IRT',
      verified: false,
      createdAt: row.created_at,
    })),
    meta: { count: rows.length, limit: USER_LIMIT },
  })
}
