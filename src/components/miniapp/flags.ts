/** Regional-indicator offset: 'A' -> 0x1F1E6 (🇦). */
const REGIONAL_INDICATOR_A = 0x1f1e6

/**
 * Render a country flag emoji from an ISO 3166-1 alpha-2 code.
 * Backends send `countryCode`; artwork is emoji-only until the CDN is ready.
 */
export function toFlagEmoji(countryCode: string): string {
  const code = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return '🌐'
  return String.fromCodePoint(
    ...Array.from(code, (character) => REGIONAL_INDICATOR_A + character.charCodeAt(0) - 65),
  )
}
