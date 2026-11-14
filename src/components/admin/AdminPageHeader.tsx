import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface AdminPageHeaderProps {
  title: string
  description?: string
  /** Small context label above the title (e.g. "کاتالوگ"). */
  eyebrow?: string
  /** Extra node rendered next to the eyebrow (counts, status). */
  meta?: ReactNode
  /** End-aligned buttons / chips. */
  actions?: ReactNode
  className?: string
}

/** Consistent page heading for every admin route. */
export function AdminPageHeader({
  title,
  description,
  eyebrow,
  meta,
  actions,
  className,
}: AdminPageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        {(eyebrow || meta) && (
          <div className="flex items-center gap-2.5">
            {eyebrow ? (
              <p className="text-[11px] font-semibold text-tg-hint">{eyebrow}</p>
            ) : null}
            {meta}
          </div>
        )}
        <h1 className="mt-1 text-[26px] font-semibold leading-tight text-tg-text">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-tg-hint">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
