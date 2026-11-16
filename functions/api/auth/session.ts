/**
 * GET /api/auth/session
 *
 * Resolves the current D1 user from either a Bearer session token issued by
 * `POST /api/auth/telegram` or a freshly signed `initData` header. Used by the
 * client to confirm a session is still valid; it never creates demo users.
 */

import { verifyInitData, verifySessionToken } from '../_lib/telegram'
import {
  failure,
  jsonResponse,
  type AdminEnv,
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

function bearerToken(request: Request): string {
  const header = request.headers.get('Authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]?.trim() ?? ''
}

export async function onRequestGet(context: {
  request: Request
  env: AdminEnv
}): Promise<Response> {
  const { request, env } = context

  const botToken = env.TELEGRAM_BOT_TOKEN?.trim()
  if (!botToken) {
    return failure(500, 'SERVER_NOT_CONFIGURED', 'توکن ربات تلگرام در تنظیمات سرور موجود نیست.')
  }
  if (!env.DB) {
    return failure(503, 'DB_NOT_CONFIGURED', 'اتصال پایگاه‌داده D1 در تنظیمات سرور نشده است.')
  }

  let telegramId: number | null = null
  const token = bearerToken(request)

  if (token) {
    telegramId = await verifySessionToken(token, botToken)
    if (telegramId === null) {
      return failure(401, 'SESSION_INVALID', 'نشست منقضی شده است. مینی‌اپ را دوباره باز کنید.')
    }
  } else {
    const initData = request.headers.get('X-Telegram-Init-Data')?.trim()
    if (!initData) {
      return failure(401, 'TELEGRAM_AUTH_REQUIRED', 'برای خواندن نشست باید داخل تلگرام وارد شوید.')
    }
    const telegramUser = await verifyInitData(initData, botToken)
    if (!telegramUser) {
      return failure(
        401,
        'TELEGRAM_AUTH_INVALID',
        'نشست تلگرام معتبر نیست یا منقضی شده است. مینی‌اپ را دوباره باز کنید.',
      )
    }
    telegramId = telegramUser.id
  }

  try {
    const row = await env.DB.prepare(
      `SELECT id, telegram_id, username, first_name, last_name, role, balance, currency, created_at
       FROM users WHERE telegram_id = ?`,
    )
      .bind(telegramId)
      .first<UserRow>()

    if (!row) {
      return failure(401, 'USER_NOT_FOUND', 'حساب کاربری یافت نشد. مینی‌اپ را دوباره باز کنید.')
    }

    return jsonResponse({
      success: true,
      data: {
        user: {
          id: row.id,
          telegramId: Number(row.telegram_id),
          username: row.username ?? undefined,
          firstName: row.first_name || 'کاربر تلگرام',
          lastName: row.last_name ?? undefined,
          role: row.role === 'admin' ? 'admin' : 'user',
          balance: Number(row.balance ?? 0),
          currency: row.currency || 'IRT',
          createdAt: row.created_at,
        },
      },
    })
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'خواندن حساب کاربر از پایگاه‌داده انجام نشد.')
  }
}
