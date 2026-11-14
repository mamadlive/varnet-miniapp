import type { LucideIcon } from 'lucide-react'
import { ArrowDownLeft, ArrowUpRight, Gift, RotateCcw } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import type { BadgeTone } from '@/components/ui/Badge'
import { formatCurrency, formatRelativeTime } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { Transaction, TransactionStatus, TransactionType } from '@/types'

interface TransactionTypeMeta {
  icon: LucideIcon
  iconClass: string
}

const TYPE_META: Record<TransactionType, TransactionTypeMeta> = {
  deposit: { icon: ArrowDownLeft, iconClass: 'bg-emerald-500/12 text-emerald-600' },
  purchase: { icon: ArrowUpRight, iconClass: 'bg-brand-500/12 text-brand-600' },
  refund: { icon: RotateCcw, iconClass: 'bg-amber-500/12 text-amber-600' },
  withdrawal: { icon: ArrowUpRight, iconClass: 'bg-rose-500/12 text-rose-600' },
  bonus: { icon: Gift, iconClass: 'bg-violet-500/12 text-violet-600' },
}

const STATUS_TONES: Record<TransactionStatus, BadgeTone> = {
  completed: 'success',
  pending: 'warning',
  failed: 'danger',
}

export interface TransactionRowProps {
  transaction: Transaction
  className?: string
}

/** One row of the transaction feed: type icon, description, signed amount. */
export function TransactionRow({ transaction, className }: TransactionRowProps) {
  const meta = TYPE_META[transaction.type]
  const isCredit = transaction.amount > 0
  const Icon = meta.icon

  return (
    <div className={cn('flex items-center gap-3 px-3.5 py-3', className)}>
      <span
        className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', meta.iconClass)}
      >
        <Icon className="size-[18px]" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-tg-text">{transaction.description}</p>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] text-tg-hint">
          <span className="shrink-0">{formatRelativeTime(transaction.createdAt)}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{fa.transactionTypes[transaction.type]}</span>
          {transaction.reference ? (
            <>
              <span aria-hidden>·</span>
              <span className="bidi-ltr max-w-[9rem] truncate">{transaction.reference}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={cn(
            'bidi-ltr text-[15px] font-semibold tabular-nums',
            isCredit ? 'text-emerald-600' : 'text-tg-text',
          )}
        >
          {isCredit ? '+' : '−'}
          {formatCurrency(Math.abs(transaction.amount), transaction.currency)}
        </span>
        <Badge tone={STATUS_TONES[transaction.status]} size="sm">
          {fa.transactionStatuses[transaction.status]}
        </Badge>
      </div>
    </div>
  )
}
