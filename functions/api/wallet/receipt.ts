/**
 * Cloudflare Pages Function — POST /api/wallet/receipt
 *
 * Registers a card-to-card wallet top-up claim with status PENDING. The wallet
 * is only credited after an admin approves the receipt from the panel.
 *
 * Body: { amount: integer Toman, reference: string }
 */

import { verifyInitData, type TelegramMiniAppUser } from '../_lib/telegram'
import { notifyAdmins } from '../_lib/notifications'

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  run(): Promise<{ success: boolean }>
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<{ results: T[] }>
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement
}

interface ReceiptEnv {
  DB?: D1Database
  TELEGRAM_BOT_TOKEN?: string
  PURCHASE_DEMO_TELEGRAM_ID?: string
  ADMIN_TELEGRAM_IDS?: string
}

interface PagesContext {
  request: Request
  env: ReceiptEnv
}

type AuthResult =
  | { ok: true; user: TelegramMiniAppUser }
  | { ok: false; status: number; code: string; message: string }

const MIN_AMOUNT = 10_000
const MAX_AMOUNT = 10_000_000
const MAX_BODY_BYTES = 4_096

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

async function authenticate(request: Request, env: ReceiptEnv): Promise<AuthResult> {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim()
  const initData = request.headers.get('X-Telegram-Init-Data')?.trim()

  if (initData) {
    if (!botToken) {
      return { ok: false, status: 500, code: 'SERVER_NOT_CONFIGURED', message: 'توکن ربات در تنظیمات سرور موجود نیست.' }
    }
    const user = await verifyInitData(initData, botToken)
    if (!user) {
      return {
        ok: false,
        status: 401,
        code: 'TELEGRAM_AUTH_INVALID',
        message: 'نشست تلگرام معتبر نیست. مینی‌اپ را دوباره باز کنید.',
      }
    }
    return { ok: true, user }
  }

  const demoTelegramId = Number(env.PURCHASE_DEMO_TELEGRAM_ID)
  if (Number.isInteger(demoTelegramId) && demoTelegramId > 0) {
    return { ok: true, user: { id: demoTelegramId, first_name: 'کاربر آزمایشی' } }
  }

  return {
    ok: false,
    status: 401,
    code: 'TELEGRAM_AUTH_REQUIRED',
    message: 'برای ثبت فیش واریز باید مینی‌اپ را از داخل تلگرام باز کنید.',
  }
}

function userIdFor(user: TelegramMiniAppUser): string {
  return `usr_tg_${user.id}`
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  try {
    const auth = await authenticate(context.request, context.env)
    if (!auth.ok) return failure(auth.status, auth.code, auth.message)

    const db = context.env.DB
    if (!db) return failure(503, 'DB_NOT_CONFIGURED', 'پایگاه داده کیف پول در سرور تنظیم نشده است.')

    let raw: string
    try {
      raw = await context.request.text()
    } catch {
      return failure(400, 'INVALID_BODY', 'بدنه درخواست قابل خواندن نبود.')
    }
    if (raw.length > MAX_BODY_BYTES) return failure(413, 'INVALID_BODY', 'درخواست بیش از حد بزرگ است.')

    let body: { amount?: unknown; reference?: unknown }
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return failure(400, 'INVALID_BODY', 'ساختار درخواست نامعتبر است.')
      }
      body = parsed as { amount?: unknown; reference?: unknown }
    } catch {
      return failure(400, 'INVALID_BODY', 'ساختار درخواست نامعتبر است.')
    }

    const amount = typeof body.amount === 'number' ? body.amount : Number.NaN
    if (!Number.isInteger(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      return failure(400, 'INVALID_AMOUNT', 'مبلغ واریز خارج از محدوده مجاز است.')
    }

    const reference = typeof body.reference === 'string' ? body.reference.trim() : ''
    if (reference.length < 4 || reference.length > 64) {
      return failure(400, 'INVALID_REFERENCE', 'شماره پیگیری واریز را کامل وارد کنید.')
    }

    const userId = userIdFor(auth.user)
    const now = new Date().toISOString()
    const receiptId = `rcp_${crypto.randomUUID()}`

    try {
      await db
        .prepare(
          `INSERT INTO payment_receipts
             (id, user_id, telegram_id, purpose, order_id, amount, currency, reference, status, created_at)
           VALUES (?, ?, ?, 'wallet_topup', NULL, ?, 'IRT', ?, 'PENDING', ?)`,
        )
        .bind(receiptId, userId, auth.user.id, amount, reference, now)
        .run()
    } catch {
      return failure(503, 'DB_UNAVAILABLE', 'ثبت فیش واریز انجام نشد. دوباره تلاش کنید.')
    }

    const notification = await notifyAdmins(
      context.env,
      `فیش شارژ کیف پول ثبت شد.\nشناسه فیش: ${receiptId}\nکاربر: ${[auth.user.first_name, auth.user.last_name].filter(Boolean).join(' ') || auth.user.username || auth.user.id}\nشناسه تلگرام: ${auth.user.id}\nمبلغ: ${amount.toLocaleString('en-US')} تومان\nروش پرداخت: کارت به کارت\nشماره پیگیری: ${reference}`,
    )
    return jsonResponse({
      success: true,
      message: 'فیش واریز ثبت شد و پس از تایید ادمین به موجودی شما اضافه می‌شود.',
      data: { receiptId, amount, status: 'PENDING', createdAt: now, notification },
    })
  } catch (cause) {
    return jsonResponse(
      {
        success: false,
        code: 'RECEIPT_FAILED',
        message: cause instanceof Error && cause.message ? cause.message : 'ثبت فیش واریز انجام نشد.',
      },
      500,
    )
  }
}
