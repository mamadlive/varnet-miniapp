import { toFlagEmoji } from '@/components/miniapp/flags'
import { cn } from '@/lib/utils'

export interface CountryFlagProps {
  countryCode: string
  className?: string
  title?: string
}

export function CountryFlag({ countryCode, className, title }: CountryFlagProps) {
  return (
    <span
      role="img"
      aria-label={title ?? countryCode.toUpperCase()}
      title={title}
      className={cn('inline-block select-none leading-none', className)}
    >
      {toFlagEmoji(countryCode)}
    </span>
  )
}
