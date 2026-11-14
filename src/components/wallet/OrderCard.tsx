import type { KeyboardEvent } from 'react'
import { ChevronLeft, Package, Shield } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { OrderStatusBadge } from '@/components/wallet/OrderStatusBadge'
import { formatCount, formatCurrency, formatDateTime } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { Order } from '@/types'

export interface OrderCardProps {
  order: Order
  /** When provided the card becomes an interactive button (opens details). */
  onSelect?: (order: Order) => void
  className?: string
}

/** Compact order summary used in the Mini App order history. */
export function OrderCard({ order, onSelect, className }: OrderCardProps) {
  const KindIcon = order.kind === 'vpn' ? Shield : Package
  const itemCount = order.items.length
  const summary = order.items.map((item) => item.title).join(' · ') || 'اقلام سفارش'

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onSelect) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(order)
    }
  }

  return (
    <Card
      variant="surface"
      padded={false}
      interactive={Boolean(onSelect)}
      role={onSelect ? 'button' : undefined}
      aria-label={onSelect ? `جزئیات سفارش ${order.id}` : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect ? () => onSelect(order) : undefined}
      onKeyDown={onSelect ? handleKeyDown : undefined}
      className={cn('overflow-hidden', className)}
    >
      <div className="flex items-start gap-3 p-4">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            order.kind === 'vpn' ? 'bg-sky-500/12 text-sky-600' : 'bg-brand-500/12 text-brand-600',
          )}
        >
          <KindIcon className="size-[18px]" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="bidi-ltr truncate font-mono text-[13px] font-semibold text-tg-text">
              #{order.id}
            </p>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="mt-1 line-clamp-2 text-[13.5px] leading-snug text-tg-text">{summary}</p>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-tg-hint">
            <span>{formatCount(itemCount)} مورد</span>
            <span aria-hidden>·</span>
            <span>{formatDateTime(order.createdAt)}</span>
          </div>
        </div>

        {onSelect ? (
          <ChevronLeft className="mt-2 size-4 shrink-0 text-tg-hint" aria-hidden />
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-tg-separator bg-tg-secondary-bg/60 px-4 py-2.5">
        <Badge tone={order.kind === 'vpn' ? 'info' : 'brand'} size="sm">
          {fa.orderKinds[order.kind]}
        </Badge>
        <p className="text-[15px] font-semibold tabular-nums text-tg-text">
          {formatCurrency(order.total, order.currency)}
        </p>
      </div>
    </Card>
  )
}
