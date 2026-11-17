/**
 * Cloudflare Pages Function — GET /api/admin/static-ip/nodes
 *
 * Full node catalogue for the admin panel, including disabled nodes.
 */

import {
  authenticateAdmin,
  failure,
  internalFailure,
  jsonResponse,
  type PagesContext,
} from '../_shared'

export interface StaticIpNodeRow {
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

export function toAdminNode(row: StaticIpNodeRow) {
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
  try {
    const auth = await authenticateAdmin(context.request, context.env)
    if (!auth.ok) return failure(auth.status, auth.code, auth.message)

    const db = context.env.DB!
    const result = await db
      .prepare(
        `SELECT id, name, ip, country, country_code, protocol, price, currency,
                duration_days, data_cap_gb, availability, is_enabled, sort_order,
                created_at, updated_at
         FROM static_ip_nodes
         ORDER BY sort_order ASC, created_at ASC`,
      )
      .all<StaticIpNodeRow>()

    const rows = result.results ?? []
    return jsonResponse({
      success: true,
      data: rows.map(toAdminNode),
      meta: { count: rows.length },
    })
  } catch (cause) {
    return internalFailure(cause, 'STATIC_IP_NODES_READ_FAILED')
  }
}
