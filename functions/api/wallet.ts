/**
 * Cloudflare Pages Function — GET /api/wallet
 *
 * Returns the signed-in Telegram user's wallet so the Mini App shows the real
 * balance instead of a fixture: balance, lifetime spend and the latest wallet
 * transactions, all read from the D1 `purchase cycle` schema.
 *
 * Bindings: same as `functions/api/purchase.ts` (DB, TELEGRAM_BOT_TOKEN and the
 * optional PURCHASE_DEMO_TELEGRAM_ID local-testing switch).
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
  all<T = unknown>(): Promise<{ results: T[] }>
  run(): Promise<D1Result>
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement
}

interface WalletEnv {
  DB?: D1Database
  TELEGRAM_BOT_TOKEN?: string
  PURCHASE_DEMO_TELEGRAM_ID?: string
}

interface PagesContext {
  request: Request
  env: WalletEnv
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

interface TransactionRow {
  id: string
  type: string
  amount: number
  currency: string
  description: string
  reference: string | null
  created_at: string
}

const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60
const TRANSACTION_LIMIT = 20

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

async function authenticate(request: Request, env: WalletEnv): Promise<AuthResult> {
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
    message: 'برای دیدن کیف پول باید مینی‌اپ را از داخل تلگرام باز کنید.',
  }
}

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

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const auth = await authenticate(context.request, context.env)
  if (!auth.ok) return failure(auth.status, auth.code, auth.message)

  const db = context.env.DB
  if (!db) return failure(503, 'DB_NOT_CONFIGURED', 'پایگاه داده کیف پول در سرور تنظیم نشده است.')

  const now = new Date().toISOString()
  const userId = userIdFor(auth.user)

  try {
    await ensureUser(db, auth.user, now)
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'ارتباط با پایگاه داده برقرار نشد. دوباره تلاش کنید.')
  }

  let balance: number
  let lifetimeSpent: number
  let rows: TransactionRow[]
  try {
    const user = await db
      .prepare('SELECT balance FROM users WHERE id = ?')
      .bind(userId)
      .first<{ balance: number }>()
    if (!user) return failure(500, 'USER_NOT_FOUND', 'حساب کیف پول پیدا نشد. دوباره تلاش کنید.')
    balance = Number(user.balance)

    const spent = await db
      .prepare(
        `SELECT COALESCE(SUM(-amount), 0) AS spent FROM wallet_transactions
         WHERE user_id = ? AND type = 'purchase'`,
      )
      .bind(userId)
      .first<{ spent: number }>()
    lifetimeSpent = Number(spent?.spent ?? 0)

    const result = await db
      .prepare(
        `SELECT id, type, amount, currency, description, reference, created_at
         FROM wallet_transactions
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(userId, TRANSACTION_LIMIT)
      .all<TransactionRow>()
    rows = result.results ?? []
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'خواندن کیف پول انجام نشد. دوباره تلاش کنید.')
  }

  return jsonResponse({
    success: true,
    data: {
      balance,
      currency: 'IRT',
      pending: 0,
      lifetimeSpent,
      transactions: rows.map((row) => ({
        id: row.id,
        type: row.type,
        amount: Number(row.amount),
        currency: 'IRT',
        status: 'completed',
        description: row.description,
        createdAt: row.created_at,
        reference: row.reference ?? undefined,
      })),
    },
  })
}
