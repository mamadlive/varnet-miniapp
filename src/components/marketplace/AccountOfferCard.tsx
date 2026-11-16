import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Bot, Clapperboard, Gamepad2, Package, Palette, Send, ShoppingBag, Star } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCount, formatCurrency, formatNumber } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { AccountProduct, ProductCategory } from '@/types'
import type { PurchaseTarget } from '@/components/marketplace/types'

/** Category artwork until the backend serves real product images. */
const CATEGORY_ICONS: Record<ProductCategory, LucideIcon> = {
  streaming: Clapperboard,
  ai: Bot,
  gaming: Gamepad2,
  design: Palette,
  social: Send,
  other: Package,
}

export interface AccountOfferCardProps {
  product: AccountProduct
  onPurchase: (target: PurchaseTarget) => void
  className?: string
  style?: CSSProperties
}

/**
 * Premium account offer: gradient artwork tile, title, description, price and a
 * dedicated purchase action that reports the product id upward (the parent is
 * responsible for opening the confirmation sheet).
 */
export function AccountOfferCard({
  product,
  onPurchase,
  className,
  style,
}: AccountOfferCardProps) {
  const Icon = CATEGORY_ICONS[product.category] ?? Package
  const soldOut = product.stock <= 0
  const lowStock = !soldOut && product.stock <= 5

  return (
    <article
      style={style}
      className={cn(
        'flex animate-slide-up flex-col overflow-hidden rounded-2xl border border-tg-separator bg-tg-bg text-start shadow-sm transition-shadow duration-200 hover:shadow-md',
        className,
      )}
    >
      <div
        className={cn(
          'relative flex h-[86px] shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br',
          product.gradient ?? 'from-brand-500 to-brand-700',
        )}
      >
        <span aria-hidden className="absolute -left-4 -top-6 size-20 rounded-full bg-white/20 blur-xl" />
        <span aria-hidden className="absolute -bottom-8 -right-3 size-24 rounded-full bg-black/15 blur-xl" />

        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-white/30 bg-tg-secondary-bg/50 shadow-sm ring-1 ring-white/20 backdrop-blur-md">
          {product.emoji?.trim() ? (
            <span aria-hidden className="emoji-glyph select-none text-[22px] leading-none drop-shadow">
              {product.emoji}
            </span>
          ) : (
            <Icon className="size-5 text-white" aria-hidden />
          )}
        </span>

        {product.badge ? (
          <Badge
            size="sm"
            tone="warning"
            className="absolute start-2 top-2 bg-white/90 text-black shadow-sm"
          >
            {product.badge}
          </Badge>
        ) : null}

        {soldOut ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[11px] font-semibold text-white">
            {fa.common.soldOut}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-2.5">
        <h3
          dir="auto"
          className="line-clamp-1 text-[13.5px] font-semibold leading-tight text-tg-text"
        >
          {product.title}
        </h3>
        <p
          dir="auto"
          className="mt-0.5 line-clamp-2 min-h-[2.1em] text-[11px] leading-snug text-tg-hint"
        >
          {product.description ?? product.subtitle}
        </p>

        <div className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-tg-hint">
          {product.rating !== undefined ? (
            <>
              <Star className="size-2.5 fill-amber-400 text-amber-400" aria-hidden />
              <span className="tabular-nums">{formatNumber(product.rating)}</span>
              <span className="text-tg-hint/50" aria-hidden>
                ·
              </span>
            </>
          ) : null}
          {soldOut ? (
            <span>{fa.common.soldOut}</span>
          ) : lowStock ? (
            <span className="font-semibold text-amber-600">
              فقط {formatCount(product.stock)} عدد
            </span>
          ) : (
            <span>{formatCount(product.stock)} عدد موجود</span>
          )}
        </div>

        <div className="mt-auto pt-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-bold tabular-nums text-tg-text">
              <bdi>{formatCurrency(product.price, product.currency)}</bdi>
            </span>
            {product.oldPrice ? (
              <span className="text-[10px] tabular-nums text-tg-hint line-through">
                <bdi>{formatCurrency(product.oldPrice, product.currency)}</bdi>
              </span>
            ) : null}
          </div>

          <Button
            size="sm"
            fullWidth
            disabled={soldOut}
            onClick={() => onPurchase({ id: product.id, title: product.title })}
            aria-label={`خرید ${product.title}`}
            leftIcon={<ShoppingBag className="size-3.5" aria-hidden />}
            className="mt-1.5 h-9 rounded-xl text-[12px]"
          >
            {fa.common.purchase}
          </Button>
        </div>
      </div>
    </article>
  )
}

/** Loading placeholder matching the offer card layout. */
export function AccountOfferCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-tg-separator bg-tg-bg">
      <Skeleton className="h-[86px] w-full rounded-none" />
      <div className="space-y-2 p-2.5">
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-2.5 w-2/3" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-full rounded-xl" />
      </div>
    </div>
  )
}
