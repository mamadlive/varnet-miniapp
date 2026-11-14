import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface StatCardProps {
  label: string
  value: string
  icon: LucideIcon
  /** Tailwind classes overriding the icon tile tone. */
  iconClassName?: string
  /** Percentage change vs. the previous period (positive = growth). */
  trend?: number
  /** Custom badge, e.g. "۳ از ۴ آنلاین" when a trend is not available. */
  badge?: ReactNode
  hint?: string
  loading?: boolean
  className?: string
}

function TrendBadge({ change }: { change: number }) {
  const isUp = change >= 0
  return (
    <Badge tone={isUp ? 'success' : 'danger'}>
      {isUp ? (
        <ArrowUpRight className="size-3 -scale-x-100" aria-hidden />
      ) : (
        <ArrowDownRight className="size-3 -scale-x-100" aria-hidden />
      )}
      {isUp ? '+' : '−'}
      {formatNumber(Math.abs(change), { notation: 'standard', maximumFractionDigits: 1 })}٪
    </Badge>
  )
}

/** KPI tile used in the dashboard's top row. */
export function StatCard({
  label,
  value,
  icon: Icon,
  iconClassName,
  trend,
  badge,
  hint,
  loading = false,
  className,
}: StatCardProps) {
  return (
    <Card className={cn('p-5', className)}>
      {loading ? (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="size-10 rounded-xl" />
          </div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-5 w-28" />
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-semibold text-tg-hint">{label}</p>
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600',
                iconClassName,
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
          </div>
          <p className="mt-3 text-[27px] font-semibold leading-none text-tg-text tabular-nums">
            {value}
          </p>
          <div className="mt-4 flex min-h-5 items-center gap-2">
            {badge ?? (trend === undefined ? null : <TrendBadge change={trend} />)}
            {hint ? <span className="text-[11.5px] text-tg-hint">{hint}</span> : null}
          </div>
        </>
      )}
    </Card>
  )
}
