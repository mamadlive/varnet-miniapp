import { Link } from 'react-router-dom'
import { ChevronLeft, Wallet } from 'lucide-react'
import { useTelegram } from '@/hooks/useTelegram'
import { formatCurrency } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { Currency } from '@/types'

export interface WalletPillProps {
  balance: number
  currency: Currency
  className?: string
}

/** Compact balance shortcut pointing at the wallet screen. */
export function WalletPill({ balance, currency, className }: WalletPillProps) {
  const { haptic } = useTelegram()

  return (
    <Link
      to="/app/wallet"
      onClick={() => haptic('light')}
      aria-label={`${fa.marketplace.walletBalance}: ${formatCurrency(balance, currency)}`}
      className={cn(
        'flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-tg-separator bg-tg-bg py-1 pe-2.5 ps-1 shadow-sm transition-transform active:scale-[0.97]',
        className,
      )}
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-tg-button/12 text-tg-button">
        <Wallet className="size-4" aria-hidden />
      </span>
      <span className="text-[13px] font-semibold text-tg-text">
        <bdi>{formatCurrency(balance, currency)}</bdi>
      </span>
      {/* In RTL the wallet screen is "forward", so the chevron points left. */}
      <ChevronLeft className="size-3.5 text-tg-hint" aria-hidden />
    </Link>
  )
}
