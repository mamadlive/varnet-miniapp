import type { LucideIcon } from 'lucide-react'
import { Clock3, TrendingDown } from 'lucide-react'

import { Card } from '@/components/ui/Card'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Currency } from '@/types'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string
  tone: 'warning' | 'brand'
}

function StatCard({ icon: Icon, label, value, tone }: StatCardProps) {
  return (
    <Card variant="surface" padded={false} className="flex items-center gap-3 p-3.5">
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl',
          tone === 'warning' ? 'bg-amber-500/12 text-amber-600' : 'bg-brand-500/12 text-brand-600',
        )}
      >
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold text-tg-hint">{label}</p>
        <p className="mt-0.5 truncate text-[17px] font-semibold tabular-nums text-tg-text">{value}</p>
      </div>
    </Card>
  )
}

export interface WalletStatsProps {
  pending: number
  lifetimeSpent: number
  currency: Currency
  className?: string
}

/** Two compact KPI cards under the wallet hero. */
export function WalletStats({ pending, lifetimeSpent, currency, className }: WalletStatsProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-3', className)}>
      <StatCard
        icon={Clock3}
        label="در انتظار"
        value={formatCurrency(pending, currency)}
        tone="warning"
      />
      <StatCard
        icon={TrendingDown}
        label="مجموع هزینه‌ها"
        value={formatCurrency(lifetimeSpent, currency)}
        tone="brand"
      />
    </div>
  )
}
