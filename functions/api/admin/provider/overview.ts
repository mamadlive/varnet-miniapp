/**
 * Cloudflare Pages Function — GET /api/admin/provider/overview
 *
 * Admin-only view of the digital-account provider account:
 *  - the real provider wallet balance and purchase history, fetched server-side
 *    with `ACCOUNTS_PROVIDER_API_KEY` (the key never reaches the browser), and
 *  - the completed / pending D1 orders that were sourced from the provider, so
 *    the admin sees the whole picture in one place.
 *
 * The provider is a third party: its wallet/orders endpoints may be missing or
 * broken. Every upstream call is therefore probed defensively — a failure is
 * reported as an explicit connection status instead of crashing the route.
 *
 * Bindings (same as `/api/provider/products`):
 *   ACCOUNTS_PROVIDER_API_KEY   secret, required to reach the provider
 *   ACCOUNTS_PROVIDER_BASE_URL  optional, defaults to the placeholder below
 *   USDT_RATE_TOMAN             optional USDT→Toman rate, defaults to 70000
 */

import {
  authenticateAdmin,
  failure,
  internalFailure,
  jsonResponse,
  type PagesContext,
} from '../_shared'
import {
  DEFAULT_PROVIDER_URL,
  extractRows,
  MAX_PAYLOAD_BYTES,
  PROVIDER_USER_AGENT,
  resolveUsdtRate,
} from '../../provider/products'

const UPSTREAM_TIMEOUT_MS = 12_000
const ORDER_LIMIT = 200

/** Candidate wallet endpoints appended to the provider base URL. */
const WALLET_PATHS = ['/wallet', '/balance', '/wallet/balance', '/me/wallet', '/account']
/** Candidate purchase-history endpoints appended to the provider base URL. */
const PURCHASE_PATHS = ['/orders', '/purchases', '/wallet/orders', '/history']

interface Discovered {
  url: string | null
  payload: unknown
  error: { code: string; message: string } | null
}

interface Probe {
  ok: boolean
  code?: string
  message?: string
  payload?: unknown
}

/* -------------------------------------------------------------------------- */
/* Upstream probing                                                            */
/* -------------------------------------------------------------------------- */

function joinPath(base: URL, path: string): string {
  const prefix = base.pathname.replace(/\/+$/, '')
  return `${base.origin}${prefix}${path.startsWith('/') ? path : `/${path}`}`
}

async function probeJson(url: string, apiKey: string): Promise<Probe> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': PROVIDER_USER_AGENT,
      },
      signal: controller.signal,
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    return {
      ok: false,
      code: timedOut ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
      message: timedOut
        ? 'زمان پاسخ ارائه‌دهنده به پایان رسید.'
        : 'ارتباط با ارائه‌دهنده برقرار نشد.',
    }
  } finally {
    clearTimeout(timeout)
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      code: 'PROVIDER_AUTH_FAILED',
      message: 'کلید API ارائه‌دهنده معتبر نیست یا دسترسی لازم را ندارد.',
    }
  }
  if (!response.ok) {
    return {
      ok: false,
      code: 'PROVIDER_HTTP_ERROR',
      message: `ارائه‌دهنده با کد ${response.status} پاسخ داد.`,
    }
  }

  const text = await response.text()
  if (text.length > MAX_PAYLOAD_BYTES) {
    return { ok: false, code: 'PROVIDER_BAD_PAYLOAD', message: 'پاسخ ارائه‌دهنده بیش از حد بزرگ است.' }
  }

  try {
    return { ok: true, payload: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, code: 'PROVIDER_BAD_PAYLOAD', message: 'پاسخ ارائه‌دهنده قابل خواندن نبود.' }
  }
}

/** Try each candidate URL until one answers; remember the last error for the UI. */
async function discover(base: URL, apiKey: string, paths: string[]): Promise<Discovered> {
  let lastError: { code: string; message: string } | null = null

  for (const path of paths) {
    const url = joinPath(base, path)
    const probe = await probeJson(url, apiKey)
    if (probe.ok) return { url, payload: probe.payload ?? null, error: null }
    lastError = {
      code: probe.code ?? 'PROVIDER_UNAVAILABLE',
      message: probe.message ?? 'ارائه‌دهنده پاسخ معتبری برنگرداند.',
    }
  }

  return { url: null, payload: null, error: lastError }
}

/* -------------------------------------------------------------------------- */
/* Payload mapping                                                             */
/* -------------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Unwrap the common `{ data | wallet | result }` envelopes into one record. */
function unwrapRecord(payload: unknown): Record<string, unknown> | null {
  const record = asRecord(payload)
  if (!record) return null
  for (const key of ['data', 'wallet', 'result', 'account']) {
    const nested = asRecord(record[key])
    if (nested) return nested
  }
  return record
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const raw = record[key]
    const value = typeof raw === 'string' ? Number(raw) : raw
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

/** Convert an upstream amount to Toman using the same rules as the catalogue. */
function toToman(amount: number, currency: string, usdtRate: number): number | null {
  if (currency === 'USDT') return Math.round(amount * usdtRate)
  if (currency === 'IRR') return Math.round(amount / 10)
  if (currency === 'IRT' || currency === 'TOMAN') return Math.round(amount)
  return null
}

function extractWallet(payload: unknown): { balance: number; currency: string } | null {
  const record = unwrapRecord(payload)
  if (!record) return null
  const balance = pickNumber(record, [
    'balance',
    'wallet_balance',
    'walletBalance',
    'available',
    'available_balance',
    'credit',
    'amount',
    'usdt',
  ])
  if (balance === undefined) return null
  const currency = (pickString(record, ['currency', 'wallet_currency', 'unit']) ?? 'USDT').toUpperCase()
  return { balance, currency }
}

interface ProviderPurchase {
  id: string
  title: string
  amount: number
  currency: string
  status: string
  createdAt: string | null
}

function toPurchase(raw: unknown, index: number): ProviderPurchase | null {
  const record = asRecord(raw)
  if (!record) return null

  const title = pickString(record, [
    'title',
    'name',
    'product_title',
    'product',
    'description',
    'item',
  ])
  const amount = pickNumber(record, ['amount', 'total', 'price', 'cost', 'paid', 'value']) ?? 0
  const currency = (pickString(record, ['currency', 'price_currency']) ?? 'USDT').toUpperCase()
  const status = pickString(record, ['status', 'state']) ?? 'unknown'
  const createdAt =
    pickString(record, ['created_at', 'createdAt', 'date', 'purchased_at', 'time']) ?? null
  const id =
    pickString(record, ['id', 'order_id', 'purchase_id', 'invoice_id', 'reference']) ??
    `prov_purchase_${index}`

  return { id, title: title ?? 'خرید ارائه‌دهنده', amount, currency, status, createdAt }
}

function extractPurchases(payload: unknown): ProviderPurchase[] {
  const rows = extractRows(payload)
  if (!rows) return []
  const purchases: ProviderPurchase[] = []
  rows.forEach((row, index) => {
    const purchase = toPurchase(row, index)
    if (purchase) purchases.push(purchase)
  })
  return purchases
}

/* -------------------------------------------------------------------------- */
/* D1 orders                                                                   */
/* -------------------------------------------------------------------------- */

interface ProviderOrderRow {
  id: string
  product_id: string
  product_title: string
  quantity: number
  total: number
  status: string
  payment_method: string | null
  delivery_note: string | null
  created_at: string
  first_name: string | null
  last_name: string | null
  username: string | null
  telegram_id: number | null
}

async function loadProviderOrders(db: NonNullable<PagesContext['env']['DB']>) {
  const result = await db
    .prepare(
      `SELECT o.id, o.product_id, o.product_title, o.quantity, o.total, o.status,
              o.payment_method, o.delivery_note, o.created_at,
              u.first_name, u.last_name, u.username, u.telegram_id
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.kind = 'account' AND o.status IN ('pending', 'paid', 'completed')
       ORDER BY o.created_at DESC
       LIMIT ?`,
    )
    .bind(ORDER_LIMIT)
    .all<ProviderOrderRow>()

  return (result.results ?? []).map((row) => {
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
    return {
      id: row.id,
      productId: row.product_id,
      title: row.product_title,
      quantity: Number(row.quantity ?? 1),
      total: Number(row.total),
      status: row.status,
      paymentMethod: row.payment_method === 'card' ? 'card' : 'wallet',
      delivered: Boolean(row.delivery_note?.trim()),
      userName:
        fullName || row.username || (row.telegram_id ? `کاربر ${row.telegram_id}` : undefined),
      telegramId: row.telegram_id ?? undefined,
      createdAt: row.created_at,
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Route                                                                       */
/* -------------------------------------------------------------------------- */

function resolveProviderBase(
  raw: string | undefined,
): { url: URL | null; error: { code: string; message: string } | null } {
  let url: URL
  try {
    url = new URL(raw?.trim() || DEFAULT_PROVIDER_URL)
  } catch {
    return {
      url: null,
      error: { code: 'PROVIDER_URL_INVALID', message: 'نشانی ارائه‌دهنده نامعتبر است.' },
    }
  }

  if (url.protocol !== 'https:') {
    return {
      url: null,
      error: {
        code: 'PROVIDER_URL_INVALID',
        message: 'نشانی ارائه‌دهنده باید با https آغاز شود.',
      },
    }
  }

  url.search = ''
  url.hash = ''
  // Drop a trailing `/products` so /wallet and /orders can be appended.
  url.pathname = url.pathname.replace(/\/products\/?$/, '').replace(/\/+$/, '') || '/'
  return { url, error: null }
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  try {
    const auth = await authenticateAdmin(context.request, context.env)
    if (!auth.ok) return failure(auth.status, auth.code, auth.message)

    const db = context.env.DB!
    const orders = await loadProviderOrders(db)

    const usdtRate = resolveUsdtRate(context.env.USDT_RATE_TOMAN)
    const apiKey = context.env.ACCOUNTS_PROVIDER_API_KEY?.trim() ?? ''
    const fetchedAt = new Date().toISOString()

    const base = resolveProviderBase(context.env.ACCOUNTS_PROVIDER_BASE_URL)

    const finish = (
      provider: Record<string, unknown>,
      purchases: ProviderPurchase[],
    ) =>
      jsonResponse({
        success: true,
        data: {
          provider: { ...provider, purchases, purchasedCount: purchases.length, fetchedAt, usdtRate },
          orders,
        },
        meta: { orderCount: orders.length, purchaseCount: purchases.length, usdtRate },
      })

    if (!apiKey) {
      return finish(
        {
          configured: false,
          connected: false,
          baseUrl: base.url ? base.url.origin : null,
          code: 'PROVIDER_KEY_MISSING',
          message: 'کلید API ارائه‌دهنده در محیط سرور تنظیم نشده است.',
          wallet: null,
        },
        [],
      )
    }

    if (!base.url) {
      return finish(
        {
          configured: true,
          connected: false,
          baseUrl: null,
          code: base.error?.code ?? 'PROVIDER_URL_INVALID',
          message: base.error?.message ?? 'نشانی ارائه‌دهنده نامعتبر است.',
          wallet: null,
        },
        [],
      )
    }

    // Probe the wallet and purchase endpoints independently so a missing wallet
    // endpoint does not blank out the purchase history (and vice versa).
    const walletProbe = await discover(base.url, apiKey, WALLET_PATHS)
    const purchasesProbe = await discover(base.url, apiKey, PURCHASE_PATHS)

    const walletRaw = walletProbe.error ? null : extractWallet(walletProbe.payload)
    const purchases = purchasesProbe.error ? [] : extractPurchases(purchasesProbe.payload)

    const connected = walletProbe.error === null || purchasesProbe.error === null

    let code: string | null = null
    let message: string | null = null

    if (!connected) {
      code = walletProbe.error?.code ?? purchasesProbe.error?.code ?? 'PROVIDER_UNAVAILABLE'
      message =
        walletProbe.error?.message ??
        purchasesProbe.error?.message ??
        'ارائه‌دهنده به اندپوینت‌های کیف پول/خرید پاسخ نداد.'
    } else if (!walletRaw) {
      code = 'PROVIDER_WALLET_UNPARSED'
      message = 'اندپوینت موجودی پاسخ داد اما ساختار آن قابل خواندن نبود.'
    }

    const wallet = walletRaw
      ? {
          balance: walletRaw.balance,
          currency: walletRaw.currency,
          balanceToman: toToman(walletRaw.balance, walletRaw.currency, usdtRate),
        }
      : null

    return finish(
      {
        configured: true,
        connected,
        baseUrl: base.url.origin,
        code,
        message,
        wallet,
      },
      purchases,
    )
  } catch (cause) {
    return internalFailure(cause, 'PROVIDER_OVERVIEW_FAILED')
  }
}
