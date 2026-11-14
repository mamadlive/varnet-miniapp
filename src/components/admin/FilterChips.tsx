import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface FilterChipOption<T extends string = string> {
  value: T
  label: string
  count?: number
}

export interface FilterChipsProps<T extends string = string> {
  options: FilterChipOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Accessible group label, e.g. "فیلتر بر اساس وضعیت". */
  label?: string
  className?: string
}

/** Segmented, brand-tinted filter chips used by product + order tables. */
export function FilterChips<T extends string = string>({
  options,
  value,
  onChange,
  label,
  className,
}: FilterChipsProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium transition-colors',
              active
                ? 'border-brand-500/40 bg-brand-500/10 text-brand-600'
                : 'border-tg-separator bg-tg-bg text-tg-hint hover:bg-tg-secondary-bg hover:text-tg-text',
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums',
                  active ? 'bg-brand-500/15 text-brand-600' : 'bg-tg-secondary-bg text-tg-hint',
                )}
              >
                {formatCount(option.count)}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
