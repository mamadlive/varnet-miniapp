/**
 * Shared primitives for the Telegram-OTP admin login Functions.
 *
 * Codes are stored as HMAC digests keyed by the bot token, never in plaintext.
 * Files starting with `_` are not routed by Cloudflare Pages.
 */

import { hmacSha256 } from '../../_lib/telegram'
import type { D1Database } from '../_shared'

export const OTP_TTL_SECONDS = 5 * 60
export const OTP_COOLDOWN_SECONDS = 45
export const OTP_MAX_ATTEMPTS = 8
export const OTP_FAILURE_WINDOW_SECONDS = 10 * 60

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Normalise user input; only exactly six ASCII digits are valid. */
export function normalizeOtp(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const digits = input.replace(/[\s-]/g, '')
  return /^\d{6}$/.test(digits) ? digits : null
}

/** 6-digit code from a CSPRNG, zero-padded. */
export function generateOtp(): string {
  const random = new Uint32Array(1)
  crypto.getRandomValues(random)
  return String(random[0]! % 1_000_000).padStart(6, '0')
}

export async function hashOtp(code: string, botToken: string): Promise<string> {
  const key = new TextEncoder().encode(`varnet-admin-otp:${botToken}`)
  return toHex(await hmacSha256(key, code))
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP')?.trim() ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

interface TelegramApiResponse {
  ok?: boolean
  description?: string
  error_code?: number
}

/** Carries the Bot API's own `description`/`error_code` to the HTTP response. */
export class TelegramSendError extends Error {
  readonly description: string
  readonly errorCode: number | null

  constructor(description: string, errorCode: number | null = null) {
    super(description)
    this.name = 'TelegramSendError'
    this.description = description
    this.errorCode = errorCode
  }
}

/**
 * Send a plain-text message through the Bot API. Throws with the provider's
 * description on failure — callers must surface it, never swallow it.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  })

  let payload: TelegramApiResponse | null = null
  try {
    payload = (await response.json()) as TelegramApiResponse
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new TelegramSendError(
      payload?.description?.trim() || `Telegram HTTP ${response.status}`,
      payload?.error_code ?? response.status,
    )
  }

  if (payload?.ok !== true) {
    throw new TelegramSendError(
      payload?.description?.trim() || 'پاسخ تلگرام تأیید ارسال پیام را نداشت.',
      payload?.error_code ?? null,
    )
  }
}

export function otpMessage(code: string): string {
  return [
    'کد ورود به پنل مدیریت ورنت:',
    code,
    '',
    'این کد تا ۵ دقیقه معتبر است و فقط یک بار قابل استفاده است.',
    'اگر شما درخواست نداده‌اید، این پیام را نادیده بگیرید.',
  ].join('\n')
}

/** Drop rows that can no longer be used, keeping the table small. */
export async function cleanupOtps(db: D1Database, now: number): Promise<void> {
  const cutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  try {
    await db.prepare('DELETE FROM admin_otps WHERE created_at < ?').bind(cutoff).run()
  } catch {
    // Cleanup is best-effort; inserts and verification still work.
  }
}
