import { ApiError, apiGetProxy, apiPostProxy } from '@/services/apiClient'
import { getTelegramInitData } from '@/services/telegram'
import type { BankAccountDetails } from '@/types'

/**
 * Card-to-card helpers shared by the purchase sheet and the wallet top-up.
 * Bank details come from the admin settings (`settings` table) — there is no
 * local fallback: if the server has none, the UI tells the user to retry.
 */

interface Envelope<T> {
  success?: boolean
  message?: string
  code?: string
  data?: T
}

interface BankResponse {
  cardNumber: string
  accountHolder: string
  bankName?: string
  updatedAt: string | null
}

export async function fetchBankDetails(): Promise<BankAccountDetails> {
  const payload = await apiGetProxy<Envelope<BankResponse>>('/api/bank')
  if (!payload || payload.success !== true || !payload.data) {
    throw new ApiError(payload?.message || 'اطلاعات کارت دریافت نشد.', { code: payload?.code })
  }
  const { cardNumber, accountHolder, bankName, updatedAt } = payload.data
  return {
    cardNumber,
    accountHolder,
    bankName: bankName || undefined,
    updatedAt: updatedAt ?? null,
  }
}

export interface CardTransferInput {
  amount: number
  reference: string
}

export interface CardTransferReceipt {
  receiptId: string
  amount: number
  status: 'PENDING'
  createdAt: string
}

/** Registers a wallet top-up receipt; the wallet is credited after admin approval. */
export async function submitWalletReceipt(
  input: CardTransferInput,
): Promise<CardTransferReceipt> {
  const initData = getTelegramInitData()
  const payload = await apiPostProxy<Envelope<CardTransferReceipt>>('/api/wallet/receipt', input, {
    headers: initData ? { 'X-Telegram-Init-Data': initData } : undefined,
  })
  if (!payload || payload.success !== true || !payload.data) {
    throw new ApiError(payload?.message || 'ثبت فیش واریز انجام نشد.', { code: payload?.code })
  }
  return payload.data
}
