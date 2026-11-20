import { useState } from 'react'
import { toFlagEmoji } from '@/components/miniapp/flags'
import { cn } from '@/lib/utils'

export interface CountryFlagProps {
  countryCode: string
  className?: string
  title?: string
}

/**
 * Flag artwork for a node's ISO 3166-1 alpha-2 code.
 *
 * A real flag image is drawn instead of the bare flag emoji: Windows ships no
 * regional-indicator glyphs, so `🇩🇪` degrades to the raw `DE` letters on
 * desktop Telegram. The image is sized in `em`, so call sites keep controlling
 * its size with `text-*` utilities; unknown codes and image failures fall back
 * to the emoji (then to the globe).
 */

const SVG_CDN = 'https://cdn.jsdelivr.net/npm/flag-icons@7.2.3/flags/4x3'
const PNG_CDN = 'https://flagcdn.com/w80'

type FlagSource = 'svg' | 'png' | 'emoji'

export function CountryFlag({ countryCode, className, title }: CountryFlagProps) {
  const code = countryCode.trim().toLowerCase()
  const [source, setSource] = useState<FlagSource>('svg')

  if (!/^[a-z]{2}$/.test(code) || source === 'emoji') {
    return (
      <span
        role="img"
        aria-label={title ?? countryCode.trim().toUpperCase()}
        title={title}
        className={cn('inline-block select-none leading-none', className)}
      >
        {toFlagEmoji(code)}
      </span>
    )
  }

  const src = source === 'svg' ? `${SVG_CDN}/${code}.svg` : `${PNG_CDN}/${code}.png`

  return (
    <img
      src={src}
      alt={title ?? code.toUpperCase()}
      title={title}
      loading="lazy"
      decoding="async"
      onError={() => setSource(source === 'svg' ? 'png' : 'emoji')}
      className={cn('inline-block shrink-0 object-cover ring-1 ring-black/10', className)}
      style={{ width: '1.35em', height: '1em', borderRadius: '0.14em' }}
    />
  )
}
