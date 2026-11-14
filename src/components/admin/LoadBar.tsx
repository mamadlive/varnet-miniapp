import type { CSSProperties } from 'react'
import { formatCount } from '@/lib/format'
import { clamp, cn } from '@/lib/utils'

export interface LoadBarProps {
  /** Current utilisation, 0–100. */
  value: number
  /** Optional percentage label rendered on the end side. */
  showValue?: boolean
  className?: string
  trackClassName?: string
}

/** Server load is green while comfortable, amber when busy and rose when hot. */
function loadBarTone(value: number): string {
  if (value < 60) return 'bg-emerald-500'
  if (value < 85) return 'bg-amber-500'
  return 'bg-rose-500'
}

/** Thin capacity meter with threshold colours — shared by dashboard + servers. */
export function LoadBar({ value, showValue = false, className, trackClassName }: LoadBarProps) {
  const percentage = clamp(value, 0, 100)
  const percentageLabel = `${formatCount(Math.round(percentage))}٪`
  const widthStyle: CSSProperties = { width: `${percentage}%` }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-valuenow={Math.round(percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={percentageLabel}
        className={cn('h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-tg-hint/20', trackClassName)}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500 ease-out', loadBarTone(percentage))}
          style={widthStyle}
        />
      </div>
      {showValue ? (
        <span className="w-10 shrink-0 text-end text-[11px] font-medium tabular-nums text-tg-hint">
          {percentageLabel}
        </span>
      ) : null}
    </div>
  )
}
