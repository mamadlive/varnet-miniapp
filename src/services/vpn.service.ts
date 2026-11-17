import { apiGet, apiPost } from '@/services/apiClient'
import { endpoints } from '@/services/endpoints'
import { listStaticIpNodes, listStaticIpPlans, mapPlanToVpnPlan, mapNodeToServer } from '@/services/staticIp.service'
import type { VpnPlan, VpnServer } from '@/types'

/* -------------------------------------------------------------------------- */
/* Transport contracts — mirrors the Linux RADIUS API (`/v1`)                 */
/* -------------------------------------------------------------------------- */

/** Row returned by `GET /v1/plans`. */
export interface VpnPlanRecord {
  id: string
  plan_code: string
  display_name: string
  quota_bytes: number
  duration_seconds: number
  price_amount: number
  price_currency: string
  plan_status: string
}

export interface VpnProvisionRequest {
  external_ref: string
  plan_code: string
  order_id: string
  amount?: number
  currency?: string
  payment_reference?: string
  display_name?: string
  server_code?: string
}

export interface VpnProvisionResult {
  ok: boolean
  external_ref: string
  customer_id: string
  subscription_id: string
  purchase_id: string
  radius_username: string
  password: string | null
  password_is_new: boolean
  valid_from: string | null
  valid_until: string | null
  quota_bytes: number
  granted_bytes: number
  server_code: string
  config_url: string | null
  renewed: boolean
  groupname: string | null
  message: string
}

export interface VpnUsage {
  ok: boolean
  username: string
  bytes_in: number
  bytes_out: number
  bytes_total: number
  used_gb: number
  sessions: number
}

/** `GET /v1/customers/{external_ref}` is untyped in the OpenAPI schema. */
export type VpnCustomer = Record<string, unknown>

/* -------------------------------------------------------------------------- */
/* Catalogue (D1 static_ip_nodes)                                             */
/* -------------------------------------------------------------------------- */

/** Purchasable storefront catalogue — enabled D1 nodes only. */
export async function listVpnPlans(): Promise<VpnPlan[]> {
  return (await listStaticIpPlans()).map(mapPlanToVpnPlan)
}

/** Node strip entries — same enabled D1 nodes, no local fixtures. */
export async function listVpnServers(): Promise<VpnServer[]> {
  return (await listStaticIpNodes()).map(mapNodeToServer)
}

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

export async function fetchVpnStatus(): Promise<unknown> {
  return apiGet<unknown>(endpoints.vpn.status)
}

export async function fetchVpnDbHealth(): Promise<unknown> {
  return apiGet<unknown>(endpoints.vpn.dbHealth)
}

/* -------------------------------------------------------------------------- */
/* Customers, provisioning & usage                                            */
/* -------------------------------------------------------------------------- */

export async function fetchVpnCustomer(externalRef: string): Promise<VpnCustomer> {
  return apiGet<VpnCustomer>(endpoints.vpn.customer(externalRef))
}

export interface ProvisionVpnInput {
  /** Telegram id as a string — the backend's `external_ref`. */
  externalRef: string
  /** `plan_code` from `/v1/plans` (also surfaced as `VpnPlan.id`). */
  planCode: string
  /** Idempotency key; reuse the same value when retrying. */
  orderId: string
  amount?: number
  currency?: string
  paymentReference?: string
  displayName?: string
  /** Defaults to the server-side `49` when omitted. */
  serverCode?: string
}

/** Idempotent provisioning (`POST /v1/provision`). */
export async function provisionVpn(input: ProvisionVpnInput): Promise<VpnProvisionResult> {
  const body: VpnProvisionRequest = {
    external_ref: input.externalRef,
    plan_code: input.planCode,
    order_id: input.orderId,
    ...(input.amount !== undefined ? { amount: input.amount } : {}),
    currency: input.currency ?? 'IRT',
    ...(input.paymentReference ? { payment_reference: input.paymentReference } : {}),
    ...(input.displayName ? { display_name: input.displayName } : {}),
    ...(input.serverCode ? { server_code: input.serverCode } : {}),
  }

  return apiPost<VpnProvisionResult>(endpoints.vpn.provision, body)
}

export async function fetchVpnUsage(username: string): Promise<VpnUsage> {
  return apiGet<VpnUsage>(endpoints.vpn.usage, { params: { username } })
}

/* -------------------------------------------------------------------------- */
/* RADIUS account lifecycle                                                   */
/* -------------------------------------------------------------------------- */

export async function suspendVpnUser(username: string): Promise<void> {
  await apiPost<unknown>(endpoints.vpn.radius.suspend, { username })
}

export interface ResumeVpnInput {
  username: string
  /** ISO date/time string. */
  validUntil: string
  quotaGb: number
}

export async function resumeVpnUser(input: ResumeVpnInput): Promise<void> {
  await apiPost<unknown>(endpoints.vpn.radius.resume, {
    username: input.username,
    valid_until: input.validUntil,
    quota_gb: input.quotaGb,
  })
}

export async function deleteVpnUser(username: string): Promise<void> {
  await apiPost<unknown>(endpoints.vpn.radius.delete, { username })
}

export async function deleteVpnCustomer(externalRef: string): Promise<void> {
  await apiPost<unknown>(endpoints.vpn.customerDelete, { external_ref: externalRef })
}

/* -------------------------------------------------------------------------- */
/* Plan catalogue sync (admin/cPanel side)                                    */
/* -------------------------------------------------------------------------- */

export interface SyncVpnPlanInput {
  planCode: string
  displayName: string
  quotaGb: number
  durationDays: number
  priceAmount: number
}

export async function syncVpnPlan(input: SyncVpnPlanInput): Promise<void> {
  await apiPost<unknown>(endpoints.vpn.syncPlan, {
    plan_code: input.planCode,
    display_name: input.displayName,
    quota_gb: input.quotaGb,
    duration_days: input.durationDays,
    price_amount: input.priceAmount,
  })
}
