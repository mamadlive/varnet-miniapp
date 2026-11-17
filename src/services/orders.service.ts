import { apiGetProxy } from '@/services/apiClient'
import { getTelegramInitData } from '@/services/telegram'
import type { Order } from '@/types'

/**
 * Customer order history, always read from D1 via `GET /api/orders`.
 * Fixture orders are gone: an empty list means the user has no real orders.
 */

interface OrdersEnvelope {
  success?: boolean
  message?: string
  code?: string
  data?: Order[]
}

function authHeaders(): Record<string, string> | undefined {
  const initData = getTelegramInitData()
  return initData ? { 'X-Telegram-Init-Data': initData } : undefined
}

export async function listOrders(): Promise<Order[]> {
  const payload = await apiGetProxy<OrdersEnvelope>('/api/orders', {
    headers: authHeaders(),
  })
  if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
    throw new Error(payload?.message || 'خواندن سفارش‌ها از سرور انجام نشد.')
  }
  return payload.data
}

export async function getOrder(id: string): Promise<Order | null> {
  const orders = await listOrders()
  return orders.find((order) => order.id === id) ?? null
}
