import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const SIZE_CLASSES = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-9',
} as const

export interface SpinnerProps {
  size?: keyof typeof SIZE_CLASSES
  className?: string
  label?: string
}

export function Spinner({ size = 'md', className, label }: SpinnerProps) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-tg-hint', className)} role="status">
      <Loader2 className={cn('animate-spin', SIZE_CLASSES[size])} aria-hidden />
      {label ? <span className="text-[13px] font-medium">{label}</span> : null}
    </span>
  )
}
