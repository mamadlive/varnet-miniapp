import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type CardVariant = 'surface' | 'muted' | 'brand' | 'glass'

const VARIANT_CLASSES: Record<CardVariant, string> = {
  surface: 'border border-tg-separator bg-tg-bg shadow-sm',
  muted: 'border border-tg-separator/60 bg-tg-secondary-bg',
  brand: 'border border-brand-400/30 bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/20',
  glass: 'border border-white/15 bg-white/10 backdrop-blur-xl',
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  interactive?: boolean
  padded?: boolean
}

/** Rounded surface used for every block in both the Mini App and admin panel. */
export function Card({
  variant = 'surface',
  interactive = false,
  padded = true,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl',
        VARIANT_CLASSES[variant],
        padded && 'p-4',
        interactive &&
          'cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.99]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
