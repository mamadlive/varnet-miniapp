import { Star } from 'lucide-react'
import { BrandLogo } from '@/components/marketplace/BrandLogo'
import { Badge, Skeleton } from '@/components/ui'
import { formatCount, formatCurrency, formatNumber } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { extractProductTags } from '@/lib/productTags'
import { cn } from '@/lib/utils'
import type { AccountProduct } from '@/types'

export interface ProductCardProps {
  product: AccountProduct
  onSelect?: (product: AccountProduct) => void
  className?: string
}

/**
 * Marketplace product tile: gradient artwork with the real brand logo (emoji
 * fallback), price, rating and stock.
 */
export function ProductCard({ product, onSelect, className }: ProductCardProps) {
  const outOfStock = product.stock <= 0
  const lowStock = !outOfStock && product.stock <= 5
  const typeTags = extractProductTags(product.providerTitle ?? product.title).slice(0, 2)

  return (
    <button
      type="button"
      onClick={() => onSelect?.(product)}
      aria-label={`مشاهده ${product.title}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-2xl border border-tg-separator bg-tg-bg text-start shadow-sm transition-all duration-150',
        'hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.975] active:shadow-none',
        outOfStock && 'opacity-80',
        className,
      )}
    >
      <div
        className={cn(
          'relative flex aspect-[5/4] w-full items-center justify-center overflow-hidden bg-gradient-to-br bg-tg-secondary-bg',
          product.gradient ?? 'from-brand-500 to-brand-700',
        )}
      >
        <span aria-hidden className="absolute -left-5 -top-7 size-24 rounded-full bg-white/15 blur-xl" />
        <span aria-hidden className="absolute -bottom-9 -right-5 size-28 rounded-full bg-black/10 blur-xl" />
        <BrandLogo
          product={product}
          className="border border-white/30 bg-tg-secondary-bg/50 shadow-sm ring-1 ring-white/20 backdrop-blur-md"
        />

        {product.badge ? (
          <Badge
            tone="warning"
            size="sm"
            className="absolute start-2 top-2 bg-white/90 text-black shadow-sm backdrop-blur"
          >
            {product.badge}
          </Badge>
        ) : null}

        {typeTags.length > 0 ? (
          <span className="absolute end-2 top-2 flex max-w-[75%] flex-wrap justify-end gap-1">
            {typeTags.map((tag) => (
              <Badge
                key={tag}
                tone="neutral"
                size="sm"
                className="bg-white/90 text-black shadow-sm backdrop-blur"
              >
                {tag}
              </Badge>
            ))}
          </span>
        ) : null}

        {product.rating !== undefined ? (
          <span className="absolute bottom-2 start-2 flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            <Star className="size-3 fill-amber-300 text-amber-300" aria-hidden />
            <span className="tabular-nums">{formatNumber(product.rating)}</span>
          </span>
        ) : null}

        {lowStock ? (
          <span className="absolute bottom-2 end-2 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            فقط {formatCount(product.stock)} عدد
          </span>
        ) : null}

        {outOfStock ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[12px] font-semibold text-white">
            {fa.common.soldOut}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <p dir="auto" className="line-clamp-1 text-[13px] font-semibold text-tg-text">
          {product.title}
        </p>
        {product.subtitle ? (
          <p dir="auto" className="line-clamp-1 text-[11px] text-tg-hint">
            {product.subtitle}
          </p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-1.5 pt-1.5">
          <p className="flex min-w-0 items-baseline gap-1">
            <span className="text-[15px] font-bold text-tg-text">
              <bdi>{formatCurrency(product.price, product.currency)}</bdi>
            </span>
            {product.oldPrice ? (
              <span className="truncate text-[11px] text-tg-hint line-through">
                <bdi>{formatCurrency(product.oldPrice, product.currency)}</bdi>
              </span>
            ) : null}
          </p>
          {product.reviewCount ? (
            <span className="shrink-0 text-[10px] text-tg-hint">
              {formatNumber(product.reviewCount)} نظر
            </span>
          ) : null}
        </div>
      </div>
    </button>
  )
}

/** Loading placeholder matching the product card layout. */
export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-tg-separator bg-tg-bg shadow-sm">
      <Skeleton className="aspect-[5/4] w-full rounded-none" />
      <div className="space-y-2 p-2.5">
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-2.5 w-3/5" />
        <div className="flex items-center justify-between pt-1.5">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-2.5 w-8" />
        </div>
      </div>
    </div>
  )
}
