/**
 * Cloudflare Pages Function — GET /api/static-ip/nodes
 *
 * Public catalogue of static-IP nodes that the admin has enabled. Disabled
 * nodes never reach the Mini App; availability (`in_stock`, `coming_soon`,
 * `sold_out`) is exposed separately so the storefront can show "به‌زودی" nodes.
 */

interface D1PreparedStatement {
  all<T = unknown>(): Promise<{ results: T[] }>
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement
}

interface NodesEnv {
  DB?: D1Database
}

interface PagesContext {
  request: Request
  env: NodesEnv
}

interface NodeRow {
  id: string
  name: string
  ip: string
  country: string
  country_code: string
  protocol: string
  price: number
  currency: string
  duration_days: number
  data_cap_gb: number
  availability: string
  is_enabled: number
  sort_order: number
  created_at: string
  updated_at: string
}

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

function toNode(row: NodeRow) {
  return {
    id: row.id,
    name: row.name,
    ip: row.ip,
    country: row.country,
    countryCode: row.country_code,
    protocol: row.protocol,
    price: Number(row.price),
    currency: 'IRT',
    durationDays: Number(row.duration_days),
    dataCapGb: Number(row.data_cap_gb),
    availability: row.availability,
    enabled: Number(row.is_enabled) === 1,
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const db = context.env.DB
  if (!db) return failure(503, 'DB_NOT_CONFIGURED', 'پایگاه داده نودها در سرور تنظیم نشده است.')

  let rows: NodeRow[]
  try {
    const result = await db
      .prepare(
        `SELECT id, name, ip, country, country_code, protocol, price, currency,
                duration_days, data_cap_gb, availability, is_enabled, sort_order,
                created_at, updated_at
         FROM static_ip_nodes
         WHERE is_enabled = 1
         ORDER BY sort_order ASC, created_at ASC`,
      )
      .all<NodeRow>()
    rows = result.results ?? []
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'خواندن نودهای آی‌پی ثابت از پایگاه داده انجام نشد.')
  }

  return jsonResponse({
    success: true,
    data: rows.map(toNode),
    meta: { count: rows.length },
  })
}
