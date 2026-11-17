/**
 * Cloudflare Pages Function — GET /api/admin/static-ip/plans
 *
 * Full plan catalogue for the admin panel, including disabled plans and plans
 * attached to hidden nodes. Node data is joined so the UI can label each plan.
 */

import {
  authenticateAdmin,
  failure,
  internalFailure,
  jsonResponse,
  type PagesContext,
} from '../_shared'

export interface StaticIpPlanRow {
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

export const PLAN_SELECT = `SELECT p.id, p.node_id, p.name, p.data_cap_gb, p.duration_days,
    p.price, p.currency, p.is_enabled, p.sort_order, p.created_at, p.updated_at,
    n.name AS node_name, n.country, n.country_code, n.protocol, n.availability
  FROM static_ip_plans p
  JOIN static_ip_nodes n ON n.id = p.node_id`

export function toAdminPlan(row: StaticIpPlanRow) {
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
  try {
    const auth = await authenticateAdmin(context.request, context.env)
    if (!auth.ok) return failure(auth.status, auth.code, auth.message)

    const db = context.env.DB!
    const result = await db
      .prepare(`${PLAN_SELECT} ORDER BY p.sort_order ASC, p.created_at ASC`)
      .all<StaticIpPlanRow>()

    const rows = result.results ?? []
    return jsonResponse({
      success: true,
      data: rows.map(toAdminPlan),
      meta: { count: rows.length },
    })
  } catch (cause) {
    return internalFailure(cause, 'STATIC_IP_PLANS_READ_FAILED')
  }
}
