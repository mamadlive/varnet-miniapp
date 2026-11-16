/**
 * Cloudflare Pages Function — POST /api/admin/auth/request-otp
 *
 * Generates a 5-minute Telegram OTP for every id in `ADMIN_TELEGRAM_IDS`,
 * stores only its HMAC digest in D1 and delivers the code through the bot.
 * The endpoint is intentionally unauthenticated (there is no session yet) but
 * never returns admin ids or the code itself.
 */

import { configuredAdminIds, telegramIdKey } from '../../_lib/telegram'
import {
  failure,
  jsonResponse,
  type PagesContext,
} from '../_shared'
import {
  cleanupOtps,
  generateOtp,
  hashOtp,
  otpMessage,
  OTP_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  sendTelegramMessage,
} from './_otp'

interface RecentRow {
  telegram_id: string
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { env } = context

  const botToken = env.TELEGRAM_BOT_TOKEN?.trim()
  if (!botToken) {
    return failure(500, 'SERVER_NOT_CONFIGURED', 'توکن ربات تلگرام در تنظیمات سرور موجود نیست.')
  }
  if (!env.DB) {
    return failure(503, 'DB_NOT_CONFIGURED', 'اتصال پایگاه‌داده D1 در سرور تنظیم نشده است.')
  }

  const adminIds = [...configuredAdminIds(env)]
  if (adminIds.length === 0) {
    return failure(
      503,
      'ADMIN_LIST_NOT_CONFIGURED',
      'هیچ شناسه مدیریتی در ADMIN_TELEGRAM_IDS تنظیم نشده است.',
    )
  }

  const db = env.DB
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const expiresAt = new Date(now + OTP_TTL_SECONDS * 1000).toISOString()

  await cleanupOtps(db, now)

  // A short cooldown prevents the public endpoint from spamming the admin.
  const cooldownCutoff = new Date(now - OTP_COOLDOWN_SECONDS * 1000).toISOString()
  let cooling = new Set<string>()
  try {
    const recent = await db
      .prepare(
        'SELECT DISTINCT telegram_id FROM admin_otps WHERE created_at > ?',
      )
      .bind(cooldownCutoff)
      .all<RecentRow>()
    cooling = new Set((recent.results ?? []).map((row) => telegramIdKey(row.telegram_id)))
  } catch {
    cooling = new Set()
  }

  const recipients = adminIds.filter((id) => !cooling.has(id))
  if (recipients.length === 0) {
    return failure(
      429,
      'OTP_COOLDOWN',
      'کد تایید همین چند لحظه پیش ارسال شده است. کمی بعد دوباره تلاش کنید.',
      { retryAfterSeconds: OTP_COOLDOWN_SECONDS },
    )
  }

  let sent = 0
  let failed = 0
  let lastError = ''

  for (const telegramId of recipients) {
    const code = generateOtp()
    const codeHash = await hashOtp(code, botToken)
    const rowId = `otp_${crypto.randomUUID()}`

    try {
      await db
        .prepare(
          `INSERT INTO admin_otps
             (id, telegram_id, code, expires_at, attempts, consumed_at, created_at)
           VALUES (?, ?, ?, ?, 0, NULL, ?)`,
        )
        .bind(rowId, telegramId, codeHash, expiresAt, nowIso)
        .run()
    } catch {
      failed += 1
      lastError = 'ثبت کد در پایگاه‌داده انجام نشد.'
      continue
    }

    try {
      await sendTelegramMessage(botToken, telegramId, otpMessage(code))
      sent += 1
    } catch (cause) {
      failed += 1
      lastError = cause instanceof Error ? cause.message : 'ارسال پیام تلگرام ناموفق بود.'
      try {
        await db.prepare('DELETE FROM admin_otps WHERE id = ?').bind(rowId).run()
      } catch {
        // The row expires on its own; cleanup also removes stale codes.
      }
    }
  }

  if (sent === 0) {
    return failure(
      502,
      'TELEGRAM_SEND_FAILED',
      `ارسال کد تایید به تلگرام مدیر انجام نشد: ${lastError || 'خطای نامشخص'}`,
    )
  }

  return jsonResponse({
    success: true,
    message:
      failed > 0
        ? 'کد تایید به تلگرام ارسال شد، اما ارسال به برخی مدیران ناموفق بود.'
        : 'کد تایید به تلگرام مدیر ارسال شد.',
    data: {
      sent,
      failed,
      expiresAt,
      expiresInSeconds: OTP_TTL_SECONDS,
      cooldownSeconds: OTP_COOLDOWN_SECONDS,
    },
  })
}
