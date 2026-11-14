import { useTelegram } from '@/hooks/useTelegram'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { ProductCategory } from '@/types'

interface CategoryOption {
  value: ProductCategory | 'all'
  label: string
  emoji: string
}

const CATEGORY_OPTIONS: CategoryOption[] = [
  { value: 'all', label: fa.common.all, emoji: '✨' },
  { value: 'streaming', label: fa.categories.streaming, emoji: '🎬' },
  { value: 'ai', label: fa.categories.ai, emoji: '🤖' },
  { value: 'gaming', label: fa.categories.gaming, emoji: '🎮' },
  { value: 'design', label: fa.categories.design, emoji: '🎨' },
  { value: 'social', label: fa.categories.social, emoji: '💬' },
  { value: 'other', label: fa.categories.other, emoji: '📦' },
]

export interface CategoryChipsProps {
  value: ProductCategory | 'all'
  onChange: (value: ProductCategory | 'all') => void
  className?: string
}

/** Horizontally scrollable marketplace category filter. */
export function CategoryChips({ value, onChange, className }: CategoryChipsProps) {
  const { select } = useTelegram()

  return (
    <div
      role="group"
      aria-label="فیلتر بر اساس دسته‌بندی"
      className={cn('no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1', className)}
    >
      {CATEGORY_OPTIONS.map((option) => {
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
              'flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium transition-all duration-150 active:scale-[0.96]',
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
  )
}
