import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-tg-button text-tg-button-text shadow-sm hover:brightness-105 active:scale-[0.985] active:brightness-95',
  secondary:
    'border border-tg-separator bg-tg-bg text-tg-text hover:bg-tg-secondary-bg active:scale-[0.985]',
  ghost: 'bg-transparent text-tg-text hover:bg-black/5 active:bg-black/10',
  outline:
    'border border-tg-button/40 bg-transparent text-tg-button hover:bg-tg-button/10 active:scale-[0.985]',
  destructive: 'bg-tg-destructive text-white shadow-sm hover:brightness-105 active:scale-[0.985]',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 rounded-xl px-3 text-[13px]',
  md: 'h-11 gap-2 rounded-xl px-4 text-[15px]',
  lg: 'h-13 gap-2 rounded-2xl px-5 text-base',
  icon: 'size-10 rounded-xl',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
}

/** Theme-aware button. Colours follow the Telegram theme CSS variables. */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center font-medium transition-all duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  )
}
