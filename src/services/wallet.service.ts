import axios from 'axios'
import { env } from '@/config/env'
import { sleep } from '@/lib/utils'
import { mockTransactions, mockWallet } from '@/services/mocks'
import { ApiError, normalizeApiError } from '@/services/apiClient'
import { getTelegramInitData } from '@/services/telegram'
import type { Transaction, TransactionType, Wallet } from '@/types'

/**
 * The wallet lives in D1 behind `GET /api/wallet` (see functions/api/wallet.ts).
 * Inside Telegram the signed initData authenticates the request, so failures
 * surface to the UI untouched. The browser preview has no Telegram session and
 * keeps the demo fixtures so every screen stays reviewable.
 */

const TRANSACTION_TYPES: TransactionType[] = [
  'deposit',
  'purchase',
  'refund',
  'withdrawal',
  'bonus',
]

interface WalletEnvelope {
  success?: boolean
  message?: string
  code?: string
  data?: {
    balance?: number
    currency?: string
    pending?: number
    lifetimeSpent?: number
    transactions?: unknown[]
  }
}

function hasTelegramSession(): boolean {
  return Boolean(getTelegramInitData())
}

async function fetchWalletPayload(): Promise<NonNullable<WalletEnvelope['data']>> {
  const initData = getTelegramInitData()

  try {
    const { data } = await axios.get<WalletEnvelope>('/api/wallet', {
      timeout: env.apiTimeoutMs,
      headers: initData ? { 'X-Telegram-Init-Data': initData } : undefined,
    })
    if (!data || data.success !== true || !data.data) {
      throw new ApiError(data?.message || 'پاسخ سرور کیف پول نامعتبر بود.', {
        code: data?.code,
        details: data,
      })
    }
    return data.data
  } catch (error) {
    throw normalizeApiError(error)
  }
}

function toTransaction(raw: unknown): Transaction | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.amount !== 'number') return null

  const type =
    typeof row.type === 'string' && (TRANSACTION_TYPES as string[]).includes(row.type)
      ? (row.type as TransactionType)
      : 'purchase'

  return {
    id: row.id,
    type,
    amount: row.amount,
    currency: 'IRT',
    status: 'completed',
    description: typeof row.description === 'string' ? row.description : '',
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
    reference: typeof row.reference === 'string' ? row.reference : undefined,
  }
}

export async function fetchWallet(): Promise<Wallet> {
  if (!hasTelegramSession()) {
    await sleep(200)
    return mockWallet
  }

  const data = await fetchWalletPayload()
  return {
    balance: Number(data.balance ?? 0),
    currency: 'IRT',
    pending: Number(data.pending ?? 0),
    lifetimeSpent: Number(data.lifetimeSpent ?? 0),
  }
}

export async function listTransactions(limit = 20): Promise<Transaction[]> {
  if (!hasTelegramSession()) {
    await sleep(260)
    return mockTransactions.slice(0, limit)
  }

  const data = await fetchWalletPayload()
  const rows = Array.isArray(data.transactions) ? data.transactions : []
  return rows
    .map(toTransaction)
    .filter((transaction): transaction is Transaction => transaction !== null)
    .slice(0, limit)
}
