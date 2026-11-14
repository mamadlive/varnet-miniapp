import { Badge } from '@/components/ui/Badge'
import type { BadgeTone } from '@/components/ui'
import type { OrderKind, OrderStatus, ProductCategory, UserRole, VpnServerStatus } from '@/types'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const ORDER_STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  pending: 'warning',
  paid: 'info',
  provisioning: 'brand',
  completed: 'success',
  cancelled: 'neutral',
  refunded: 'danger',
}

const VPN_STATUS_TONES: Record<VpnServerStatus, BadgeTone> = {
  online: 'success',
  degraded: 'warning',
  maintenance: 'info',
  offline: 'danger',
  coming_soon: 'neutral',
}

const ROLE_TONES: Record<UserRole, BadgeTone> = {
  admin: 'brand',
  user: 'neutral',
}

const CATEGORY_TONES: Record<ProductCategory, BadgeTone> = {
  streaming: 'danger',
  ai: 'brand',
  gaming: 'info',
  design: 'warning',
  social: 'success',
  other: 'neutral',
}

const KIND_TONES: Record<OrderKind, BadgeTone> = {
  account: 'brand',
  vpn: 'info',
}

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Badge tone={ORDER_STATUS_TONES[status]} className={className}>
      {fa.orderStatuses[status]}
    </Badge>
  )
}

export function VpnStatusBadge({ status, className }: { status: VpnServerStatus; className?: string }) {
  return (
    <Badge tone={VPN_STATUS_TONES[status]} className={className}>
      {fa.vpnStatuses[status]}
    </Badge>
  )
}

export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
  return (
    <Badge tone={ROLE_TONES[role]} className={className}>
      {fa.roles[role]}
    </Badge>
  )
}

export function CategoryBadge({ category, className }: { category: ProductCategory; className?: string }) {
  return (
    <Badge tone={CATEGORY_TONES[category]} className={className}>
      {fa.categories[category]}
    </Badge>
  )
}

export function OrderKindBadge({ kind, className }: { kind: OrderKind; className?: string }) {
  return (
    <Badge tone={KIND_TONES[kind]} className={className}>
      {fa.orderKinds[kind]}
    </Badge>
  )
}

const VPN_DOT_CLASSES: Record<VpnServerStatus, string> = {
  online: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  maintenance: 'bg-sky-500',
  offline: 'bg-rose-500',
  coming_soon: 'bg-tg-hint/40',
}

/** Small colour-coded presence dot (online nodes gently pulse). */
export function StatusDot({ status, className }: { status: VpnServerStatus; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        VPN_DOT_CLASSES[status],
        status === 'online' && 'animate-pulse-soft',
        className,
      )}
    />
  )
}
