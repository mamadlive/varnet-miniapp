/**
 * Cloudflare Pages Function — POST /api/admin/auth/request-otp
 *
 * Generates a 5-minute Telegram OTP for every id in `ADMIN_TELEGRAM_IDS`,
 * stores only its HMAC digest in D1 and delivers the code through the bot.
 * The endpoint is intentionally unauthenticated (there is no session yet) but
 * never returns admin ids or the code itself.
 *
 * Every failure — misconfiguration, D1 outage, Bot API rejection or an
 * unexpected exception — resolves to a JSON response, so the Worker can never
 * die with an opaque 502 and the login page can show the exact cause.
 */

import { configuredAdminIds, telegramIdKey } from '../../_lib/telegram'
import {
  failure,
  internalFailure,
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
  TelegramSendError,
} from './_otp'

interface RecentRow {
  telegram_id: string
}

async function issueOtp(context: PagesContext): Promise<Response> {
  const env = context.env ?? {}

  const botToken = env.TELEGRAM_BOT_TOKEN?.trim()
  if (!botToken) {
    return failure(
      500,
      'TELEGRAM_CONFIG_MISSING',
      'تنظیمات تلگرام روی سرور یافت نشد: TELEGRAM_BOT_TOKEN تعریف نشده است.',
    )
  }
  if (!env.DB) {
    return failure(
      503,
      'DB_NOT_CONFIGURED',
      'اتصال پایگاه‌داده D1 در سرور تنظیم نشده است (binding با نام DB).',
    )
  }

  const adminIds = [...configuredAdminIds(env)]
  if (adminIds.length === 0) {
    return failure(
      503,
      'ADMIN_LIST_NOT_CONFIGURED',
      'تنظیمات تلگرام روی سرور یافت نشد: ADMIN_TELEGRAM_IDS خالی یا نامعتبر است.',
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
  let sendFailed = 0
  let dbFailed = 0
  let lastDbError = ''
  let lastSendError = ''
  let lastTelegramCode: number | null = null

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
    } catch (cause) {
      dbFailed += 1
      lastDbError = cause instanceof Error ? cause.message : String(cause)
      continue
    }

    try {
      await sendTelegramMessage(botToken, telegramId, otpMessage(code))
      sent += 1
    } catch (cause) {
      sendFailed += 1
      if (cause instanceof TelegramSendError) {
        lastSendError = cause.description
        lastTelegramCode = cause.errorCode
      } else {
        lastSendError = cause instanceof Error ? cause.message : String(cause)
      }
      try {
        await db.prepare('DELETE FROM admin_otps WHERE id = ?').bind(rowId).run()
      } catch {
        // The row expires on its own; cleanup also removes stale codes.
      }
    }
  }

  if (sent === 0) {
    if (sendFailed > 0) {
      return failure(
        502,
        'TELEGRAM_SEND_FAILED',
        `ارسال کد تایید به تلگرام انجام نشد: ${lastSendError || 'خطای نامشخص'}`,
        {
          telegramError: lastSendError || null,
          telegramErrorCode: lastTelegramCode,
        },
      )
    }

    return failure(
      503,
      'DB_UNAVAILABLE',
      `ثبت کد تایید در پایگاه‌داده انجام نشد: ${lastDbError || 'خطای نامشخص'}`,
      { dbError: lastDbError || null },
    )
  }

  return jsonResponse({
    success: true,
    message:
      sendFailed + dbFailed > 0
        ? 'کد تایید به تلگرام ارسال شد، اما ارسال به برخی مدیران ناموفق بود.'
        : 'کد تایید به تلگرام مدیر ارسال شد.',
    data: {
      sent,
      failed: sendFailed + dbFailed,
      expiresAt,
      expiresInSeconds: OTP_TTL_SECONDS,
      cooldownSeconds: OTP_COOLDOWN_SECONDS,
      ...(dbFailed > 0 ? { dbError: lastDbError || null } : {}),
      ...(sendFailed > 0 ? { telegramError: lastSendError || null } : {}),
    },
  })
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  try {
    return await issueOtp(context)
  } catch (cause) {
    return internalFailure(cause, 'REQUEST_OTP_FAILED')
  }
}
