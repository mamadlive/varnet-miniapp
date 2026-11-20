/**
 * Cloudflare Pages Function — POST /api/purchase
 *
 * Completes the wallet purchase cycle:
 *   1. authenticate the Telegram Mini App user (signed `initData`),
 *   2. upsert the user row and read the wallet balance from D1,
 *   3. reject with 402 when the balance cannot cover the payable amount,
 *   4. debit the wallet, insert the order and a wallet transaction,
 *   5. return the order receipt plus the remaining balance.
 *
 * Bindings:
 *   DB                        D1 database (wrangler.toml `[[d1_databases]]`), required
 *   TELEGRAM_BOT_TOKEN        secret used to verify initData, required in production
 *   PURCHASE_DEMO_TELEGRAM_ID optional: numeric Telegram id accepted when no
 *                             initData header is present. Intended for local
 *                             `wrangler pages dev` testing only — leave unset
 *                             in production.
 *
 * Prices are integer Toman and authoritative on the server: account products
 * are repriced from D1 (`sync_meta` rate + `settings.margin_tiers`) and VPN
 * plans use `static_ip_plans.price`. The coupon is evaluated against that
 * server subtotal, so a tampered client amount cannot lower the charge — a
 * mismatch is answered with `PRICE_CHANGED` plus the real totals.
 */

import { evaluateDiscount, findDiscountCode } from './_lib/discounts'
import { notifyPurchaseAdmins } from './_lib/notifications'
import { accountSubtotal, loadPricingContext } from './_lib/pricing'

interface D1Meta {
  changes?: number
}

interface D1Result {
  success: boolean
  meta?: D1Meta
  results?: Array<{ balance: number }>
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<{ results: T[] }>
  run(): Promise<D1Result>
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>
}

interface PurchaseEnv {
  DB?: D1Database
  TELEGRAM_BOT_TOKEN?: string
  ADMIN_TELEGRAM_IDS?: string
  PURCHASE_DEMO_TELEGRAM_ID?: string
}

interface PagesContext {
  request: Request
  env: PurchaseEnv
}

interface TelegramMiniAppUser {
  id: number
  username?: string
  first_name?: string
  last_name?: string
}

type AuthResult =
  | { ok: true; user: TelegramMiniAppUser }
  | { ok: false; status: number; code: string; message: string }

interface PurchaseBody {
  action?: unknown
  productId?: unknown
  title?: unknown
  kind?: unknown
  subtotal?: unknown
  discount?: unknown
  total?: unknown
  currency?: unknown
  couponCode?: unknown
  paymentMethod?: unknown
  receiptReference?: unknown
}

const MAX_BODY_BYTES = 8_192
const MAX_AMOUNT_TOMAN = 100_000_000
const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60

const RESPONSE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS })
}

function failure(status: number, code: string, message: string, data?: unknown): Response {
  return jsonResponse({ success: false, code, message, data }, status)
}

/* -------------------------------------------------------------------------- */
/* Telegram initData validation (HMAC-SHA256, Bot API spec)                   */
/* -------------------------------------------------------------------------- */

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function hmacSha256(keyBytes: BufferSource, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
}

/** Verify `initData` and return the embedded user, or `null` when tampered. */
async function verifyInitData(initData: string, botToken: string): Promise<TelegramMiniAppUser | null> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secretKey = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken)
  const signature = toHex(await hmacSha256(secretKey, dataCheckString))
  if (!timingSafeEqual(signature, hash.toLowerCase())) return null

  const authDate = Number(params.get('auth_date'))
  if (!Number.isFinite(authDate) || authDate <= 0) return null
  if (Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_SECONDS) return null

  const rawUser = params.get('user')
  if (!rawUser) return null

  try {
    const parsed = JSON.parse(rawUser) as {
      id?: unknown
      username?: unknown
      first_name?: unknown
      last_name?: unknown
    }
    const id = Number(parsed.id)
    if (!Number.isInteger(id) || id <= 0) return null
    return {
      id,
      username: typeof parsed.username === 'string' ? parsed.username : undefined,
      first_name: typeof parsed.first_name === 'string' ? parsed.first_name : undefined,
      last_name: typeof parsed.last_name === 'string' ? parsed.last_name : undefined,
    }
  } catch {
    return null
  }
}

async function authenticate(request: Request, env: PurchaseEnv): Promise<AuthResult> {
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
    message: 'برای خرید باید مینی‌اپ را از داخل تلگرام باز کنید.',
  }
}

/* -------------------------------------------------------------------------- */
/* D1 helpers                                                                 */
/* -------------------------------------------------------------------------- */

function userIdFor(user: TelegramMiniAppUser): string {
  return `usr_tg_${user.id}`
}

async function ensureUser(db: D1Database, user: TelegramMiniAppUser, now: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (id, telegram_id, username, first_name, last_name, balance, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 'IRT', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         username = excluded.username,
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         updated_at = excluded.updated_at`,
    )
    .bind(
      userIdFor(user),
      user.id,
      user.username ?? null,
      user.first_name ?? null,
      user.last_name ?? null,
      now,
      now,
    )
    .run()
}

async function readBalance(db: D1Database, userId: string): Promise<number | null> {
  const row = await db
    .prepare('SELECT balance FROM users WHERE id = ?')
    .bind(userId)
    .first<{ balance: number }>()
  return row ? Number(row.balance) : null
}

const COUPON_GUARD = `(? IS NULL OR EXISTS (
  SELECT 1 FROM discount_codes c
  WHERE c.code = ? COLLATE NOCASE AND c.is_active = 1
    AND (c.expires_at IS NULL OR julianday(c.expires_at) > julianday('now'))
    AND (c.usage_limit IS NULL OR c.used_count < c.usage_limit)
    AND ? >= COALESCE(c.min_subtotal, 0)
    AND ? = MIN(?, MAX(0, CAST(ROUND(MIN(
      CASE WHEN c.type = 'percent' THEN ? * c.value / 100.0 ELSE MIN(c.value, ?) END,
      COALESCE(c.max_discount, ?)
    ) / 1000.0) * 1000 AS INTEGER)))
))`

function couponGuardValues(code: string | undefined, subtotal: number, discount: number): unknown[] {
  return [code ?? null, code ?? null, subtotal, discount, subtotal, subtotal, subtotal, subtotal]
}

/* -------------------------------------------------------------------------- */
/* Body validation                                                            */
/* -------------------------------------------------------------------------- */

interface ParsedPurchase {
  quote: boolean
  productId: string
  kind: 'account' | 'vpn'
  couponCode?: string
  paymentMethod: 'wallet' | 'card'
  receiptReference?: string
  /** Amounts claimed by the client; used only to detect a stale price. */
  claimed: { subtotal: number; discount: number; total: number } | null
}

interface ResolvedOffer {
  title: string
  subtotal: number
}

type ResolveResult =
  | { ok: true; offer: ResolvedOffer }
  | { ok: false; status: number; code: string; message: string }

interface VpnPlanRow {
  name: string
  price: number
  is_enabled: number
  node_enabled: number
  availability: string
}

interface AccountRow {
  title: string
  price: number
  provider_price: number | null
  provider_currency: string | null
}

function readString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return null
  return trimmed
}

function readInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function parsePurchase(body: PurchaseBody): { ok: true; value: ParsedPurchase } | { ok: false; message: string } {
  const productId = readString(body.productId, 128)
  if (!productId) return { ok: false, message: 'شناسه محصول نامعتبر است.' }

  if (body.action !== undefined && body.action !== 'quote') return { ok: false, message: 'عملیات خرید نامعتبر است.' }
  const quote = body.action === 'quote'
  const kind = body.kind === 'vpn' ? 'vpn' : 'account'
  if (body.currency !== undefined && body.currency !== 'IRT') {
    return { ok: false, message: 'واحد پول سفارش پشتیبانی نمی‌شود.' }
  }

  let couponCode: string | undefined
  if (body.couponCode !== undefined && body.couponCode !== null && body.couponCode !== '') {
    const parsedCoupon = readString(body.couponCode, 64)
    if (!parsedCoupon || !/^[A-Za-z0-9_-]{3,24}$/.test(parsedCoupon)) {
      return { ok: false, message: 'کد تخفیف نامعتبر است.' }
    }
    couponCode = parsedCoupon.toUpperCase()
  }

  const paymentMethod = body.paymentMethod === 'card' ? 'card' : 'wallet'
  let receiptReference: string | undefined
  if (paymentMethod === 'card' && !quote) {
    const reference = readString(body.receiptReference, 64)
    if (!reference || reference.length < 4) {
      return { ok: false, message: 'شماره پیگیری واریز را کامل وارد کنید.' }
    }
    receiptReference = reference
  }

  const subtotal = readInteger(body.subtotal)
  const discount = readInteger(body.discount ?? 0)
  const total = readInteger(body.total)
  const claimed =
    subtotal !== null && discount !== null && total !== null
      ? { subtotal, discount, total }
      : null

  return {
    ok: true,
    value: { quote, productId, kind, couponCode, paymentMethod, receiptReference, claimed },
  }
}

const UNAVAILABLE: ResolveResult = {
  ok: false,
  status: 409,
  code: 'PRODUCT_UNAVAILABLE',
  message: 'این محصول در حال حاضر قابل خرید نیست.',
}

/** Authoritative price for the purchased offer, read from D1. */
async function resolveOffer(
  db: D1Database,
  productId: string,
  kind: 'account' | 'vpn',
): Promise<ResolveResult> {
  if (kind === 'vpn') {
    const plan = await db
      .prepare(
        `SELECT p.name, p.price, p.is_enabled, n.is_enabled AS node_enabled, n.availability
         FROM static_ip_plans p
         JOIN static_ip_nodes n ON n.id = p.node_id
         WHERE p.id = ?`,
      )
      .bind(productId)
      .first<VpnPlanRow>()
    if (!plan) {
      return { ok: false, status: 404, code: 'PRODUCT_NOT_FOUND', message: 'پلن آی‌پی ثابت پیدا نشد.' }
    }
    if (
      Number(plan.is_enabled) !== 1 ||
      Number(plan.node_enabled) !== 1 ||
      plan.availability !== 'in_stock'
    ) {
      return UNAVAILABLE
    }
    const subtotal = Number(plan.price)
    if (!Number.isSafeInteger(subtotal) || subtotal <= 0 || subtotal > MAX_AMOUNT_TOMAN) {
      return UNAVAILABLE
    }
    return { ok: true, offer: { title: plan.name, subtotal } }
  }

  const row = await db
    .prepare(
      `SELECT products.title, products.price, products.provider_price, products.provider_currency
       FROM products
       LEFT JOIN product_overrides ON product_overrides.product_id = products.id
       WHERE products.id = ? AND COALESCE(product_overrides.is_deleted, 0) = 0`,
    )
    .bind(productId)
    .first<AccountRow>()
  if (!row) {
    return { ok: false, status: 404, code: 'PRODUCT_NOT_FOUND', message: 'محصول پیدا نشد.' }
  }

  const subtotal = accountSubtotal(row, await loadPricingContext(db))
  if (!Number.isSafeInteger(subtotal) || subtotal <= 0 || subtotal > MAX_AMOUNT_TOMAN) {
    return UNAVAILABLE
  }
  return { ok: true, offer: { title: row.title, subtotal } }
}

/* -------------------------------------------------------------------------- */
/* Handler                                                                    */
/* -------------------------------------------------------------------------- */

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { env } = context

  const auth = await authenticate(context.request, env)
  if (!auth.ok) return failure(auth.status, auth.code, auth.message)

  const db = env.DB
  if (!db) {
    return failure(503, 'DB_NOT_CONFIGURED', 'پایگاه داده سفارش‌ها در سرور تنظیم نشده است.')
  }

  let rawBody: string
  try {
    rawBody = await context.request.text()
  } catch {
    return failure(400, 'PURCHASE_BAD_REQUEST', 'بدنه درخواست قابل خواندن نبود.')
  }
  if (rawBody.length > MAX_BODY_BYTES) {
    return failure(413, 'PURCHASE_BAD_REQUEST', 'درخواست خرید بیش از حد بزرگ است.')
  }

  let body: PurchaseBody
  try {
    const parsed: unknown = JSON.parse(rawBody)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return failure(400, 'PURCHASE_BAD_REQUEST', 'ساختار درخواست خرید نامعتبر است.')
    }
    body = parsed as PurchaseBody
  } catch {
    return failure(400, 'PURCHASE_BAD_REQUEST', 'ساختار درخواست خرید نامعتبر است.')
  }

  const parsed = parsePurchase(body)
  if (!parsed.ok) return failure(400, 'PURCHASE_VALIDATION', parsed.message)
  const { quote, productId, kind, couponCode, paymentMethod, receiptReference, claimed } = parsed.value

  let resolved: ResolveResult
  try {
    resolved = await resolveOffer(db, productId, kind)
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'خواندن قیمت محصول از پایگاه داده انجام نشد. دوباره تلاش کنید.')
  }
  if (!resolved.ok) return failure(resolved.status, resolved.code, resolved.message)
  const { title, subtotal } = resolved.offer

  let discount = 0
  if (couponCode) {
    let evaluated: ReturnType<typeof evaluateDiscount>
    try {
      evaluated = evaluateDiscount(await findDiscountCode(db, couponCode), subtotal)
    } catch {
      return failure(503, 'DB_UNAVAILABLE', 'بررسی کد تخفیف انجام نشد. دوباره تلاش کنید.')
    }
    if (!evaluated.ok) {
      return failure(evaluated.status, evaluated.code, evaluated.message, { subtotal, currency: 'IRT' })
    }
    discount = evaluated.discount
  }
  const total = subtotal - discount
  if (quote) return jsonResponse({ success: true, data: { title, subtotal, discount, total, currency: 'IRT' } })

  if (
    claimed &&
    (claimed.subtotal !== subtotal || claimed.discount !== discount || claimed.total !== total)
  ) {
    return failure(
      409,
      'PRICE_CHANGED',
      'قیمت یا تخفیف این سفارش به‌روز شده است؛ مبلغ جدید را بررسی و دوباره تایید کنید.',
      { title, subtotal, discount, total, currency: 'IRT' },
    )
  }
  if (paymentMethod === 'card' && total === 0) {
    return failure(400, 'PURCHASE_VALIDATION', 'برای سفارش رایگان، روش کیف پول را انتخاب کنید.')
  }

  const now = new Date().toISOString()
  const userId = userIdFor(auth.user)

  try {
    await ensureUser(db, auth.user, now)
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'ارتباط با پایگاه داده برقرار نشد. دوباره تلاش کنید.')
  }

  const balance = await readBalance(db, userId)
  if (balance === null) {
    return failure(500, 'USER_NOT_FOUND', 'حساب کیف پول پیدا نشد. دوباره تلاش کنید.')
  }

  const orderId = `ord_${crypto.randomUUID()}`
  const receiptId = `rcp_${crypto.randomUUID()}`
  const orderStatus = paymentMethod === 'card' ? 'pending' : 'paid'
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO orders
         (id, user_id, product_id, product_title, kind, quantity, subtotal, discount, total, currency, coupon_code, status, payment_method, created_at)
       SELECT ?, ?, ?, ?, ?, 1, ?, ?, ?, 'IRT', ?, ?, ?, ?
       WHERE (? = 'card' OR EXISTS (SELECT 1 FROM users WHERE id = ? AND balance >= ?))
         AND ${COUPON_GUARD}`,
    ).bind(
      orderId, userId, productId, title, kind, subtotal, discount, total, couponCode ?? null,
      orderStatus, paymentMethod, now, paymentMethod, userId, total,
      ...couponGuardValues(couponCode, subtotal, discount),
    ),
  ]

  if (paymentMethod === 'wallet') {
    statements.push(
      db.prepare(
        `UPDATE users SET balance = balance - ?, updated_at = ?
         WHERE id = ? AND EXISTS (SELECT 1 FROM orders WHERE id = ?)`,
      ).bind(total, now, userId, orderId),
      db.prepare(
        `INSERT INTO wallet_transactions
           (id, user_id, type, amount, balance_after, currency, description, reference, created_at)
         SELECT ?, id, 'purchase', ?, balance, 'IRT', ?, ?, ? FROM users
         WHERE id = ? AND EXISTS (SELECT 1 FROM orders WHERE id = ?)`,
      ).bind(`txn_${crypto.randomUUID()}`, -total, `خرید ${title}`, orderId, now, userId, orderId),
    )
  } else {
    statements.push(
      db.prepare(
        `INSERT INTO payment_receipts
           (id, user_id, telegram_id, purpose, order_id, amount, currency, reference, status, created_at)
         SELECT ?, ?, ?, 'product_purchase', ?, ?, 'IRT', ?, 'PENDING', ?
         WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?)`,
      ).bind(receiptId, userId, auth.user.id, orderId, total, receiptReference ?? '', now, orderId),
    )
  }

  if (couponCode) {
    statements.push(
      db.prepare(
        `UPDATE discount_codes SET used_count = used_count + 1
         WHERE code = ? COLLATE NOCASE AND EXISTS (SELECT 1 FROM orders WHERE id = ?)`,
      ).bind(couponCode, orderId),
    )
  }

  statements.push(db.prepare('SELECT balance FROM users WHERE id = ?').bind(userId))

  let results: D1Result[]
  try {
    results = await db.batch(statements)
  } catch {
    return failure(500, 'ORDER_WRITE_FAILED', 'ثبت سفارش انجام نشد. دوباره تلاش کنید.')
  }
  const latest = results[results.length - 1]?.results?.[0]?.balance ?? balance

  if ((results[0]?.meta?.changes ?? 0) !== 1) {
    if (paymentMethod === 'wallet' && (latest ?? 0) < total) {
      return failure(402, 'INSUFFICIENT_FUNDS', 'موجودی کیف پول برای این خرید کافی نیست.', {
        balance: latest ?? 0,
        required: total,
      })
    }
    return failure(409, 'COUPON_INVALID', 'کد تخفیف معتبر نیست یا شرایط آن تغییر کرده است؛ دوباره بررسی کنید.')
  }

  const remainingBalance = Number(latest)
  const userName = [auth.user.first_name, auth.user.last_name].filter(Boolean).join(' ') || auth.user.username || String(auth.user.id)
  const notification = await notifyPurchaseAdmins(env, { orderId, userId, userName, productTitle: title, total, paymentMethod })
  return jsonResponse({
    success: true,
    ...(paymentMethod === 'card' ? { message: 'سفارش ثبت شد و پس از تایید فیش واریز توسط ادمین تکمیل می‌شود.' } : {}),
    data: {
      order: {
        id: orderId,
        status: orderStatus,
        kind,
        productId,
        title,
        subtotal,
        discount,
        total,
        currency: 'IRT',
        paymentMethod,
        createdAt: now,
      },
      balance: remainingBalance,
      notification,
      ...(paymentMethod === 'card' ? { receipt: { id: receiptId, status: 'PENDING' } } : {}),
    },
  })
}
