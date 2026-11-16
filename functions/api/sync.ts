/**
 * Cloudflare Pages Function — POST /api/sync
 *
 * Pulls the provider catalogue (Dantehub) into D1. Every failure path is
 * wrapped: the handler never throws to the platform, so the admin panel always
 * receives JSON with the exact `error.message` / `error.cause` instead of a
 * Cloudflare `ERR_BAD_RESPONSE` timeout page.
 *
 * Why the 15s abort: if the upstream WAF starts blocking Cloudflare egress IPs
 * it tarpits the connection. Without an AbortController the Worker waits until
 * the platform kills the request, which is exactly the timeout the admin sees.
 * 15 seconds gives a slow-but-healthy provider room to finish while still
 * failing fast enough for the admin panel to show the diagnostic cause.
 *
 * Every product passes through `localizeProviderProduct` (providerMapper.ts)
 * *before* the D1 upsert, so Persian titles, brand emojis/gradients,
 * descriptions and features are what get persisted — not the raw upstream copy.
 *
 * Bindings (Pages dashboard / `.dev.vars`):
 *   ACCOUNTS_PROVIDER_API_KEY   secret, required
 *   ACCOUNTS_PROVIDER_BASE_URL  optional, defaults to the placeholder URL
 *   USDT_RATE_TOMAN             optional, defaults to 70000
 *   DB                          D1 binding, required
 *
 * Trust model matches /api/provider/products: the key never leaves the server;
 * this route only mirrors the public catalogue and is called by the admin panel.
 */

import { localizeProviderProduct } from '../../src/lib/providerMapper'
import type { AccountProduct } from '../../src/types'
import {
  DEFAULT_PROVIDER_URL,
  MAX_PAYLOAD_BYTES,
  PROVIDER_USER_AGENT,
  extractRows,
  normalizeProduct,
  resolveUsdtRate,
} from './provider/products'

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  run(): Promise<unknown>
}

interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>
}

interface SyncEnv {
  ACCOUNTS_PROVIDER_API_KEY?: string
  ACCOUNTS_PROVIDER_BASE_URL?: string
  USDT_RATE_TOMAN?: string
  DB?: D1Database
}

interface PagesContext {
  request: Request
  env: SyncEnv
}

const UPSTREAM_TIMEOUT_MS = 15_000
/** Statements per D1 batch — keeps each Worker invocation well under limits. */
const PRODUCTS_PER_BATCH = 50

const RESPONSE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const

const UPSERT_SQL = `
  INSERT INTO products (
    id, title, subtitle, category, price, old_price,
    provider_price, provider_old_price, provider_currency, currency,
    stock, rating, review_count, badge, delivery_time, description,
    features, gradient, emoji, brand_key, provider_description,
    synced_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    subtitle = excluded.subtitle,
    category = excluded.category,
    price = excluded.price,
    old_price = excluded.old_price,
    provider_price = excluded.provider_price,
    provider_old_price = excluded.provider_old_price,
    provider_currency = excluded.provider_currency,
    currency = excluded.currency,
    stock = excluded.stock,
    rating = excluded.rating,
    review_count = excluded.review_count,
    badge = excluded.badge,
    delivery_time = excluded.delivery_time,
    description = excluded.description,
    features = excluded.features,
    gradient = excluded.gradient,
    emoji = excluded.emoji,
    brand_key = excluded.brand_key,
    provider_description = excluded.provider_description,
    synced_at = excluded.synced_at,
    updated_at = excluded.updated_at
`

class SyncError extends Error {
  readonly code: string

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'SyncError'
    this.code = code
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS })
}

/** Serialise an arbitrary thrown value (including nested `cause`) for JSON. */
function describeCause(value: unknown, depth = 0): unknown {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'object') {
    // Abort errors are DOMExceptions, not `instanceof Error`, but they still
    // carry a readable `name`/`message` pair.
    const record = value as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name : undefined
    const message = typeof record.message === 'string' ? record.message : undefined
    const code = typeof record.code === 'string' ? record.code : undefined
    if (name || message || code) {
      const nested = depth < 3 ? describeCause(record.cause, depth + 1) : undefined
      return {
        ...(name ? { name } : {}),
        ...(message ? { message } : {}),
        ...(code ? { code } : {}),
        ...(nested !== undefined ? { cause: nested } : {}),
      }
    }
    if (depth >= 3) return String(value)
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return String(value)
    }
  }
  return String(value)
}

/**
 * Single exit point for failures: HTTP 500, the exact error message, and the
 * full cause chain so the admin can tell an upstream firewall block apart from
 * a D1 write error.
 */
function failureResponse(error: unknown): Response {
  const err =
    error instanceof Error ? error : new Error(typeof error === 'string' ? error : String(error))
  const code = error instanceof SyncError ? error.code : 'SYNC_UNEXPECTED'

  return jsonResponse(
    {
      success: false,
      code,
      message: err.message,
      error: {
        name: err.name,
        message: err.message,
        cause: describeCause(err.cause) ?? null,
      },
    },
    500,
  )
}

function resolveProviderUrl(raw: string | undefined): URL {
  let url: URL
  try {
    url = new URL(raw?.trim() || DEFAULT_PROVIDER_URL)
  } catch (cause) {
    throw new SyncError('SYNC_CONFIG_INVALID', 'نشانی ارائه‌دهنده معتبر نیست.', { cause })
  }
  if (url.protocol !== 'https:') {
    throw new SyncError(
      'SYNC_CONFIG_INVALID',
      'نشانی ارائه‌دهنده باید با https آغاز شود.',
      { cause: new Error(`Unsupported protocol: ${url.protocol}`) },
    )
  }
  return url
}

/** Fetch + parse the upstream catalogue. Aborts after `UPSTREAM_TIMEOUT_MS`. */
async function fetchProviderCatalog(providerUrl: URL, apiKey: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(providerUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': PROVIDER_USER_AGENT,
      },
      signal: controller.signal,
    })
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new SyncError(
        'SYNC_UPSTREAM_TIMEOUT',
        `ارتباط با ارائه‌دهنده در ${UPSTREAM_TIMEOUT_MS / 1000} ثانیه قطع شد. اگر فایروال مبدأ ترافیک Cloudflare را بلاک کرده باشد این خطا رخ می‌دهد.`,
        { cause },
      )
    }
    throw new SyncError(
      'SYNC_UPSTREAM_UNREACHABLE',
      'ارتباط با سرور ارائه‌دهنده برقرار نشد.',
      { cause },
    )
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    let snippet = ''
    try {
      snippet = (await response.text()).slice(0, 500)
    } catch {
      // The status alone is enough to diagnose; ignore unreadable bodies.
    }
    throw new SyncError(
      'SYNC_UPSTREAM_HTTP',
      `ارائه‌دهنده با وضعیت HTTP ${response.status} پاسخ داد.`,
      { cause: new Error(`HTTP ${response.status}${snippet ? `: ${snippet}` : ''}`) },
    )
  }

  const text = await response.text()
  if (text.length > MAX_PAYLOAD_BYTES) {
    throw new SyncError('SYNC_UPSTREAM_BAD_PAYLOAD', 'پاسخ ارائه‌دهنده بیش از حد بزرگ است.', {
      cause: new Error(`Payload ${text.length} bytes > ${MAX_PAYLOAD_BYTES} limit`),
    })
  }

  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new SyncError('SYNC_UPSTREAM_BAD_PAYLOAD', 'پاسخ ارائه‌دهنده JSON معتبر نبود.', {
      cause,
    })
  }
}

function toBindings(product: AccountProduct, syncedAt: string): unknown[] {
  return [
    product.id,
    product.title,
    product.subtitle ?? null,
    product.category,
    product.price,
    product.oldPrice ?? null,
    product.providerPrice ?? null,
    product.providerOldPrice ?? null,
    product.providerCurrency ?? 'USDT',
    product.currency,
    product.stock,
    product.rating ?? null,
    product.reviewCount ?? null,
    product.badge ?? null,
    product.deliveryTime ?? null,
    product.description ?? null,
    product.features && product.features.length > 0 ? JSON.stringify(product.features) : null,
    product.gradient ?? null,
    product.emoji ?? null,
    product.brandKey ?? null,
    product.providerDescription ?? null,
    syncedAt,
    syncedAt,
    syncedAt,
  ]
}

/**
 * Upsert the catalogue in bounded `db.batch()` chunks. One round-trip per
 * chunk instead of one per product keeps the Worker well under the CPU and
 * subrequest limits for catalogues of a few hundred rows.
 */
async function writeProducts(
  db: D1Database,
  products: AccountProduct[],
  syncedAt: string,
): Promise<number> {
  let batches = 0

  for (let index = 0; index < products.length; index += PRODUCTS_PER_BATCH) {
    const chunk = products.slice(index, index + PRODUCTS_PER_BATCH)
    const statements = chunk.map((product) =>
      db.prepare(UPSERT_SQL).bind(...toBindings(product, syncedAt)),
    )

    try {
      await db.batch(statements)
    } catch (cause) {
      throw new SyncError(
        'SYNC_DB_WRITE_FAILED',
        `ثبت ${chunk.length} محصول در D1 ناموفق بود (دسته ${batches + 1}).`,
        { cause },
      )
    }
    batches += 1
  }

  return batches
}

/** Persist the rate used for this sync so every client prices identically. */
async function writeSyncMeta(
  db: D1Database,
  usdtRate: number,
  syncedAt: string,
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO sync_meta (key, value, updated_at) VALUES ('usdt_rate', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(String(usdtRate), syncedAt)
      .run()
  } catch (cause) {
    throw new SyncError('SYNC_DB_WRITE_FAILED', 'ثبت نرخ USDT در D1 ناموفق بود.', { cause })
  }
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  try {
    const apiKey = context.env.ACCOUNTS_PROVIDER_API_KEY?.trim()
    if (!apiKey) {
      throw new SyncError(
        'SYNC_CONFIG_MISSING',
        'کلید API ارائه‌دهنده در محیط سرور تنظیم نشده است.',
      )
    }

    const db = context.env.DB
    if (!db) {
      throw new SyncError(
        'SYNC_DB_NOT_CONFIGURED',
        'اتصال پایگاه‌داده D1 (binding «DB») در محیط سرور تنظیم نشده است.',
      )
    }

    const providerUrl = resolveProviderUrl(context.env.ACCOUNTS_PROVIDER_BASE_URL)
    const usdtRate = resolveUsdtRate(context.env.USDT_RATE_TOMAN)

    const payload = await fetchProviderCatalog(providerUrl, apiKey)
    const rows = extractRows(payload)
    if (!rows) {
      throw new SyncError(
        'SYNC_UPSTREAM_BAD_PAYLOAD',
        'ساختار کاتالوگ ارائه‌دهنده نامعتبر است (آرایه یا کلید data/products پیدا نشد).',
      )
    }

    const products: AccountProduct[] = []
    const seen = new Set<string>()
    let skipped = 0

    for (const row of rows) {
      const normalized = normalizeProduct(row, usdtRate)
      if (!normalized || seen.has(normalized.id)) {
        skipped += 1
        continue
      }
      seen.add(normalized.id)
      // Apply the Persian dictionary before persisting: D1 must hold the
      // mapped title/description/emoji/brand, never the raw upstream copy.
      products.push(localizeProviderProduct(normalized))
    }

    if (products.length === 0) {
      throw new SyncError(
        'SYNC_EMPTY_CATALOGUE',
        'ارائه‌دهنده هیچ محصول معتبری برنگرداند.',
      )
    }

    const syncedAt = new Date().toISOString()
    const batches = await writeProducts(db, products, syncedAt)
    await writeSyncMeta(db, usdtRate, syncedAt)

    return jsonResponse({
      success: true,
      data: {
        products,
        synced: products.length,
        skipped,
        batches,
        syncedAt,
        usdtRate,
      },
      meta: {
        count: products.length,
        skipped,
        fetchedAt: syncedAt,
        usdtRate,
      },
    })
  } catch (error) {
    return failureResponse(error)
  }
}
