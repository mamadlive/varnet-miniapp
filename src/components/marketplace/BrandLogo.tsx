import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { AccountProduct } from '@/types'

const SIZES = {
  sm: 'size-9',
  md: 'size-10',
  lg: 'size-12',
} as const

export interface BrandLogoProps {
  product: Pick<AccountProduct, 'title' | 'logoUrl' | 'emoji'>
  size?: keyof typeof SIZES
  /** Shown when the product has neither a logo nor an emoji. */
  fallback?: ReactNode
  emojiClassName?: string
  className?: string
}

/** Secondary icon host (DuckDuckGo) tried when the primary logo fails. */
function secondaryLogoUrl(src: string): string | undefined {
  const domain = /[?&]domain=([^&]+)/.exec(src)?.[1]
  return domain
    ? `https://icons.duckduckgo.com/ip3/${decodeURIComponent(domain)}.ico`
    : undefined
}

/**
 * Glass circle carrying the brand's real logo. Image hosts can fail (offline,
 * blocked CDN, missing domain), so failures are tracked per URL — each source
 * is tried once — and the container degrades to the dictionary emoji or the
 * caller-provided icon.
 */
export function BrandLogo({
  product,
  size = 'md',
  fallback,
  emojiClassName,
  className,
}: BrandLogoProps) {
  const [failed, setFailed] = useState<Record<string, true>>({})
  const primary = product.logoUrl?.trim()
  const candidates = primary
    ? [primary, secondaryLogoUrl(primary)].filter((url): url is string => Boolean(url))
    : []
  const active = candidates.find((url) => !failed[url])

  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        SIZES[size],
        className,
      )}
    >
      {active ? (
        <img
          key={active}
          src={active}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain p-1"
          onError={() => setFailed((prev) => ({ ...prev, [active]: true }))}
        />
      ) : product.emoji?.trim() ? (
        <span
          aria-hidden
          className={cn('emoji-glyph select-none text-[22px] leading-none drop-shadow', emojiClassName)}
        >
          {product.emoji}
        </span>
      ) : (
        (fallback ?? <span aria-hidden className="emoji-glyph text-[22px] leading-none">📦</span>)
      )}
    </span>
  )
}
