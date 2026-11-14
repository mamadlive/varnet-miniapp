import { env } from '@/config/env'
import { sleep } from '@/lib/utils'
import { formatCount } from '@/lib/format'
import { apiGet, apiPost } from '@/services/apiClient'
import { endpoints } from '@/services/endpoints'
import { mockActiveServices, mockVpnPlans, mockVpnServers } from '@/services/mocks'
import type { ActiveService, Currency, VpnPlan, VpnServer } from '@/types'

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
/* Domain mapping                                                             */
/* -------------------------------------------------------------------------- */

const BYTES_PER_GB = 1024 ** 3
const SECONDS_PER_DAY = 86_400
const DEFAULT_SERVER_CODE = '49'

function normalizePrice(amount: number, code: string): { price: number; currency: Currency } {
  const currency = code.trim().toUpperCase()

  if (currency === 'IRR') {
    // 1 Toman = 10 Rial. The catalogue is Toman-first, so convert Rial prices.
    return { price: Math.round(amount / 10), currency: 'IRT' }
  }

  // IRT — and legacy/mislabeled codes (e.g. USD test rows) — are Toman amounts.
  return { price: amount, currency: 'IRT' }
}

/** Map a RADIUS plan row onto the UI's `VpnPlan` model. */
export function mapVpnPlan(record: VpnPlanRecord): VpnPlan {
  const quotaGb = Math.round(record.quota_bytes / BYTES_PER_GB)
  const durationDays = Math.max(1, Math.round(record.duration_seconds / SECONDS_PER_DAY))
  const isActive = record.plan_status.toUpperCase() === 'ACTIVE'
  const { price, currency } = normalizePrice(record.price_amount, record.price_currency)

  return {
    // `plan_code` is what `POST /v1/provision` expects, so use it as the id.
    id: record.plan_code || record.id,
    name: record.display_name || record.plan_code,
    serverId: DEFAULT_SERVER_CODE,
    // The RADIUS API exposes no node geography; the UI falls back to a globe.
    location: 'سرور اختصاصی',
    countryCode: '',
    price,
    currency,
    durationDays,
    bandwidthMbps: 1_000,
    staticIp: true,
    // `/v1/plans` has no inventory counter — active plans are purchasable.
    stock: isActive ? 999 : 0,
    isActive,
    availability: isActive ? 'in_stock' : 'sold_out',
    features: [
      `${formatCount(quotaGb)} گیگابایت حجم`,
      `${formatCount(durationDays)} روز اعتبار`,
      'آی‌پی ثابت اختصاصی',
      'تونل امن OpenVPN (UDP)',
    ],
  }
}

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                  */
/* -------------------------------------------------------------------------- */

/** Live static-IP catalogue (`GET /v1/plans`). */
export async function listVpnPlans(): Promise<VpnPlan[]> {
  try {
    const records = await apiGet<VpnPlanRecord[]>(endpoints.vpn.plans)
    return records.map(mapVpnPlan)
  } catch (error) {
    // `/v1/plans` has no per-location inventory yet. In demo mode the fixtures
    // keep the Germany-only catalogue explorable offline; production surfaces
    // the real failure so nobody buys against a stale mock.
    if (env.demoMode) return mockVpnPlans
    throw error
  }
}

/**
 * Node inventory is not exposed by the RADIUS API yet, so the dashboard/admin
 * views keep rendering the local fixtures.
 */
export async function listVpnServers(): Promise<VpnServer[]> {
  await sleep(180)
  return mockVpnServers
}

/**
 * Provisioned subscriptions for the signed-in customer. The RADIUS API exposes
 * usage per username via `/v1/usage`; until that is wired to a session lookup
 * («سرویس‌های من») reads local fixtures.
 */
export async function listActiveServices(): Promise<ActiveService[]> {
  await sleep(220)
  return mockActiveServices
}

/* -------------------------------------------------------------------------- */
/* Static-IP provisioning (mock)                                              */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000
const USERNAME_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789'
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

function randomToken(length: number, alphabet: string): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

function nextStaticIp(): string {
  return `185.55.226.${20 + Math.floor(Math.random() * 200)}`
}

/**
 * Provision a brand-new node: fresh RADIUS username/password, new static IP.
 * This is the «خرید نود جدید» path and never reuses an existing subscription.
 */
export async function purchaseVpnService(plan: VpnPlan): Promise<ActiveService> {
  await sleep(320)

  const now = new Date()
  const suffix = randomToken(6, USERNAME_ALPHABET)

  return {
    id: `svc_${suffix}`,
    orderId: `ord_${suffix}`,
    planName: plan.name,
    location: plan.location,
    countryCode: plan.countryCode || 'DE',
    ipAddress: nextStaticIp(),
    protocol: 'OpenVPN (UDP)',
    username: `varnet_${randomToken(8, USERNAME_ALPHABET)}`,
    password: randomToken(14, PASSWORD_ALPHABET),
    dataCapGb: plan.dataCapGb ?? 50,
    usedGb: 0,
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + plan.durationDays * DAY_MS).toISOString(),
    autoRenew: false,
  }
}

/**
 * Renew an existing node: add the plan's duration and volume while keeping the
 * same RADIUS username, password and static IP. This is the «تمدید» path.
 */
export async function renewVpnService(
  service: ActiveService,
  plan: VpnPlan,
): Promise<ActiveService> {
  await sleep(320)

  const currentExpiry = new Date(service.expiresAt).getTime()
  const anchor = Number.isFinite(currentExpiry) ? Math.max(Date.now(), currentExpiry) : Date.now()
  const suffix = randomToken(6, USERNAME_ALPHABET)

  return {
    ...service,
    orderId: `ord_${suffix}`,
    planName: plan.name,
    location: plan.location,
    countryCode: plan.countryCode || service.countryCode,
    dataCapGb: service.dataCapGb + (plan.dataCapGb ?? 50),
    expiresAt: new Date(anchor + plan.durationDays * DAY_MS).toISOString(),
  }
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
