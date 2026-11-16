/**
 * POST /api/auth/telegram
 *
 * Validates the Telegram Web App `initData` signature with the bot token,
 * then upserts the Telegram account into D1 and returns a signed session token.
 * This is the only place where demo-mode resolution is left to the client:
 * the server never fabricates a user.
 */

import {
  createSessionToken,
  configuredAdminIds,
  verifyInitData,
} from '../_lib/telegram'
import {
  failure,
  jsonResponse,
  type AdminEnv,
  type D1Database,
} from '../admin/_shared'

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

const MAX_INIT_DATA_LENGTH = 8192

function readInitData(
  request: Request,
  body: { initData?: unknown },
): string {
  const fromBody = typeof body.initData === 'string' ? body.initData : ''
  const fromHeader = request.headers.get('X-Telegram-Init-Data') ?? ''
  return (fromBody || fromHeader).trim()
}

async function loadRole(
  db: D1Database,
  userId: string,
  allowListed: boolean,
): Promise<string> {
  const existing = await db
    .prepare('SELECT role FROM users WHERE id = ?')
    .bind(userId)
    .first<{ role: string | null }>()
  return allowListed || existing?.role === 'admin' ? 'admin' : 'user'
}

export async function onRequestPost(context: {
  request: Request
  env: AdminEnv
}): Promise<Response> {
  const { request, env } = context

  let body: { initData?: unknown } = {}
  try {
    const raw = await request.text()
    if (raw) body = JSON.parse(raw) as { initData?: unknown }
  } catch {
    return failure(400, 'AUTH_BAD_REQUEST', 'بدنه درخواست احراز هویت معتبر نیست.')
  }

  const initData = readInitData(request, body)
  if (!initData) {
    return failure(400, 'AUTH_VALIDATION', 'داده احراز هویت تلگرام ارسال نشده است.')
  }
  if (initData.length > MAX_INIT_DATA_LENGTH) {
    return failure(400, 'AUTH_VALIDATION', 'داده احراز هویت تلگرام بیش از حد بزرگ است.')
  }

  const botToken = env.TELEGRAM_BOT_TOKEN?.trim()
  if (!botToken) {
    return failure(500, 'SERVER_NOT_CONFIGURED', 'توکن ربات تلگرام در تنظیمات سرور موجود نیست.')
  }

  if (!env.DB) {
    return failure(503, 'DB_NOT_CONFIGURED', 'اتصال پایگاه‌داده D1 در سرور تنظیم نشده است.')
  }
  const db = env.DB

  const telegramUser = await verifyInitData(initData, botToken)
  if (!telegramUser) {
    return failure(
      401,
      'TELEGRAM_AUTH_INVALID',
      'نشست تلگرام معتبر نیست یا منقضی شده است. مینی‌اپ را دوباره باز کنید.',
    )
  }

  const userId = `usr_tg_${telegramUser.id}`
  const now = new Date().toISOString()

  try {
    const role = await loadRole(db, userId, configuredAdminIds(env).has(telegramUser.id))

    await db
      .prepare(
        `INSERT INTO users
          (id, telegram_id, username, first_name, last_name, role, balance, currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'IRT', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           telegram_id = excluded.telegram_id,
           username = COALESCE(excluded.username, users.username),
           first_name = COALESCE(excluded.first_name, users.first_name),
           last_name = COALESCE(excluded.last_name, users.last_name),
           role = excluded.role,
           updated_at = excluded.updated_at`,
      )
      .bind(
        userId,
        telegramUser.id,
        telegramUser.username?.trim() || null,
        telegramUser.first_name?.trim() || null,
        telegramUser.last_name?.trim() || null,
        role,
        now,
        now,
      )
      .run()

    const row = await db
      .prepare(
        `SELECT id, telegram_id, username, first_name, last_name, role, balance, currency, created_at
         FROM users WHERE id = ?`,
      )
      .bind(userId)
      .first<UserRow>()

    if (!row) {
      return failure(503, 'DB_UNAVAILABLE', 'ثبت حساب کاربر در پایگاه‌داده انجام نشد.')
    }

    const session = await createSessionToken(telegramUser.id, botToken)

    return jsonResponse({
      success: true,
      data: {
        token: session.token,
        expiresAt: session.expiresAt,
        user: {
          id: row.id,
          telegramId: Number(row.telegram_id ?? telegramUser.id),
          username: row.username ?? undefined,
          firstName: row.first_name || telegramUser.first_name || 'کاربر تلگرام',
          lastName: row.last_name ?? undefined,
          photoUrl: telegramUser.photo_url,
          role: row.role === 'admin' ? 'admin' : 'user',
          balance: Number(row.balance ?? 0),
          currency: row.currency || 'IRT',
          createdAt: row.created_at,
        },
      },
    })
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'ثبت یا خواندن حساب کاربر در پایگاه‌داده انجام نشد.')
  }
}
