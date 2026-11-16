import { sleep } from '@/lib/utils'
import type { AutoMarginTier } from '@/lib/pricing'
import { ApiError, apiGetProxy, apiPostProxy } from '@/services/apiClient'
import { getAdminSessionToken } from '@/services/adminAuth.service'
import { endpoints } from '@/services/endpoints'
import {
  mockAdminStats,
  mockOrders,
  mockRevenueSeries,
  mockVpnServers,
} from '@/services/mocks'
import { getTelegramInitData } from '@/services/telegram'
import type { AdminStats, Order, RevenuePoint, User, VpnServer } from '@/types'

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
  await sleep(240)
  return mockOrders
}

export async function listAdminServers(): Promise<VpnServer[]> {
  await sleep(200)
  return mockVpnServers
}
