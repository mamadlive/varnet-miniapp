import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/** Consistent "nothing here yet" block for lists, tables and feeds. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-10 text-center', className)}>
      {Icon ? (
        <span className="flex size-14 items-center justify-center rounded-2xl bg-tg-secondary-bg text-tg-hint">
          <Icon className="size-6" aria-hidden />
        </span>
      ) : null}
      <div className="space-y-1">
        <p className="text-[15px] font-semibold text-tg-text">{title}</p>
        {description ? <p className="max-w-xs text-[13px] text-tg-hint">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}
