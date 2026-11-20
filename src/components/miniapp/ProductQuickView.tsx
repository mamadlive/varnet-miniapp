import { Check, FileText, Star, StickyNote, Wallet, Zap } from 'lucide-react'
import { BrandLogo } from '@/components/marketplace/BrandLogo'
import { Badge, Button, Sheet } from '@/components/ui'
import { useTelegram } from '@/hooks/useTelegram'
import { formatCount, formatCurrency, formatNumber } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { CATEGORY_LABELS } from '@/lib/productCategories'
import { cn } from '@/lib/utils'
import type { AccountProduct } from '@/types'

export interface ProductQuickViewProps {
  product: AccountProduct
  onClose: () => void
  /** Hands the product to the parent, which opens the shared `PurchaseConfirmSheet`. */
  onPurchase: (product: AccountProduct) => void
}

/**
 * Bottom-sheet product preview. The CTA forwards the product to the parent,
 * which opens `PurchaseConfirmSheet` — the only place a wallet debit can start.
 */
export function ProductQuickView({ product, onClose, onPurchase }: ProductQuickViewProps) {
  const { haptic } = useTelegram()

  const outOfStock = product.stock <= 0
  const features = product.features ?? []
  const categoryLabel = CATEGORY_LABELS[product.customCategory ?? product.category]
  const description = product.faDescription?.trim() || product.description
  const providerDescription =
    !product.faDescription?.trim() && product.providerDescription && product.providerDescription !== description
      ? product.providerDescription
      : undefined

  const handleSelect = () => {
    haptic('medium')
    onPurchase(product)
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={product.title}
      description={product.subtitle}
      className="max-h-[90dvh] overflow-y-auto"
      footer={
        <div className="space-y-2">
          <Button
            fullWidth
            size="lg"
            variant={outOfStock ? 'secondary' : 'primary'}
            disabled={outOfStock}
            leftIcon={<Wallet className="size-4" aria-hidden />}
            onClick={handleSelect}
          >
            {outOfStock
              ? fa.common.soldOut
              : `ادامه خرید · ${formatCurrency(product.price, product.currency)}`}
          </Button>
          <p className="text-center text-[11px] text-tg-hint">
            در مرحله بعد روش پرداخت را انتخاب کنید.
          </p>
        </div>
      }
    >
      <div className="space-y-4">
        <div
          className={cn(
            'relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br',
            product.gradient ?? 'from-brand-500 to-brand-700',
          )}
        >
          <span aria-hidden className="absolute -left-6 -top-8 size-32 rounded-full bg-white/15 blur-2xl" />
          <span aria-hidden className="absolute -bottom-10 -right-6 size-32 rounded-full bg-black/10 blur-2xl" />
          <BrandLogo
            product={product}
            size="2xl"
            emojiClassName="text-[44px]"
            className="relative border border-white/30 bg-tg-secondary-bg/50 shadow-md ring-1 ring-white/20 backdrop-blur-md"
          />
          {product.badge ? (
            <Badge
              tone="warning"
              size="sm"
              className="absolute start-3 top-3 bg-white/90 text-black shadow-sm backdrop-blur"
            >
              {product.badge}
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[12px] text-tg-hint">
          {product.rating !== undefined ? (
            <span className="flex items-center gap-1 font-medium text-tg-text">
              <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
              <span className="tabular-nums">{formatNumber(product.rating)}</span>
              {product.reviewCount ? (
                <span className="font-normal text-tg-hint">
                  ({formatNumber(product.reviewCount)} نظر)
                </span>
              ) : null}
            </span>
          ) : null}
          <span aria-hidden>·</span>
          <span>{categoryLabel}</span>
          {product.deliveryTime ? (
            <Badge tone="success" size="sm" className="ms-auto">
              <Zap className="size-3" aria-hidden />
              {product.deliveryTime}
            </Badge>
          ) : null}
        </div>

        {description ? (
          <p dir="auto" className="whitespace-pre-line text-[13px] leading-relaxed text-tg-hint">
            {description}
          </p>
        ) : null}

        {product.adminNote ? (
          <div className="rounded-xl border border-brand-500/25 bg-brand-500/5 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-brand-600">
              <StickyNote className="size-3.5" aria-hidden />
              توضیحات تکمیلی
            </p>
            <p
              dir="auto"
              className="whitespace-pre-line text-[12.5px] leading-relaxed text-tg-text"
            >
              {product.adminNote}
            </p>
          </div>
        ) : null}

        {features.length > 0 ? (
          <ul className="grid gap-1.5">
            {features.map((feature) => (
              <li
                key={feature}
                dir="auto"
                className="flex items-start gap-2 text-[13px] text-tg-text"
              >
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600">
                  <Check className="size-2.5" aria-hidden />
                </span>
                {feature}
              </li>
            ))}
          </ul>
        ) : null}

        {providerDescription ? (
          <details className="group rounded-xl border border-tg-separator bg-tg-bg">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-tg-hint [&::-webkit-details-marker]:hidden">
              <FileText className="size-3.5 shrink-0" aria-hidden />
              توضیحات ارائه‌دهنده (متن اصلی)
            </summary>
            <p
              dir="auto"
              className="max-h-48 overflow-y-auto whitespace-pre-line px-3 pb-3 text-[12px] leading-relaxed text-tg-hint"
            >
              {providerDescription}
            </p>
          </details>
        ) : null}

        <div className="flex items-center justify-between rounded-xl bg-tg-secondary-bg px-3 py-2.5">
          <span className="text-[12px] text-tg-hint">موجودی</span>
          <span
            className={cn(
              'text-[12px] font-semibold',
              outOfStock ? 'text-tg-destructive' : 'text-tg-text',
            )}
          >
            {outOfStock ? fa.common.soldOut : `${formatCount(product.stock)} عدد موجود`}
          </span>
        </div>

      </div>
    </Sheet>
  )
}
