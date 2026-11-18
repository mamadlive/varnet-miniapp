import { useTelegram } from '@/hooks/useTelegram'
import { fa } from '@/lib/i18n'
import { CATEGORY_LABELS, PRODUCT_CATEGORIES } from '@/lib/productCategories'
import { cn } from '@/lib/utils'
import type { ProductCategory } from '@/types'

const CATEGORY_EMOJI: Partial<Record<ProductCategory, string>> = {
  streaming: '🎬',
  ai: '🤖',
  gaming: '🎮',
  design: '🎨',
  social: '💬',
  other: '📦',
}

export interface CategoryChipsProps {
  value: ProductCategory | 'all'
  onChange: (value: ProductCategory | 'all') => void
  availableCategories: readonly ProductCategory[]
  className?: string
}

/** Horizontally scrollable marketplace category filter. */
export function CategoryChips({ value, onChange, availableCategories, className }: CategoryChipsProps) {
  const { select } = useTelegram()
  const options = PRODUCT_CATEGORIES.filter((category) => availableCategories.includes(category)).map(
    (category) => ({
      value: category,
      label: CATEGORY_LABELS[category],
      emoji: CATEGORY_EMOJI[category] ?? '📦',
    }),
  )

  return (
    <div className={cn('flex w-full items-center gap-2 overflow-hidden', className)} role="group" aria-label="فیلتر بر اساس دسته‌بندی">
      <button
        type="button"
        aria-pressed={value === 'all'}
        onClick={() => {
          select()
          onChange('all')
        }}
        className={cn(
          'flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[13px] font-medium transition-all duration-150 active:scale-[0.96]',
          value === 'all'
            ? 'border-transparent bg-tg-button text-tg-button-text shadow-sm'
            : 'border-tg-separator bg-tg-bg text-tg-text hover:bg-tg-secondary-bg',
        )}
      >
        <span aria-hidden className="text-[15px] leading-none">✨</span>
        {fa.common.all}
      </button>
      <div
        className="hide-scrollbar flex min-w-0 flex-1 flex-nowrap snap-x snap-mandatory gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain py-1 touch-pan-x [-webkit-overflow-scrolling:touch]"
      >
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => {
                select()
                onChange(option.value)
              }}
              className={cn(
                'flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[13px] font-medium transition-all duration-150 active:scale-[0.96]',
                active
                  ? 'border-transparent bg-tg-button text-tg-button-text shadow-sm'
                  : 'border-tg-separator bg-tg-bg text-tg-text hover:bg-tg-secondary-bg',
              )}
            >
              <span aria-hidden className="text-[15px] leading-none">
                {option.emoji}
              </span>
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
