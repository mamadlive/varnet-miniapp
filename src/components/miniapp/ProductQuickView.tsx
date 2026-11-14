import { useState } from 'react'
import { Check, Info, Star, Wallet, Zap } from 'lucide-react'
import { Badge, Button, Sheet } from '@/components/ui'
import { useTelegram } from '@/hooks/useTelegram'
import { formatCount, formatCurrency, formatNumber } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { AccountProduct } from '@/types'

export interface ProductQuickViewProps {
  product: AccountProduct
  onClose: () => void
  /**
   * Purchase affordance. When provided, the CTA hands the product to the parent
   * (which opens the shared `PurchaseConfirmSheet`); otherwise the sheet keeps
   * its local demo selection.
   */
  onPurchase?: (product: AccountProduct) => void
}

/**
 * Bottom-sheet product preview. Checkout is intentionally not wired to the
 * order API yet, so the CTA either opens the shared purchase confirmation sheet
 * or confirms the selection locally in demo mode.
 */
export function ProductQuickView({ product, onClose, onPurchase }: ProductQuickViewProps) {
  const { haptic, notify } = useTelegram()
  const [selected, setSelected] = useState(false)

  const outOfStock = product.stock <= 0
  const features = product.features ?? []
  const categoryLabel = fa.categories[product.category]

  const handleSelect = () => {
    if (onPurchase) {
      onPurchase(product)
      return
    }
    haptic('medium')
    notify('success')
    setSelected(true)
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
              : `پرداخت از کیف پول · ${formatCurrency(product.price, product.currency)}`}
          </Button>
          <p className="text-center text-[11px] text-tg-hint">
            موجودی کیف پول هنگام پرداخت بررسی می‌شود. تحویل بلافاصله پس از پرداخت انجام می‌شود.
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
          <span aria-hidden className="select-none text-[56px] leading-none drop-shadow">
            {product.emoji ?? '📦'}
          </span>
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

        {product.description ? (
          <p dir="auto" className="text-[13px] leading-relaxed text-tg-hint">
            {product.description}
          </p>
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

        {selected ? (
          <div className="flex animate-fade-in items-start gap-2 rounded-xl border border-tg-separator bg-tg-bg p-3">
            <Info className="mt-0.5 size-4 shrink-0 text-tg-link" aria-hidden />
            <p className="text-[12px] leading-relaxed text-tg-text">
              نسخه نمایشی — پرداختی انجام نشد. در نسخه بعدی، پرداخت به سرویس کیف پول متصل می‌شود.
            </p>
          </div>
        ) : null}
      </div>
    </Sheet>
  )
}
