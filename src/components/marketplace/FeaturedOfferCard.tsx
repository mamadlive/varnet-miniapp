import type { CSSProperties } from 'react'
import { ShoppingBag, Star } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatCurrency, formatNumber } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { AccountProduct } from '@/types'
import type { PurchaseTarget } from '@/components/marketplace/types'

export interface FeaturedOfferCardProps {
  product: AccountProduct
  onPurchase: (target: PurchaseTarget) => void
  className?: string
  style?: CSSProperties
}

/**
 * Wide, horizontally scrolling card for the «محصولات ویژه» row. Larger artwork
 * and a two-line description make the hand-picked offers stand apart from the
 * dense marketplace grid.
 */
export function FeaturedOfferCard({
  product,
  onPurchase,
  className,
  style,
}: FeaturedOfferCardProps) {
  const soldOut = product.stock <= 0

  return (
    <article
      style={style}
      className={cn(
        'flex w-[262px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-tg-separator bg-tg-bg text-start shadow-sm transition-shadow duration-200 hover:shadow-md',
        className,
      )}
    >
      <div
        className={cn(
          'relative flex h-[104px] shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br',
          product.gradient ?? 'from-brand-500 to-brand-700',
        )}
      >
        <span aria-hidden className="absolute -left-6 -top-8 size-24 rounded-full bg-white/20 blur-2xl" />
        <span aria-hidden className="absolute -bottom-10 -right-4 size-28 rounded-full bg-black/15 blur-2xl" />

        <span aria-hidden className="relative select-none text-[44px] leading-none drop-shadow-lg">
          {product.emoji ?? '✨'}
        </span>

        <Badge
          size="sm"
          tone="warning"
          className="absolute start-2.5 top-2.5 bg-white/90 text-black shadow-sm backdrop-blur"
        >
          {product.badge ?? 'پیشنهاد ویژه'}
        </Badge>

        {product.deliveryTime ? (
          <Badge
            size="sm"
            tone="success"
            className="absolute end-2.5 top-2.5 bg-white/90 text-emerald-700 shadow-sm backdrop-blur"
          >
            {product.deliveryTime}
          </Badge>
        ) : null}

        {soldOut ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[11px] font-semibold text-white">
            {fa.common.soldOut}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-center gap-1.5">
          <h3 dir="auto" className="line-clamp-1 flex-1 text-[14px] font-bold leading-tight text-tg-text">
            {product.title}
          </h3>
          {product.rating !== undefined ? (
            <span className="flex shrink-0 items-center gap-0.5 text-[10.5px] font-medium tabular-nums text-tg-hint">
              <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
              {formatNumber(product.rating)}
            </span>
          ) : null}
        </div>

        <p dir="auto" className="mt-1 line-clamp-2 min-h-[2.6em] text-[11.5px] leading-snug text-tg-hint">
          {product.description ?? product.subtitle}
        </p>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
          <div className="min-w-0">
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
            {!soldOut && product.stock <= 5 ? (
              <span className="text-[10px] font-semibold text-amber-600">
                فقط {formatNumber(product.stock)} عدد
              </span>
            ) : null}
          </div>

          <Button
            size="sm"
            disabled={soldOut}
            onClick={() => onPurchase({ id: product.id, title: product.title })}
            aria-label={`خرید ${product.title}`}
            leftIcon={<ShoppingBag className="size-3.5" aria-hidden />}
            className="h-9 shrink-0 rounded-xl px-3 text-[12px]"
          >
            {fa.common.purchase}
          </Button>
        </div>
      </div>
    </article>
  )
}
