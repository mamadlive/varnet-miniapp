import { Badge } from '@/components/ui/Badge'
import type { BadgeTone } from '@/components/ui/Badge'
import { fa } from '@/lib/i18n'
import type { OrderStatus } from '@/types'

/** Single place where an order status maps to a colour + Persian label. */
const STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  pending: 'warning',
  paid: 'info',
  provisioning: 'warning',
  completed: 'success',
  cancelled: 'neutral',
  refunded: 'danger',
}

export interface OrderStatusBadgeProps {
  status: OrderStatus
  size?: 'sm' | 'md'
  className?: string
}

/** Theme-aware badge for `OrderStatus` (completed/success, paid/info, …). */
export function OrderStatusBadge({ status, size = 'sm', className }: OrderStatusBadgeProps) {
  return (
    <Badge tone={STATUS_TONES[status]} size={size} className={className}>
      {fa.orderStatuses[status]}
    </Badge>
  )
}
