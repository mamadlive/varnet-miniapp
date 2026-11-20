import axios from 'axios'
import { env } from '@/config/env'
import { ApiError, normalizeApiError } from '@/services/apiClient'
import { getTelegramInitData } from '@/services/telegram'
import type { Currency, OrderKind, OrderStatus, PaymentMethod } from '@/types'

/**
 * Wallet purchases go through the same-origin Pages Function
 * `functions/api/purchase.ts`, which authenticates the Telegram session,
 * checks/debits the D1 wallet and records the order.
 */

export interface PurchaseInput {
  productId: string
  title: string
  kind: OrderKind
  /** Amount before the coupon discount. */
  subtotal: number
  discount: number
  /** Payable amount (`subtotal - discount`); must match the server check. */
  total: number
  currency: Currency
  couponCode?: string
  /** `wallet` debits instantly; `card` creates a pending order + receipt. */
  paymentMethod?: PaymentMethod
  /** Card-to-card tracking number supplied by the customer. */
  receiptReference?: string
}

export interface PurchaseOrder {
  id: string
  status: OrderStatus
  kind: OrderKind
  productId: string
  title: string
  subtotal: number
  discount: number
  total: number
  currency: Currency
  paymentMethod?: PaymentMethod
  createdAt: string
}

export interface PurchaseQuote {
  title: string
  subtotal: number
  discount: number
  total: number
  currency: Currency
}

export interface PurchaseReceipt {
  order: PurchaseOrder
  /** Wallet balance after the request, straight from D1. */
  balance: number
  receipt?: { id: string; status: 'PENDING' }
}

interface PurchaseEnvelope {
  success?: boolean
  message?: string
  code?: string
  data?: {
    order?: PurchaseOrder
    balance?: number
    receipt?: { id: string; status: 'PENDING' }
  }
}

export async function quoteProduct(input: { productId: string; kind: OrderKind; couponCode?: string }): Promise<PurchaseQuote> {
  const initData = getTelegramInitData()
  try {
    const { data } = await axios.post<{ success?: boolean; data?: PurchaseQuote; message?: string; code?: string }>(
      '/api/purchase', { action: 'quote', ...input },
      { timeout: env.apiTimeoutMs, headers: initData ? { 'X-Telegram-Init-Data': initData } : undefined },
    )
    if (data.success !== true || !data.data || !Number.isSafeInteger(data.data.subtotal) ||
        data.data.subtotal <= 0 || !Number.isSafeInteger(data.data.discount) || data.data.discount < 0 ||
        data.data.total !== data.data.subtotal - data.data.discount || data.data.total < 0) {
      throw new ApiError(data.message || 'دریافت قیمت از سرور انجام نشد.', { code: data.code })
    }
    return data.data
  } catch (error) {
    throw normalizeApiError(error)
  }
}

export async function purchaseProduct(input: PurchaseInput): Promise<PurchaseReceipt> {
  const initData = getTelegramInitData()

  try {
    const { data } = await axios.post<PurchaseEnvelope>('/api/purchase', input, {
      timeout: env.apiTimeoutMs,
      headers: initData ? { 'X-Telegram-Init-Data': initData } : undefined,
    })

    if (!data || data.success !== true || !data.data?.order) {
      throw new ApiError(data?.message || 'پاسخ سرور خرید نامعتبر بود.', {
        code: data?.code,
        details: data,
      })
    }

    return {
      order: data.data.order,
      balance: Number(data.data.balance ?? 0),
      receipt: data.data.receipt,
    }
  } catch (error) {
    throw normalizeApiError(error)
  }
}
