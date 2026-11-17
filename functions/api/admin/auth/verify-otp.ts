/**
 * Cloudflare Pages Function — POST /api/admin/auth/verify-otp
 *
 * Checks a 6-digit Telegram OTP, consumes it, and returns a signed admin
 * session token (12 h) that the desktop panel stores and sends as a Bearer
 * token on every `/api/admin/*` request.
 */

import {
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
} from '../../_lib/telegram'
import {
  failure,
  internalFailure,
  isAdminAllowed,
  jsonResponse,
  loadTelegramProfile,
  type PagesContext,
} from '../_shared'
import {
  clientIp,
  hashOtp,
  normalizeOtp,
  OTP_FAILURE_WINDOW_SECONDS,
  OTP_MAX_ATTEMPTS,
} from './_otp'

interface OtpRow {
  id: string
  telegram_id: string
  expires_at: string
  attempts: number | null
  consumed_at: string | null
}

interface FailureRow {
  attempts: number
  window_start: string
}

async function recordFailure(context: PagesContext, ip: string, now: number): Promise<void> {
  const db = context.env.DB!
  const nowIso = new Date(now).toISOString()
  try {
    const row = await db
      .prepare('SELECT attempts, window_start FROM admin_otp_failures WHERE ip = ?')
      .bind(ip)
      .first<FailureRow>()
    const windowMs = OTP_FAILURE_WINDOW_SECONDS * 1000
    const fresh = row && now - Date.parse(row.window_start) < windowMs
    if (!fresh) {
      await db
        .prepare(
          `INSERT INTO admin_otp_failures (ip, attempts, window_start)
           VALUES (?, 1, ?)
           ON CONFLICT(ip) DO UPDATE SET attempts = 1, window_start = excluded.window_start`,
        )
        .bind(ip, nowIso)
        .run()
      return
    }
    await db
      .prepare('UPDATE admin_otp_failures SET attempts = attempts + 1 WHERE ip = ?')
      .bind(ip)
      .run()
  } catch {
    // Throttle bookkeeping must not mask the OTP error itself.
  }
}

async function isThrottled(context: PagesContext, ip: string, now: number): Promise<boolean> {
  try {
    const row = await context.env.DB!.prepare(
      'SELECT attempts, window_start FROM admin_otp_failures WHERE ip = ?',
    )
      .bind(ip)
      .first<FailureRow>()
    if (!row) return false
    const windowMs = OTP_FAILURE_WINDOW_SECONDS * 1000
    if (now - Date.parse(row.window_start) >= windowMs) return false
    return row.attempts >= OTP_MAX_ATTEMPTS
  } catch {
    return false
  }
}

async function handleVerifyOtp(context: PagesContext): Promise<Response> {
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

  let body: { code?: unknown } = {}
  try {
    const raw = await context.request.text()
    if (raw) body = JSON.parse(raw) as { code?: unknown }
  } catch {
    return failure(400, 'OTP_VALIDATION', 'بدنه درخواست کد تایید معتبر نیست.')
  }

  const code = normalizeOtp(body.code)
  if (!code) {
    return failure(400, 'OTP_VALIDATION', 'کد تایید باید یک عدد ۶ رقمی باشد.')
  }

  const now = Date.now()
  const ip = clientIp(context.request)
  if (await isThrottled(context, ip, now)) {
    return failure(
      429,
      'OTP_THROTTLED',
      'تلاش‌های ناموفق بیش از حد مجاز. چند دقیقه بعد دوباره امتحان کنید.',
      { retryAfterSeconds: OTP_FAILURE_WINDOW_SECONDS },
    )
  }

  const db = env.DB
  const codeHash = await hashOtp(code, botToken)

  let row: OtpRow | null = null
  try {
    row = await db
      .prepare(
        'SELECT id, telegram_id, expires_at, attempts, consumed_at FROM admin_otps WHERE code = ?',
      )
      .bind(codeHash)
      .first<OtpRow>()
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'بررسی کد تایید در پایگاه‌داده انجام نشد.')
  }

  if (!row) {
    await recordFailure(context, ip, now)
    return failure(401, 'OTP_INVALID', 'کد تایید نادرست است. دوباره بررسی کنید.')
  }

  if (row.consumed_at) {
    return failure(401, 'OTP_USED', 'این کد قبلاً استفاده شده است. کد تایید جدید بگیرید.')
  }
  if ((row.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    return failure(429, 'OTP_LOCKED', 'این کد قفل شده است. کد تایید جدید بگیرید.')
  }

  const expiresAtMs = Date.parse(row.expires_at)
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
    await db
      .prepare('UPDATE admin_otps SET consumed_at = ? WHERE id = ?')
      .bind(new Date(now).toISOString(), row.id)
      .run()
      .catch(() => undefined)
    return failure(401, 'OTP_EXPIRED', 'کد تایید منقضی شده است. کد جدید بگیرید.')
  }

  const telegramId = Number(row.telegram_id)
  if (!Number.isInteger(telegramId) || telegramId <= 0) {
    return failure(401, 'OTP_INVALID', 'کد تایید نادرست است. دوباره بررسی کنید.')
  }

  if (!(await isAdminAllowed(db, env, telegramId))) {
    await db
      .prepare('UPDATE admin_otps SET consumed_at = ? WHERE id = ?')
      .bind(new Date(now).toISOString(), row.id)
      .run()
      .catch(() => undefined)
    return failure(403, 'ADMIN_FORBIDDEN', 'این حساب اجازه ورود به پنل مدیریت را ندارد.')
  }

  // Single use: the conditional update prevents two parallel verifications.
  try {
    const consumed = await db
      .prepare('UPDATE admin_otps SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL')
      .bind(new Date(now).toISOString(), row.id)
      .run()
    if (consumed.meta?.changes === 0) {
      return failure(401, 'OTP_USED', 'این کد قبلاً استفاده شده است. کد تایید جدید بگیرید.')
    }
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'مصرف کد تایید در پایگاه‌داده انجام نشد.')
  }

  try {
    await db.prepare('DELETE FROM admin_otp_failures WHERE ip = ?').bind(ip).run()
  } catch {
    // Non-fatal: the failure window expires on its own.
  }

  const session = await createAdminSessionToken(telegramId, botToken)
  const profile = await loadTelegramProfile(db, telegramId)

  return jsonResponse({
    success: true,
    message: 'ورود به پنل مدیریت تأیید شد.',
    data: {
      token: session.token,
      expiresAt: session.expiresAt,
      expiresInSeconds: ADMIN_SESSION_TTL_SECONDS,
      admin: {
        telegramId,
        firstName: profile.first_name || 'مدیر',
        lastName: profile.last_name ?? undefined,
        username: profile.username ?? undefined,
        role: 'admin' as const,
      },
    },
  })
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  try {
    return await handleVerifyOtp(context)
  } catch (cause) {
    return internalFailure(cause, 'VERIFY_OTP_FAILED')
  }
}
