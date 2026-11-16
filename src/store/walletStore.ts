import { create } from 'zustand'
import { mockTransactions, mockWallet } from '@/services/mocks'
import { fetchWallet, listTransactions } from '@/services/wallet.service'
import { formatCurrency } from '@/lib/format'
import type { Currency, Transaction, Wallet } from '@/types'

/**
 * Wallet store — balance + transaction feed shared by the Mini App home,
 * wallet screen and checkout. Seeded with demo data so the UI renders even
 * before the API call resolves.
 */

interface WalletState {
  balance: number
  currency: Currency
  pending: number
  lifetimeSpent: number
  transactions: Transaction[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  loadWallet: () => Promise<void>
  loadTransactions: () => Promise<void>
  topUp: (amount: number) => Promise<void>
  adjustBalance: (delta: number) => void
  /** Sync with the server-reported balance after a wallet debit/credit. */
  setBalance: (balance: number) => void
  /** Formatted balance bound to the current currency, e.g. `۲,۴۸۰,۰۰۰ تومان`. */
  formatBalance: () => string
}

export const useWalletStore = create<WalletState>((set, get) => ({
  balance: mockWallet.balance,
  currency: mockWallet.currency,
  pending: mockWallet.pending,
  lifetimeSpent: mockWallet.lifetimeSpent,
  transactions: [],
  status: 'idle',
  error: null,

  loadWallet: async () => {
    set({ status: 'loading', error: null })
    try {
      const wallet: Wallet = await fetchWallet()
      set({
        balance: wallet.balance,
        currency: wallet.currency,
        pending: wallet.pending,
        lifetimeSpent: wallet.lifetimeSpent,
        status: 'ready',
      })
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'بارگذاری کیف پول انجام نشد.',
      })
    }
  },

  loadTransactions: async () => {
    try {
      const transactions = await listTransactions()
      set({ transactions })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'بارگذاری تراکنش‌ها انجام نشد.' })
    }
  },

  topUp: async (amount) => {
    if (!Number.isFinite(amount) || amount <= 0) return

    const { currency } = get()
    const transaction: Transaction = {
      id: `txn_local_${Date.now()}`,
      type: 'deposit',
      amount,
      currency,
      status: 'completed',
      description: 'شارژ کیف پول · نمایشی',
      createdAt: new Date().toISOString(),
    }
    set((state) => ({
      balance: state.balance + amount,
      transactions: [transaction, ...state.transactions],
      status: 'ready',
    }))
  },

  adjustBalance: (delta) => {
    set((state) => ({ balance: Math.max(state.balance + delta, 0) }))
  },

  setBalance: (balance) => {
    set({ balance: Math.max(0, Math.round(balance)), status: 'ready', error: null })
  },

  formatBalance: () => formatCurrency(get().balance, get().currency),
}))

// Seed the feed with demo transactions; `loadTransactions()` replaces it.
useWalletStore.setState({ transactions: mockTransactions })
