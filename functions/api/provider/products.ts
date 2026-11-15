/**
 * Cloudflare Pages Function — GET /api/provider/products
 *
 * Secure server-side proxy for the digital-account provider. The provider API
 * key is read from the Pages environment binding and is only ever sent to the
 * provider; the browser talks exclusively to this same-origin route.
 *
 * Bindings (dashboard → Settings → Environment variables, or `.dev.vars`):
 *   ACCOUNTS_PROVIDER_API_KEY   secret, required
 *   ACCOUNTS_PROVIDER_BASE_URL  optional, defaults to the placeholder below
 *   USDT_RATE_TOMAN             optional USDT→Toman rate, defaults to 70000
 *
 * Provider payload contract: an array (or `{ data | products | items }`) of
 * records with at least `id`, a title (`title`/`name`/`display_name`) and a
 * price (`price`/`price_amount`). `USDT` is converted with `USDT_RATE_TOMAN`,
 * `IRR` at 1/10, and `IRT`/`TOMAN` are used as-is. Records with an unknown
 * currency are skipped instead of being mispriced.
 */

interface ProviderEnv {
  ACCOUNTS_PROVIDER_API_KEY?: string
  ACCOUNTS_PROVIDER_BASE_URL?: string
  /** Toman per 1 USDT. Dantehub prices the catalogue in USDT. */
  USDT_RATE_TOMAN?: string
}

interface PagesContext {
  request: Request
  env: ProviderEnv
}

type ProductCategory = 'streaming' | 'ai' | 'gaming' | 'design' | 'social' | 'other'

interface CatalogProduct {
  id: string
  title: string
  subtitle?: string
  category: ProductCategory
  price: number
  oldPrice?: number
  /**
   * Raw upstream amount, kept so the Mini App can reprice with an admin-managed
   * USDT rate instead of the server conversion below.
   */
  providerPrice: number
  providerOldPrice?: number
  providerCurrency: string
  currency: 'IRT'
  stock: number
  rating?: number
  reviewCount?: number
  badge?: string
  deliveryTime?: string
  description?: string
  features?: string[]
  gradient: string
  emoji: string
}

const DEFAULT_PROVIDER_URL = 'https://api.dummy-provider.com/v1/products'
const UPSTREAM_TIMEOUT_MS = 10_000
const MAX_PAYLOAD_BYTES = 2_000_000
const DEFAULT_USDT_RATE_TOMAN = 70_000

const RESPONSE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const

const CATEGORY_STYLES: Record<ProductCategory, { gradient: string; emoji: string }> = {
  streaming: { gradient: 'from-rose-500 via-red-500 to-orange-500', emoji: '🎬' },
  ai: { gradient: 'from-violet-500 via-purple-500 to-indigo-500', emoji: '🤖' },
  gaming: { gradient: 'from-sky-500 via-blue-500 to-indigo-500', emoji: '🎮' },
  design: { gradient: 'from-fuchsia-500 via-pink-500 to-rose-500', emoji: '🎨' },
  social: { gradient: 'from-sky-400 via-cyan-400 to-blue-500', emoji: '✈️' },
  other: { gradient: 'from-brand-500 to-brand-700', emoji: '🛍️' },
}

const CATEGORY_ALIASES: Record<string, ProductCategory> = {
  streaming: 'streaming',
  video: 'streaming',
  music: 'streaming',
  'video-streaming': 'streaming',
  ai: 'ai',
  'artificial-intelligence': 'ai',
  ml: 'ai',
  chat: 'ai',
  gaming: 'gaming',
  game: 'gaming',
  games: 'gaming',
  design: 'design',
  creative: 'design',
  graphics: 'design',
  social: 'social',
  'social-media': 'social',
  messaging: 'social',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS })
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const raw = record[key]
    const value = typeof raw === 'string' ? Number(raw) : raw
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

function firstStringArray(
  record: Record<string, unknown>,
  keys: string[],
): string[] | undefined {
  for (const key of keys) {
    const value = record[key]
    if (!Array.isArray(value)) continue
    const items = value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
      .slice(0, 8)
    if (items.length > 0) return items
  }
  return undefined
}

/** USDT rate from the environment; a missing or invalid value uses 70,000. */
function resolveUsdtRate(raw: string | undefined): number {
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_USDT_RATE_TOMAN
}

/**
 * Provider base amount → Toman. USDT is multiplied by the server-side rate,
 * IRR is divided by 10, and unknown currencies are rejected.
 */
function normalizeAmount(
  record: Record<string, unknown>,
  keys: string[],
  currency: string,
  usdtRate: number,
): number | null {
  const amount = firstNumber(record, keys)
  if (amount === undefined || amount < 0) return null

  if (currency === 'USDT') return Math.round(amount * usdtRate)
  if (currency === 'IRR') return Math.round(amount / 10)
  if (currency === 'IRT' || currency === 'TOMAN') return Math.round(amount)
  return null
}

function normalizeCategory(raw: string | undefined): ProductCategory {
  if (!raw) return 'other'
  const key = raw.trim().toLowerCase().replace(/[\s_]+/g, '-')
  return CATEGORY_ALIASES[key] ?? 'other'
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function normalizeProduct(raw: unknown, usdtRate: number): CatalogProduct | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>

  const title = firstString(record, ['title', 'name', 'display_name'])
  const currency = (firstString(record, ['currency', 'price_currency']) ?? 'IRT').toUpperCase()
  const providerPrice = firstNumber(record, ['price', 'price_amount', 'amount'])
  const price = normalizeAmount(record, ['price', 'price_amount', 'amount'], currency, usdtRate)
  if (!title || price === null || providerPrice === undefined || providerPrice < 0) return null

  const id =
    firstString(record, ['id', 'product_id', 'sku']) ?? `prov_${slugify(title) || 'product'}`
  const category = normalizeCategory(firstString(record, ['category', 'type', 'group']))
  const style = CATEGORY_STYLES[category]
  const providerOldPrice = firstNumber(record, [
    'old_price',
    'oldPrice',
    'original_price',
    'compare_at_price',
  ])
  const oldPriceRaw = normalizeAmount(
    record,
    ['old_price', 'oldPrice', 'original_price', 'compare_at_price'],
    currency,
    usdtRate,
  )
  const stock = Math.max(0, Math.floor(firstNumber(record, ['stock', 'quantity', 'inventory']) ?? 0))
  const rating = firstNumber(record, ['rating', 'score'])
  const reviewCount = firstNumber(record, ['review_count', 'reviewCount', 'reviews'])

  return {
    id,
    title,
    subtitle: firstString(record, ['subtitle', 'short_description', 'tagline']),
    category,
    price,
    oldPrice: oldPriceRaw !== null && oldPriceRaw > price ? oldPriceRaw : undefined,
    providerPrice,
    providerOldPrice:
      providerOldPrice !== undefined && providerOldPrice > providerPrice
        ? providerOldPrice
        : undefined,
    providerCurrency: currency,
    currency: 'IRT',
    stock,
    rating:
      rating === undefined ? undefined : Math.min(5, Math.max(0, Math.round(rating * 10) / 10)),
    reviewCount:
      reviewCount === undefined ? undefined : Math.max(0, Math.round(reviewCount)),
    badge: firstString(record, ['badge', 'tag']),
    deliveryTime: firstString(record, ['delivery_time', 'deliveryTime']),
    description: firstString(record, ['description', 'long_description']),
    features: firstStringArray(record, ['features', 'bullets']),
    gradient: style.gradient,
    emoji: firstString(record, ['emoji', 'icon']) ?? style.emoji,
  }
}

/** Accept a bare array or the common provider envelopes. */
function extractRows(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return null

  const record = payload as Record<string, unknown>
  for (const key of ['data', 'products', 'items', 'results']) {
    const value = record[key]
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') {
      const nested = (value as Record<string, unknown>).items
      if (Array.isArray(nested)) return nested
    }
  }
  return null
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const apiKey = context.env.ACCOUNTS_PROVIDER_API_KEY?.trim()
  if (!apiKey) {
    return jsonResponse(
      {
        success: false,
        code: 'PROVIDER_KEY_MISSING',
        message: 'کلید API ارائه‌دهنده در محیط سرور تنظیم نشده است.',
      },
      500,
    )
  }

  let providerUrl: URL
  try {
    providerUrl = new URL(
      context.env.ACCOUNTS_PROVIDER_BASE_URL?.trim() || DEFAULT_PROVIDER_URL,
    )
  } catch {
    providerUrl = new URL(DEFAULT_PROVIDER_URL)
  }
  if (providerUrl.protocol !== 'https:') {
    return jsonResponse(
      {
        success: false,
        code: 'PROVIDER_URL_INVALID',
        message: 'نشانی ارائه‌دهنده باید با https آغاز شود.',
      },
      500,
    )
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  let upstream: Response
  try {
    upstream = await fetch(providerUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        // Workers sends no User-Agent by default; Cloudflare WAF on the
        // upstream tarpits headerless requests, so identify as a browser.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    return jsonResponse(
      {
        success: false,
        code: timedOut ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
        message: timedOut
          ? 'زمان پاسخ ارائه‌دهنده به پایان رسید.'
          : 'ارتباط با ارائه‌دهنده برقرار نشد.',
      },
      timedOut ? 504 : 502,
    )
  } finally {
    clearTimeout(timeout)
  }

  if (upstream.status === 401 || upstream.status === 403) {
    return jsonResponse(
      {
        success: false,
        code: 'PROVIDER_AUTH_FAILED',
        message: 'کلید API ارائه‌دهنده معتبر نیست یا دسترسی لازم را ندارد.',
      },
      502,
    )
  }
  if (!upstream.ok) {
    return jsonResponse(
      {
        success: false,
        code: 'PROVIDER_UNAVAILABLE',
        message: 'ارائه‌دهنده کاتالوگ را برنگرداند.',
      },
      502,
    )
  }

  const text = await upstream.text()
  if (text.length > MAX_PAYLOAD_BYTES) {
    return jsonResponse(
      { success: false, code: 'PROVIDER_BAD_PAYLOAD', message: 'پاسخ ارائه‌دهنده بیش از حد بزرگ است.' },
      502,
    )
  }

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return jsonResponse(
      { success: false, code: 'PROVIDER_BAD_PAYLOAD', message: 'پاسخ ارائه‌دهنده قابل خواندن نبود.' },
      502,
    )
  }

  const rows = extractRows(payload)
  if (!rows) {
    return jsonResponse(
      { success: false, code: 'PROVIDER_BAD_PAYLOAD', message: 'ساختار کاتالوگ ارائه‌دهنده نامعتبر است.' },
      502,
    )
  }

  const usdtRate = resolveUsdtRate(context.env.USDT_RATE_TOMAN)
  const products: CatalogProduct[] = []
  const seen = new Set<string>()
  let skipped = 0

  for (const row of rows) {
    const product = normalizeProduct(row, usdtRate)
    if (!product || seen.has(product.id)) {
      skipped += 1
      continue
    }
    seen.add(product.id)
    products.push(product)
  }

  return jsonResponse({
    success: true,
    data: products,
    meta: {
      count: products.length,
      skipped,
      fetchedAt: new Date().toISOString(),
      // Surfaced so the admin settings page can show the server rate and the
      // client can convert Toman bases back to USDT for the margin tiers.
      usdtRate,
    },
  })
}
