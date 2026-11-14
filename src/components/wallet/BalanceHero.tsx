import { Coins, Plus, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { currencyLabel, formatCurrency } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { Currency } from '@/types'

export interface BalanceHeroProps {
  balance: number
  currency: Currency
  loading?: boolean
  onTopUp: () => void
  className?: string
}

/**
 * Gradient wallet hero: the single most important number of the screen plus
 * the primary "Top up" action. Decorative shapes/icon keep it Telegram-like
 * without images or hardcoded backgrounds.
 */
export function BalanceHero({ balance, currency, loading = false, onTopUp, className }: BalanceHeroProps) {
  return (
    <Card variant="brand" padded={false} className={cn('relative overflow-hidden', className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute -end-12 -top-16 size-48 rounded-full bg-white/10 blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -start-12 size-48 rounded-full bg-white/10 blur-2xl"
      />
      <div aria-hidden className="pointer-events-none absolute -end-2 bottom-2 text-white/15">
        <Wallet className="size-28 -rotate-12" strokeWidth={1.25} />
      </div>

      <div className="relative p-5">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-white/15">
            <Coins className="size-4" aria-hidden />
          </span>
          <span className="text-[11px] font-semibold text-white/75">موجودی قابل استفاده</span>
        </div>

        <div className="mt-3 flex items-end gap-2">
          {loading ? (
            <Skeleton className="h-9 w-40 bg-white/25" />
          ) : (
            <p className="text-[34px] font-bold leading-none tabular-nums text-white">
              {formatCurrency(balance, currency)}
            </p>
          )}
          <span className="pb-1 text-[12px] font-semibold text-white/70">{currencyLabel(currency)}</span>
        </div>

        <div className="mt-5 flex items-end justify-between gap-3">
          <p className="max-w-[55%] text-[12px] leading-snug text-white/75">
            برای خرید اکانت‌های دیجیتال یا پلن‌های آی‌پی ثابت از آن استفاده کنید.
          </p>
          <Button
            size="md"
            onClick={onTopUp}
            leftIcon={<Plus className="size-4" />}
            className="shrink-0 border border-white/25 bg-white/15 text-white backdrop-blur-sm hover:bg-white/25 active:scale-[0.98] active:bg-white/20"
          >
            {fa.wallet.topUp}
          </Button>
        </div>
      </div>
    </Card>
  )
}
