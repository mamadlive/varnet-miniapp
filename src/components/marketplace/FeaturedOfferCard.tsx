import type { CSSProperties } from 'react'
import { ShoppingBag, Star } from 'lucide-react'
import { BrandLogo } from '@/components/marketplace/BrandLogo'
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
 * App-store style showcase card for the «محصولات ویژه» row: a gradient hero
 * carries the brand's real logo (emoji fallback) beside the title, while the
 * price and purchase action sit in a frosted-glass tray.
 */
export function FeaturedOfferCard({
  product,
  onPurchase,
  className,
  style,
}: FeaturedOfferCardProps) {
  const soldOut = product.stock <= 0
  const lowStock = !soldOut && product.stock <= 5
  const subtitle = product.subtitle?.trim()

  return (
    <article
      style={style}
      className={cn(
        'group relative flex w-[262px] shrink-0 snap-start flex-col overflow-hidden rounded-[22px] border border-tg-separator bg-tg-bg text-start shadow-[0_12px_28px_-18px_rgba(15,23,42,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-18px_rgba(15,23,42,0.55)]',
        className,
      )}
    >
      <div
        className={cn(
          'relative isolate overflow-hidden bg-gradient-to-br p-3.5 text-white',
          product.gradient ?? 'from-brand-500 to-brand-700',
        )}
      >
        <span aria-hidden className="absolute -left-10 -top-12 size-32 rounded-full bg-white/25 blur-2xl" />
        <span aria-hidden className="absolute -bottom-16 -right-8 size-36 rounded-full bg-black/25 blur-2xl" />
        {/* Contrast scrim keeps the white typography legible on light gradients. */}
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />

        <div className="relative flex items-start justify-between gap-2">
          <span className="inline-flex h-6 items-center rounded-full border border-white/30 bg-white/20 px-2.5 text-[10px] font-semibold text-white shadow-sm backdrop-blur-md">
            {product.badge ?? 'پیشنهاد ویژه'}
          </span>
          {product.deliveryTime ? (
            <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-white/25 bg-black/20 px-2.5 text-[10px] font-medium text-white/95 backdrop-blur-md">
              {product.deliveryTime}
            </span>
          ) : null}
        </div>

        <div className="relative mt-3 flex items-center gap-2.5">
          <BrandLogo
            product={product}
            size="lg"
            className="border-white/35 bg-white/20 shadow-lg shadow-black/15 ring-white/30"
            emojiClassName="text-[24px]"
          />
          <div className="min-w-0">
            <h3
              dir="auto"
              className="line-clamp-2 min-h-[2.6em] text-[17px] font-extrabold leading-[1.3] drop-shadow-sm"
            >
              {product.title}
            </h3>
            {subtitle ? (
              <p
                dir="auto"
                className="mt-0.5 line-clamp-1 text-[11px] font-medium text-white/75"
              >
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        <div className="relative mt-3 flex items-center justify-between gap-2 rounded-2xl border border-white/25 bg-white/15 py-1.5 pe-1.5 ps-3 shadow-lg shadow-black/10 backdrop-blur-xl">
          <div className="min-w-0">
            <span className="block text-[9px] font-semibold text-white/70">شروع قیمت</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[15.5px] font-extrabold tabular-nums text-white">
                <bdi>{formatCurrency(product.price, product.currency)}</bdi>
              </span>
              {product.oldPrice ? (
                <span className="text-[10px] tabular-nums text-white/55 line-through">
                  <bdi>{formatCurrency(product.oldPrice, product.currency)}</bdi>
                </span>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            disabled={soldOut}
            onClick={() => onPurchase({ id: product.id, title: product.title })}
            aria-label={`خرید ${product.title}`}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/35 bg-white/25 px-3 text-[12px] font-bold text-white shadow-sm backdrop-blur-md transition-all duration-150 hover:bg-white/35 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ShoppingBag className="size-3.5" aria-hidden />
            {soldOut ? fa.common.soldOut : fa.common.purchase}
          </button>
        </div>

        {soldOut ? (
          <span className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 text-[12px] font-bold text-white backdrop-blur-[2px]">
            {fa.common.soldOut}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <p dir="auto" className="line-clamp-2 min-h-[2.6em] text-[11.5px] leading-snug text-tg-hint">
          {product.description ?? subtitle}
        </p>

        <div className="mt-auto flex items-center gap-2 pt-2 text-[10.5px] font-medium text-tg-hint">
          {product.rating !== undefined ? (
            <>
              <span className="flex items-center gap-1 text-tg-text">
                <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                <span className="tabular-nums">{formatNumber(product.rating)}</span>
              </span>
              <span className="text-tg-hint/40" aria-hidden>
                ·
              </span>
            </>
          ) : null}
          {lowStock ? (
            <span className="font-semibold text-amber-600">
              فقط {formatNumber(product.stock)} عدد
            </span>
          ) : (
            <span>
              {soldOut ? fa.common.soldOut : `${formatNumber(product.stock)} عدد موجود`}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
