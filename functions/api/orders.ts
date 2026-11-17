/**
 * Cloudflare Pages Function — GET /api/orders
 *
 * Returns the signed-in Telegram user's orders straight from D1 `orders`.
 * No fixtures are ever involved: an empty list means the user has not bought
 * anything yet.
 *
 * Bindings: DB, TELEGRAM_BOT_TOKEN and the optional PURCHASE_DEMO_TELEGRAM_ID
 * local-testing switch (same as `functions/api/purchase.ts`).
 */

import { verifyInitData, type TelegramMiniAppUser } from './_lib/telegram'

interface D1Meta {
  changes?: number
}

interface D1Result {
  success: boolean
  meta?: D1Meta
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<{ results: T[] }>
  run(): Promise<D1Result>
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement
}

interface OrdersEnv {
  DB?: D1Database
  TELEGRAM_BOT_TOKEN?: string
  PURCHASE_DEMO_TELEGRAM_ID?: string
}

interface PagesContext {
  request: Request
  env: OrdersEnv
}

type AuthResult =
  | { ok: true; user: TelegramMiniAppUser }
  | { ok: false; status: number; code: string; message: string }

interface OrderRow {
  id: string
  user_id: string
  product_id: string
  product_title: string
  kind: string
  quantity: number
  subtotal: number
  discount: number
  total: number
  currency: string
  status: string
  payment_method: string | null
  delivery_note: string | null
  created_at: string
}

const ORDER_LIMIT = 100

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

async function authenticate(request: Request, env: OrdersEnv): Promise<AuthResult> {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim()
  const initData = request.headers.get('X-Telegram-Init-Data')?.trim()

  if (initData) {
    if (!botToken) {
      return {
        ok: false,
        status: 500,
        code: 'SERVER_NOT_CONFIGURED',
        message: 'توکن ربات در تنظیمات سرور موجود نیست.',
      }
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
    message: 'برای دیدن سفارش‌ها باید مینی‌اپ را از داخل تلگرام باز کنید.',
  }
}

function userIdFor(user: TelegramMiniAppUser): string {
  return `usr_tg_${user.id}`
}

function toOrder(row: OrderRow): unknown {
  return {
    id: row.id,
    userId: row.user_id,
    items: [
      {
        productId: row.product_id,
        title: row.product_title,
        kind: row.kind === 'vpn' ? 'vpn' : 'account',
        quantity: Number(row.quantity ?? 1),
        unitPrice: Number(row.total),
      },
    ],
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    total: Number(row.total),
    currency: 'IRT',
    status: row.status,
    kind: row.kind === 'vpn' ? 'vpn' : 'account',
    paymentMethod: row.payment_method === 'card' ? 'card' : 'wallet',
    deliveryNote: row.delivery_note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  }
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const auth = await authenticate(context.request, context.env)
  if (!auth.ok) return failure(auth.status, auth.code, auth.message)

  const db = context.env.DB
  if (!db) return failure(503, 'DB_NOT_CONFIGURED', 'پایگاه داده سفارش‌ها در سرور تنظیم نشده است.')

  let rows: OrderRow[]
  try {
    const result = await db
      .prepare(
        `SELECT id, user_id, product_id, product_title, kind, quantity, subtotal, discount,
                total, currency, status, payment_method, delivery_note, created_at
         FROM orders
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(userIdFor(auth.user), ORDER_LIMIT)
      .all<OrderRow>()
    rows = result.results ?? []
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'خواندن سفارش‌ها از پایگاه داده انجام نشد.')
  }

  return jsonResponse({
    success: true,
    data: rows.map(toOrder),
    meta: { count: rows.length, limit: ORDER_LIMIT },
  })
}
