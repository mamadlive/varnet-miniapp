import { cn } from '@/lib/utils'

export type FilterTabsVariant = 'pill' | 'segmented'

export interface FilterTabOption<T extends string> {
  value: T
  label: string
}

export interface FilterTabsProps<T extends string> {
  options: ReadonlyArray<FilterTabOption<T>>
  value: T
  onChange: (value: T) => void
  variant?: FilterTabsVariant
  ariaLabel?: string
  className?: string
}

/**
 * Horizontal filter control used by the wallet transaction feed and the order
 * history. `pill` scrolls horizontally for long status lists, `segmented` is a
 * compact Telegram-style switch for a handful of categories.
 */
export function FilterTabs<T extends string>({
  options,
  value,
  onChange,
  variant = 'pill',
  ariaLabel,
  className,
}: FilterTabsProps<T>) {
  const isSegmented = variant === 'segmented'

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        isSegmented
          ? 'flex gap-1 rounded-2xl border border-tg-separator bg-tg-secondary-bg p-1'
          : 'no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex shrink-0 items-center justify-center font-medium transition-colors duration-150',
              isSegmented ? 'h-10 flex-1 rounded-xl px-2 text-[12.5px]' : 'h-11 rounded-full border px-3.5 text-[13px]',
              isSegmented
                ? active
                  ? 'bg-tg-bg text-tg-text shadow-sm'
                  : 'text-tg-hint hover:text-tg-text'
                : active
                  ? 'border-transparent bg-tg-button text-tg-button-text shadow-sm'
                  : 'border-tg-separator bg-tg-bg text-tg-hint hover:text-tg-text',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
