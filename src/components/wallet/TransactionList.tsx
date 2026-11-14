import { ReceiptText } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { TransactionRow } from '@/components/wallet/TransactionRow'
import { fa } from '@/lib/i18n'
import type { Transaction } from '@/types'

export interface TransactionListProps {
  transactions: Transaction[]
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  onResetFilter?: () => void
}

function TransactionListSkeleton() {
  return (
    <Card variant="surface" padded={false} className="overflow-hidden">
      <div className="divide-y divide-tg-separator">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 px-3.5 py-3.5">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
            <div className="space-y-2">
              <Skeleton className="ms-auto h-3.5 w-16" />
              <Skeleton className="ms-auto h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/** Cardised transaction feed with skeleton and empty states. */
export function TransactionList({
  transactions,
  loading = false,
  emptyTitle = fa.wallet.noTransactions,
  emptyDescription,
  onResetFilter,
}: TransactionListProps) {
  if (loading) return <TransactionListSkeleton />

  if (transactions.length === 0) {
    return (
      <Card variant="surface" padded={false}>
        <EmptyState
          icon={ReceiptText}
          title={emptyTitle}
          description={emptyDescription}
          action={
            onResetFilter ? (
              <Button variant="secondary" size="sm" onClick={onResetFilter}>
                نمایش همه تراکنش‌ها
              </Button>
            ) : undefined
          }
        />
      </Card>
    )
  }

  return (
    <Card variant="surface" padded={false} className="overflow-hidden">
      <ul className="divide-y divide-tg-separator">
        {transactions.map((transaction) => (
          <li key={transaction.id}>
            <TransactionRow transaction={transaction} />
          </li>
        ))}
      </ul>
    </Card>
  )
}
