/**
 * Cloudflare Pages Function — GET /api/static-ip/plans
 *
 * Public selling catalogue: enabled plans attached to enabled nodes. Each plan
 * is a purchasable product (quota + duration + price) for one node; the node's
 * availability is passed through so the storefront can show «به‌زودی» plans.
 */

interface D1PreparedStatement {
  all<T = unknown>(): Promise<{ results: T[] }>
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement
}

interface PlansEnv {
  DB?: D1Database
}

interface PagesContext {
  request: Request
  env: PlansEnv
}

interface PlanRow {
  id: string
  node_id: string
  name: string
  data_cap_gb: number
  duration_days: number
  price: number
  currency: string
  is_enabled: number
  sort_order: number
  node_name: string
  country: string
  country_code: string
  protocol: string
  availability: string
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

function toPlan(row: PlanRow) {
  return {
    id: row.id,
    nodeId: row.node_id,
    name: row.name,
    dataCapGb: Number(row.data_cap_gb),
    durationDays: Number(row.duration_days),
    price: Number(row.price),
    currency: 'IRT',
    enabled: Number(row.is_enabled) === 1,
    sortOrder: Number(row.sort_order),
    nodeName: row.node_name,
    country: row.country,
    countryCode: row.country_code,
    protocol: row.protocol,
    availability: row.availability,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const db = context.env.DB
  if (!db) return failure(503, 'DB_NOT_CONFIGURED', 'پایگاه داده پلن‌ها در سرور تنظیم نشده است.')

  let rows: PlanRow[]
  try {
    const result = await db
      .prepare(
        `SELECT p.id, p.node_id, p.name, p.data_cap_gb, p.duration_days, p.price,
                p.currency, p.is_enabled, p.sort_order, p.created_at, p.updated_at,
                n.name AS node_name, n.country, n.country_code, n.protocol, n.availability
         FROM static_ip_plans p
         JOIN static_ip_nodes n ON n.id = p.node_id
         WHERE p.is_enabled = 1 AND n.is_enabled = 1
         ORDER BY p.sort_order ASC, p.created_at ASC`,
      )
      .all<PlanRow>()
    rows = result.results ?? []
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'خواندن پلن‌های آی‌پی ثابت از پایگاه داده انجام نشد.')
  }

  return jsonResponse({
    success: true,
    data: rows.map(toPlan),
    meta: { count: rows.length },
  })
}
