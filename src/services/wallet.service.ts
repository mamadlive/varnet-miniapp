import { sleep } from '@/lib/utils'
import { mockTransactions, mockWallet } from '@/services/mocks'
import type { Transaction, Wallet } from '@/types'

/**
 * The wallet belongs to the third-party provider behind the future Cloudflare
 * proxy, so balances and transactions stay on local fixtures for now.
 */
export async function fetchWallet(): Promise<Wallet> {
  await sleep(200)
  return mockWallet
}

export async function listTransactions(limit = 20): Promise<Transaction[]> {
  await sleep(260)
  return mockTransactions.slice(0, limit)
}
