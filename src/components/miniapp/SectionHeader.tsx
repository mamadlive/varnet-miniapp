import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SectionHeaderProps {
  title: string
  subtitle?: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}

/** Section title with an optional "View all" affordance used across the Mini App. */
export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('mb-2.5 flex items-center justify-between gap-3 px-1', className)}>
      <div className="min-w-0">
        <h2 dir="auto" className="truncate text-[17px] font-semibold text-tg-text">
          {title}
        </h2>
        {subtitle ? (
          <p dir="auto" className="mt-0.5 truncate text-[12px] text-tg-hint">
            {subtitle}
          </p>
        ) : null}
      </div>

      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="-my-2 flex min-h-11 shrink-0 items-center gap-0.5 ps-2 text-[13px] font-medium text-tg-link transition-opacity hover:opacity-80 active:opacity-60"
        >
          {actionLabel}
          {/* In RTL, "forward" points left. */}
          <ChevronLeft className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
