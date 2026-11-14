import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  icon?: LucideIcon
  trailing?: ReactNode
  wrapperClassName?: string
}

/** Theme-aware text input with optional leading icon and validation message. */
export function Input({
  label,
  hint,
  error,
  icon: Icon,
  trailing,
  wrapperClassName,
  className,
  id,
  ...rest
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className={cn('space-y-1.5', wrapperClassName)}>
      {label ? (
        <label htmlFor={inputId} className="block text-[13px] font-medium text-tg-hint">
          {label}
        </label>
      ) : null}

      <div
        className={cn(
          'flex h-11 items-center gap-2 rounded-xl border bg-tg-bg px-3 transition-colors',
          error
            ? 'border-tg-destructive focus-within:border-tg-destructive'
            : 'border-tg-separator focus-within:border-brand-500',
        )}
      >
        {Icon ? <Icon className="size-4 shrink-0 text-tg-hint" aria-hidden /> : null}
        <input
          id={inputId}
          className={cn(
            'h-full w-full min-w-0 bg-transparent text-[15px] text-tg-text outline-none placeholder:text-tg-hint/80',
            className,
          )}
          {...rest}
        />
        {trailing}
      </div>

      {error ? (
        <p className="text-[12px] font-medium text-tg-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-tg-hint">{hint}</p>
      ) : null}
    </div>
  )
}
