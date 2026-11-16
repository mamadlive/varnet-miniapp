import { useEffect, useMemo, useState } from 'react'
import { Info } from 'lucide-react'

import { BalanceHero } from '@/components/wallet/BalanceHero'
import { FilterTabs } from '@/components/wallet/FilterTabs'
import type { FilterTabOption } from '@/components/wallet/FilterTabs'
import { TopUpSheet } from '@/components/wallet/TopUpSheet'
import { TransactionList } from '@/components/wallet/TransactionList'
import { WalletStats } from '@/components/wallet/WalletStats'
import { useTelegram } from '@/hooks/useTelegram'
import { formatCount } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'
import { useWalletStore } from '@/store/walletStore'
import type { TransactionType } from '@/types'

type WalletFilter = 'all' | 'deposits' | 'purchases' | 'refunds'

/** Type groups behind the wallet filter tabs. */
const FILTER_TYPES: Record<Exclude<WalletFilter, 'all'>, TransactionType[]> = {
  deposits: ['deposit', 'bonus'],
  purchases: ['purchase', 'withdrawal'],
  refunds: ['refund'],
}

const FILTER_OPTIONS: ReadonlyArray<FilterTabOption<WalletFilter>> = [
  { value: 'all', label: 'همه' },
  { value: 'deposits', label: 'واریزها' },
  { value: 'purchases', label: 'خریدها' },
  { value: 'refunds', label: 'بازگشت وجه' },
]

/** Mini App wallet: balance hero, demo top-up sheet and transaction history. */
export default function WalletPage() {
  const balance = useWalletStore((state) => state.balance)
  const currency = useWalletStore((state) => state.currency)
  const pending = useWalletStore((state) => state.pending)
  const lifetimeSpent = useWalletStore((state) => state.lifetimeSpent)
  const transactions = useWalletStore((state) => state.transactions)
  const status = useWalletStore((state) => state.status)
  const loadWallet = useWalletStore((state) => state.loadWallet)
  const loadTransactions = useWalletStore((state) => state.loadTransactions)
  const topUp = useWalletStore((state) => state.topUp)
  const isDemo = useAuthStore((state) => state.isDemo)

  const { haptic, notify } = useTelegram()

  const [filter, setFilter] = useState<WalletFilter>('all')
  const [topUpOpen, setTopUpOpen] = useState(false)

  useEffect(() => {
    void loadWallet()
    void loadTransactions()
  }, [loadWallet, loadTransactions])

  const filteredTransactions = useMemo(() => {
    if (filter === 'all') return transactions
    const types = FILTER_TYPES[filter]
    return transactions.filter((transaction) => types.includes(transaction.type))
  }, [filter, transactions])

  const isLoading = status === 'loading'

  const handleTopUp = async (amount: number) => {
    await topUp(amount)
    notify('success')
    setTopUpOpen(false)
  }

  const handleFilterChange = (next: WalletFilter) => {
    haptic()
    setFilter(next)
  }

  return (
    <div className="tg-page animate-fade-in space-y-4 pt-5">
      <header className="px-1">
        <h1 className="text-[22px] font-bold text-tg-text">{fa.wallet.title}</h1>
        <p className="mt-0.5 text-[13px] text-tg-hint">
          موجودی، شارژ و همه تراکنش‌ها در یک جا.
        </p>
      </header>

      <BalanceHero
        balance={balance}
        currency={currency}
        loading={isLoading}
        onTopUp={() => {
          haptic()
          setTopUpOpen(true)
        }}
      />

      <WalletStats pending={pending} lifetimeSpent={lifetimeSpent} currency={currency} />

      {isDemo ? (
        <p className="flex items-start gap-2 px-1 text-[11.5px] leading-relaxed text-tg-hint">
          <Info className="mt-0.5 size-3.5 shrink-0 text-brand-500" aria-hidden />
          حالت نمایشی فعال است — افزایش موجودی شبیه‌سازی‌شده است و پرداخت واقعی انجام نمی‌شود.
        </p>
      ) : null}

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[15px] font-semibold text-tg-text">{fa.wallet.transactions}</h2>
          <span className="text-[12px] tabular-nums text-tg-hint">
            {formatCount(filteredTransactions.length)} از {formatCount(transactions.length)}
          </span>
        </div>

        <FilterTabs
          options={FILTER_OPTIONS}
          value={filter}
          onChange={handleFilterChange}
          variant="segmented"
          ariaLabel="فیلتر تراکنش‌ها"
          className="mb-3"
        />

        <TransactionList
          transactions={filteredTransactions}
          loading={isLoading}
          emptyTitle={filter === 'all' ? 'هنوز تراکنشی ثبت نشده است' : 'در این دسته تراکنشی نیست'}
          emptyDescription={
            filter === 'all'
              ? 'برای دیدن اولین واریز، کیف پول را شارژ کنید.'
              : 'فیلتر دیگری را امتحان کنید یا کیف پول را شارژ کنید.'
          }
          onResetFilter={filter === 'all' ? undefined : () => setFilter('all')}
        />
      </section>

      <TopUpSheet
        open={topUpOpen}
        onClose={() => setTopUpOpen(false)}
        onConfirm={handleTopUp}
        currency={currency}
      />
    </div>
  )
}
