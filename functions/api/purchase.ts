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
 * Prices are integer Toman. The catalogue and its admin margins live in the
 * Mini App today, so the server records the submitted amounts but validates
 * their consistency (`subtotal - discount === total`) and sane bounds.
 */

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
  run(): Promise<D1Result>
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>
}

interface PurchaseEnv {
  DB?: D1Database
  TELEGRAM_BOT_TOKEN?: string
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

/* -------------------------------------------------------------------------- */
/* Body validation                                                            */
/* -------------------------------------------------------------------------- */

interface ValidatedPurchase {
  productId: string
  title: string
  kind: 'account' | 'vpn'
  subtotal: number
  discount: number
  total: number
  couponCode?: string
  paymentMethod: 'wallet' | 'card'
  receiptReference?: string
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

function validateBody(body: PurchaseBody): { ok: true; value: ValidatedPurchase } | { ok: false; message: string } {
  const productId = readString(body.productId, 128)
  const title = readString(body.title, 200)
  if (!productId || !title) return { ok: false, message: 'شناسه یا عنوان محصول نامعتبر است.' }

  const kind = body.kind === 'vpn' ? 'vpn' : 'account'
  const subtotal = readInteger(body.subtotal)
  const discount = readInteger(body.discount ?? 0)
  const total = readInteger(body.total)

  if (subtotal === null || discount === null || total === null) {
    return { ok: false, message: 'مبلغ سفارش نامعتبر است.' }
  }
  if (subtotal < 0 || subtotal > MAX_AMOUNT_TOMAN) {
    return { ok: false, message: 'مبلغ محصول خارج از محدوده مجاز است.' }
  }
  if (discount < 0 || discount > subtotal) {
    return { ok: false, message: 'مبلغ تخفیف نامعتبر است.' }
  }
  if (total <= 0 || total !== subtotal - discount) {
    return { ok: false, message: 'مبلغ قابل پرداخت با جمع سفارش هم‌خوانی ندارد.' }
  }
  if (body.currency !== undefined && body.currency !== 'IRT') {
    return { ok: false, message: 'واحد پول سفارش پشتیبانی نمی‌شود.' }
  }

  let couponCode: string | undefined
  if (body.couponCode !== undefined) {
    const parsedCoupon = readString(body.couponCode, 64)
    if (!parsedCoupon) return { ok: false, message: 'کد تخفیف نامعتبر است.' }
    couponCode = parsedCoupon
  }

  const paymentMethod = body.paymentMethod === 'card' ? 'card' : 'wallet'
  let receiptReference: string | undefined
  if (paymentMethod === 'card') {
    const reference = readString(body.receiptReference, 64)
    if (!reference || reference.length < 4) {
      return { ok: false, message: 'شماره پیگیری واریز را کامل وارد کنید.' }
    }
    receiptReference = reference
  }

  return {
    ok: true,
    value: { productId, title, kind, subtotal, discount, total, couponCode, paymentMethod, receiptReference },
  }
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

  const validated = validateBody(body)
  if (!validated.ok) return failure(400, 'PURCHASE_VALIDATION', validated.message)
  const {
    productId,
    title,
    kind,
    subtotal,
    discount,
    total,
    couponCode,
    paymentMethod,
    receiptReference,
  } = validated.value

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

  if (paymentMethod === 'card') {
    // Card-to-card: nothing is debited yet. The order waits as `pending`
    // until an admin approves the matching `payment_receipts` row.
    const orderId = `ord_${crypto.randomUUID()}`
    const receiptId = `rcp_${crypto.randomUUID()}`

    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO orders
               (id, user_id, product_id, product_title, kind, quantity, subtotal, discount, total, currency, coupon_code, status, payment_method, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 'IRT', ?, 'pending', 'card', ?, ?)`,
          )
          .bind(
            orderId,
            userId,
            productId,
            title,
            kind,
            subtotal,
            discount,
            total,
            couponCode ?? null,
            now,
            now,
          ),
        db
          .prepare(
            `INSERT INTO payment_receipts
               (id, user_id, telegram_id, purpose, order_id, amount, currency, reference, status, created_at)
             VALUES (?, ?, ?, 'product_purchase', ?, ?, 'IRT', ?, 'PENDING', ?)`,
          )
          .bind(receiptId, userId, auth.user.id, orderId, total, receiptReference ?? '', now),
      ])
    } catch {
      return failure(500, 'ORDER_WRITE_FAILED', 'ثبت سفارش کارت به کارت انجام نشد. دوباره تلاش کنید.')
    }

    return jsonResponse({
      success: true,
      message: 'سفارش ثبت شد و پس از تایید فیش واریز توسط ادمین تکمیل می‌شود.',
      data: {
        order: {
          id: orderId,
          status: 'pending',
          kind,
          productId,
          title,
          subtotal,
          discount,
          total,
          currency: 'IRT',
          paymentMethod: 'card',
          createdAt: now,
        },
        balance,
        receipt: { id: receiptId, status: 'PENDING' },
      },
    })
  }

  if (balance < total) {
    return failure(402, 'INSUFFICIENT_FUNDS', 'موجودی کیف پول برای این خرید کافی نیست.', {
      balance,
      required: total,
    })
  }

  let debitChanges = 0
  try {
    const debit = await db
      .prepare('UPDATE users SET balance = balance - ?, updated_at = ? WHERE id = ? AND balance >= ?')
      .bind(total, now, userId, total)
      .run()
    debitChanges = debit.meta?.changes ?? 0
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'ثبت پرداخت انجام نشد. دوباره تلاش کنید.')
  }

  if (debitChanges !== 1) {
    // The guarded update lost a race (another purchase drained the wallet).
    const latest = await readBalance(db, userId)
    return failure(402, 'INSUFFICIENT_FUNDS', 'موجودی کیف پول برای این خرید کافی نیست.', {
      balance: latest ?? 0,
      required: total,
    })
  }

  const remainingBalance = balance - total
  const orderId = `ord_${crypto.randomUUID()}`
  const transactionId = `txn_${crypto.randomUUID()}`

  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO orders
             (id, user_id, product_id, product_title, kind, quantity, subtotal, discount, total, currency, coupon_code, status, payment_method, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 'IRT', ?, 'paid', 'wallet', ?, ?)`,
        )
        .bind(
          orderId,
          userId,
          productId,
          title,
          kind,
          subtotal,
          discount,
          total,
          couponCode ?? null,
          now,
          now,
        ),
      db
        .prepare(
          `INSERT INTO wallet_transactions
             (id, user_id, type, amount, balance_after, currency, description, reference, created_at)
           VALUES (?, ?, 'purchase', ?, ?, 'IRT', ?, ?, ?)`,
        )
        .bind(
          transactionId,
          userId,
          -total,
          remainingBalance,
          `خرید ${title}`,
          orderId,
          now,
        ),
    ])
  } catch {
    // The batch is atomic, so the order did not persist: return the money.
    try {
      await db
        .prepare('UPDATE users SET balance = balance + ?, updated_at = ? WHERE id = ?')
        .bind(total, new Date().toISOString(), userId)
        .run()
    } catch {
      // A failed refund must not mask the original write failure.
    }
    return failure(500, 'ORDER_WRITE_FAILED', 'ثبت سفارش انجام نشد؛ مبلغ به کیف پول بازگردانده شد.')
  }

  return jsonResponse({
    success: true,
    data: {
      order: {
        id: orderId,
        status: 'paid',
        kind,
        productId,
        title,
        subtotal,
        discount,
        total,
        currency: 'IRT',
        createdAt: now,
      },
      balance: remainingBalance,
    },
  })
}
