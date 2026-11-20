/**
 * Product type / warranty tags shared by the sync mapper (server) and the
 * storefront cards (client).
 *
 * Provider catalogues distinguish near-identical offers of the same brand with
 * short markers — `Apple Pay`, `CDK`, `No Card`, `Trial Activation`,
 * `Shared Seat`, `Link`, `FW` — and dropping them makes "ChatGPT Plus" and
 * "ChatGPT Plus (Apple Pay)" look like the same product. This module is the
 * single source of truth for recognising and labelling those markers so the
 * persisted title, the product card and the details sheet never disagree.
 */

export interface ProductTagRule {
  /** Lowercase ASCII markers as they appear in the upstream title. */
  tokens: string[]
  /** Persian label shown as a chip and appended to the localized title. */
  label: string
  /**
   * Single-word markers that are too ambiguous to trust outside the short
   * upstream title ("link", "shared", "trial", "fw" also appear in prose).
   */
  titleOnly?: boolean
}

export const PRODUCT_TAG_RULES: readonly ProductTagRule[] = [
  { tokens: ['go'], label: 'Go', titleOnly: true },
  { tokens: ['full warranty'], label: 'گارانتی کامل' },
  { tokens: ['fw'], label: 'گارانتی کامل', titleOnly: true },
  { tokens: ['apple pay'], label: 'اپل پی' },
  { tokens: ['no card', 'without card', 'cardless'], label: 'بدون کارت' },
  { tokens: ['trial activation'], label: 'فعال‌سازی آزمایشی' },
  { tokens: ['trial'], label: 'فعال‌سازی آزمایشی', titleOnly: true },
  { tokens: ['shared seat'], label: 'اشتراکی' },
  { tokens: ['shared'], label: 'اشتراکی', titleOnly: true },
  { tokens: ['cdk', 'cd key'], label: 'CDK' },
  { tokens: ['invite link'], label: 'لینک' },
  { tokens: ['link'], label: 'لینک', titleOnly: true },
]

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[_/|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isAsciiAlphanumeric(code: number): boolean {
  return (code >= 97 && code <= 122) || (code >= 48 && code <= 57)
}

/** Whole-token match: "link" must not fire inside "blinking". */
function containsToken(text: string, token: string): boolean {
  let index = text.indexOf(token)
  while (index !== -1) {
    const before = index === 0 || !isAsciiAlphanumeric(text.charCodeAt(index - 1))
    const end = index + token.length
    const after = end === text.length || !isAsciiAlphanumeric(text.charCodeAt(end))
    if (before && after) return true
    index = text.indexOf(token, index + 1)
  }
  return false
}

/**
 * Recognises the type/warranty markers of an offer.
 *
 * `title` is the raw upstream title; `extra` is optional additional raw text
 * (the verbatim provider description) that only the unambiguous multi-word
 * markers are matched against.
 */
export function extractProductTags(title?: string, extra?: string): string[] {
  if (!title?.trim() && !extra?.trim()) return []

  const titleText = normalize(title ?? '')
  const extraText = normalize(extra ?? '')
  const labels: string[] = []

  for (const rule of PRODUCT_TAG_RULES) {
    if (labels.includes(rule.label)) continue
    const inTitle = titleText !== '' && rule.tokens.some((token) => containsToken(titleText, token))
    const inExtra =
      !rule.titleOnly &&
      extraText !== '' &&
      rule.tokens.some((token) => containsToken(extraText, token))
    if (inTitle || inExtra) labels.push(rule.label)
  }

  return labels
}
