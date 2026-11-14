import { cn } from '@/lib/utils'

export interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Accessible name, e.g. «فعال‌سازی کد VARNET20». */
  label: string
  disabled?: boolean
  className?: string
}

/** Telegram-style toggle that is direction-aware in the RTL admin. */
export function Switch({ checked, onCheckedChange, label, disabled = false, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-brand-500' : 'bg-tg-hint/30',
        className,
      )}
    >
      <span
        className={cn(
          'absolute start-0.5 size-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'ltr:translate-x-4 rtl:-translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  )
}
