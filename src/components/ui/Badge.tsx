import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'
export type BadgeSize = 'sm' | 'md'

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-black/5 text-tg-hint',
  brand: 'bg-brand-500/12 text-brand-600',
  success: 'bg-emerald-500/12 text-emerald-600',
  warning: 'bg-amber-500/15 text-amber-600',
  danger: 'bg-rose-500/12 text-rose-600',
  info: 'bg-sky-500/12 text-sky-600',
}

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'h-5 gap-1 rounded-md px-1.5 text-[10px]',
  md: 'h-6 gap-1 rounded-lg px-2 text-[11px]',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  size?: BadgeSize
}

export function Badge({ tone = 'neutral', size = 'md', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-semibold',
        TONE_CLASSES[tone],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  )
}
