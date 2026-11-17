import { sleep } from '@/lib/utils'
import type { AutoMarginTier } from '@/lib/pricing'
import { ApiError, apiGetProxy, apiPostProxy } from '@/services/apiClient'
import { getAdminSessionToken } from '@/services/adminAuth.service'
import { endpoints } from '@/services/endpoints'
import { mockAdminStats, mockRevenueSeries } from '@/services/mocks'
import { getTelegramInitData } from '@/services/telegram'
import type {
  AdminStats,
  BankAccountDetails,
  Order,
  PaymentReceipt,
  PaymentReceiptStatus,
  RevenuePoint,
  StaticIpNode,
  StaticIpNodeAvailability,
  StaticIpPlan,
  User,
} from '@/types'

/**
 * Admin panel data.
 *
 * Users, wallet adjustments and margin tiers come from `/api/admin/*` Pages
 * Functions, authorized by either the OTP admin token (`Authorization:
 * Bearer`) or a Mini App admin's Telegram `initData`. The user list is always
 * D1-backed — never fixtures — so every row id is a valid wallet-adjustment
 * target. Dashboards, orders and servers still render local fixtures.
 */

interface AdminEnvelope<T> {
  success?: boolean
  data?: T
  message?: string
  code?: string
}

function adminHeaders(): Record<string, string> | undefined {
  const headers: Record<string, string> = {}
  const initData = getTelegramInitData()
  if (initData) headers['X-Telegram-Init-Data'] = initData

  const adminToken = getAdminSessionToken()
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`

  return Object.keys(headers).length > 0 ? headers : undefined
}

function adminFailure(payload: AdminEnvelope<unknown> | null | undefined, fallback: string): ApiError {
  const message = payload?.message?.trim()
  return new ApiError(message || fallback, { code: payload?.code })
}

async function adminGet<T>(url: string): Promise<T> {
  const payload = await apiGetProxy<AdminEnvelope<T>>(url, { headers: adminHeaders() })
  if (!payload || payload.success !== true || payload.data === undefined) {
    throw adminFailure(payload, 'پاسخ سرور مدیریتی نامعتبر بود.')
  }
  return payload.data
}

export async function fetchAdminStats(): Promise<AdminStats> {
  await sleep(200)
  return mockAdminStats
}

export async function fetchRevenueSeries(): Promise<RevenuePoint[]> {
  await sleep(220)
  return mockRevenueSeries
}

export async function listUsers(): Promise<User[]> {
  const users = await adminGet<User[]>(endpoints.admin.users)
  if (!Array.isArray(users)) throw new ApiError('فهرست کاربران دریافتی نامعتبر بود.')
  return users
}

export interface WalletAdjustmentInput {
  userId: string
  /** Signed Toman amount: positive credits, negative deducts. */
  amount: number
  note?: string
}

export interface WalletAdjustmentResult {
  balance: number
  currency: string
  transactionId?: string
}

export async function adjustUserWallet(
  input: WalletAdjustmentInput,
): Promise<WalletAdjustmentResult> {
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw new ApiError('مبلغ باید یک عدد صحیح و غیر صفر (تومان) باشد.')
  }

  const payload = await apiPostProxy<AdminEnvelope<WalletAdjustmentResult>>(
    endpoints.admin.walletAdjust,
    input,
    { headers: adminHeaders() },
  )
  if (!payload || payload.success !== true || !payload.data) {
    throw adminFailure(payload, 'تعدیل موجودی کاربر انجام نشد.')
  }
  return payload.data
}

export async function fetchMarginTiers(): Promise<AutoMarginTier[]> {
  const data = await adminGet<{ tiers: AutoMarginTier[] }>(endpoints.admin.margins)
  if (!Array.isArray(data.tiers)) throw new ApiError('پاسخ پلکان سود نامعتبر بود.')
  return data.tiers
}

export async function saveMarginTiers(tiers: AutoMarginTier[]): Promise<AutoMarginTier[]> {
  const payload = await apiPostProxy<AdminEnvelope<{ tiers: AutoMarginTier[] }>>(
    endpoints.admin.margins,
    { tiers },
    { headers: adminHeaders() },
  )
  if (!payload || payload.success !== true || !payload.data?.tiers) {
    throw adminFailure(payload, 'ذخیره سود پلکانی انجام نشد.')
  }
  return payload.data.tiers
}

export async function listAdminOrders(): Promise<Order[]> {
  const orders = await adminGet<Order[]>(endpoints.admin.orders)
  if (!Array.isArray(orders)) throw new ApiError('فهرست سفارش‌های دریافتی نامعتبر بود.')
  return orders
}

export type OrderAction = 'complete' | 'reject'

export interface OrderActionResult {
  orderId: string
  status: string
  refunded?: number
  balance?: number | null
  updatedAt?: string
}

export async function actOnOrder(
  orderId: string,
  action: OrderAction,
  deliveryNote?: string,
): Promise<OrderActionResult> {
  const payload = await apiPostProxy<AdminEnvelope<OrderActionResult>>(
    endpoints.admin.orderAction,
    { orderId, action, deliveryNote },
    { headers: adminHeaders() },
  )
  if (!payload || payload.success !== true || !payload.data) {
    throw adminFailure(payload, 'اقدام روی سفارش انجام نشد.')
  }
  return payload.data
}

export async function listAdminReceipts(
  status: PaymentReceiptStatus | 'all' = 'PENDING',
): Promise<PaymentReceipt[]> {
  const receipts = await adminGet<PaymentReceipt[]>(
    `${endpoints.admin.receipts}?status=${encodeURIComponent(status)}`,
  )
  if (!Array.isArray(receipts)) throw new ApiError('فهرست فیش‌های واریزی نامعتبر بود.')
  return receipts
}

export type ReceiptAction = 'approve' | 'reject'

export interface ReceiptActionResult {
  receiptId: string
  status: string
  amount?: number
  balance?: number | null
  orderId?: string
}

export async function actOnReceipt(
  receiptId: string,
  action: ReceiptAction,
): Promise<ReceiptActionResult> {
  const payload = await apiPostProxy<AdminEnvelope<ReceiptActionResult>>(
    endpoints.admin.receiptAction,
    { receiptId, action },
    { headers: adminHeaders() },
  )
  if (!payload || payload.success !== true || !payload.data) {
    throw adminFailure(payload, 'اقدام روی فیش واریز انجام نشد.')
  }
  return payload.data
}

export async function fetchBankSettings(): Promise<BankAccountDetails> {
  const data = await adminGet<BankAccountDetails>(endpoints.admin.bank)
  return { ...data, updatedAt: data.updatedAt ?? null }
}

export async function saveBankSettings(
  input: Pick<BankAccountDetails, 'cardNumber' | 'accountHolder'> & { bankName?: string },
): Promise<BankAccountDetails> {
  const payload = await apiPostProxy<AdminEnvelope<BankAccountDetails>>(
    endpoints.admin.bank,
    input,
    { headers: adminHeaders() },
  )
  if (!payload || payload.success !== true || !payload.data) {
    throw adminFailure(payload, 'ذخیره اطلاعات کارت انجام نشد.')
  }
  return { ...payload.data, updatedAt: payload.data.updatedAt ?? null }
}

export interface StaticIpNodeInput {
  /** Omit to create a new node. */
  id?: string
  name: string
  ip: string
  country: string
  countryCode: string
  price: number
  durationDays: number
  dataCapGb: number
  availability: StaticIpNodeAvailability
  enabled?: boolean
  sortOrder?: number
}

export async function listAdminNodes(): Promise<StaticIpNode[]> {
  const nodes = await adminGet<StaticIpNode[]>(endpoints.admin.staticIpNodes)
  if (!Array.isArray(nodes)) throw new ApiError('فهرست نودهای آی‌پی ثابت نامعتبر بود.')
  return nodes
}

/** Flip a node between enabled (visible in the Mini App) and hidden. */
export async function toggleAdminNode(nodeId: string): Promise<StaticIpNode> {
  const payload = await apiPostProxy<AdminEnvelope<StaticIpNode>>(
    endpoints.admin.staticIpNodeAction,
    { action: 'toggle', nodeId },
    { headers: adminHeaders() },
  )
  if (!payload || payload.success !== true || !payload.data) {
    throw adminFailure(payload, 'تغییر وضعیت نود انجام نشد.')
  }
  return payload.data
}

export async function saveAdminNode(input: StaticIpNodeInput): Promise<StaticIpNode> {
  const payload = await apiPostProxy<AdminEnvelope<StaticIpNode>>(
    endpoints.admin.staticIpNodeAction,
    { action: 'save', ...input },
    { headers: adminHeaders() },
  )
  if (!payload || payload.success !== true || !payload.data) {
    throw adminFailure(payload, 'ذخیره نود انجام نشد.')
  }
  return payload.data
}

export interface StaticIpPlanInput {
  /** Omit to create a new plan. */
  id?: string
  nodeId: string
  name: string
  dataCapGb: number
  durationDays: number
  price: number
  enabled?: boolean
  sortOrder?: number
}

export async function listAdminPlans(): Promise<StaticIpPlan[]> {
  const plans = await adminGet<StaticIpPlan[]>(endpoints.admin.staticIpPlans)
  if (!Array.isArray(plans)) throw new ApiError('فهرست پلن‌های آی‌پی ثابت نامعتبر بود.')
  return plans
}

export async function saveAdminPlan(input: StaticIpPlanInput): Promise<StaticIpPlan> {
  const payload = await apiPostProxy<AdminEnvelope<StaticIpPlan>>(
    endpoints.admin.staticIpPlanAction,
    { action: 'save', ...input },
    { headers: adminHeaders() },
  )
  if (!payload || payload.success !== true || !payload.data) {
    throw adminFailure(payload, 'ذخیره پلن انجام نشد.')
  }
  return payload.data
}

/** Flip a plan between enabled (sellable in the Mini App) and hidden. */
export async function toggleAdminPlan(planId: string): Promise<StaticIpPlan> {
  const payload = await apiPostProxy<AdminEnvelope<StaticIpPlan>>(
    endpoints.admin.staticIpPlanAction,
    { action: 'toggle', planId },
    { headers: adminHeaders() },
  )
  if (!payload || payload.success !== true || !payload.data) {
    throw adminFailure(payload, 'تغییر وضعیت پلن انجام نشد.')
  }
  return payload.data
}

export async function deleteAdminPlan(planId: string): Promise<string> {
  const payload = await apiPostProxy<AdminEnvelope<{ id: string }>>(
    endpoints.admin.staticIpPlanAction,
    { action: 'delete', planId },
    { headers: adminHeaders() },
  )
  if (!payload || payload.success !== true || !payload.data) {
    throw adminFailure(payload, 'حذف پلن انجام نشد.')
  }
  return payload.data.id
}
