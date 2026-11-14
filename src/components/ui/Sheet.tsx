import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

/**
 * Mobile-first bottom sheet (Telegram-style). No portal: rendered in place with
 * a fixed overlay, so it works inside the Mini App viewport on any screen.
 */
export function Sheet({ open, onClose, title, description, children, footer, className }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="بستن"
        onClick={onClose}
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full animate-slide-up rounded-t-3xl bg-tg-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-3xl',
          className,
        )}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-tg-hint/30" />
        {title ? (
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-tg-text">{title}</h2>
              {description ? <p className="mt-1 text-[13px] text-tg-hint">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="بستن"
              className="flex size-8 items-center justify-center rounded-full bg-tg-secondary-bg text-tg-hint transition-colors hover:text-tg-text"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}
        {children}
        {footer ? <div className="mt-5">{footer}</div> : null}
      </div>
    </div>
  )
}
