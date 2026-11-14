import { toPersianDigits } from '@/lib/format'
import type { AccountProduct, ProductCategory } from '@/types'

/**
 * Provider catalogue localization.
 *
 * Upstream titles are inconsistent English strings ("Spotify 1M Global",
 * "NETFLIX PREMIUM 30D"). This module turns them into stable Persian copy
 * before anything reaches the Mini App or admin tables. Product ids are never
 * touched, so profit-margin rules keep matching after every sync.
 */

const PERSIAN_RE = /[\u0600-\u06FF]/
const LATIN_RE = /[A-Za-z]/

export const PROVIDER_CATEGORY_LABELS: Record<ProductCategory, string> = {
  streaming: 'استریم و سرگرمی',
  ai: 'هوش مصنوعی',
  gaming: 'گیمینگ',
  design: 'طراحی و خلاقیت',
  social: 'شبکه‌های اجتماعی',
  other: 'سایر محصولات دیجیتال',
}

const CATEGORY_TITLES: Record<ProductCategory, string> = {
  streaming: 'اشتراک استریم',
  ai: 'اشتراک هوش مصنوعی',
  gaming: 'محصول گیمینگ',
  design: 'اشتراک طراحی',
  social: 'اشتراک شبکه اجتماعی',
  other: 'محصول دیجیتال',
}

const CATEGORY_DESCRIPTIONS: Record<ProductCategory, string> = {
  streaming:
    'اشتراک استریم با کیفیت بالا، تحویل فوری و پشتیبانی کامل؛ فعال‌سازی روی حساب شخصی شما انجام می‌شود.',
  ai: 'دسترسی به پیشرفته‌ترین مدل‌های هوش مصنوعی با فعال‌سازی سریع، تحویل فوری و پشتیبانی کامل.',
  gaming: 'محصول گیمینگ اورجینال با تحویل فوری، ضمانت اصالت و پشتیبانی کامل.',
  design: 'ابزارهای طراحی و خلاقیت با دسترسی کامل، تحویل فوری و پشتیبانی فنی.',
  social: 'اشتراک شبکه اجتماعی با فعال‌سازی فوری روی حساب شخصی و پشتیبانی کامل.',
  other: 'محصول دیجیتال اورجینال با تحویل فوری، ضمانت اصالت و پشتیبانی کامل.',
}

const CATEGORY_SUBTITLES: Record<ProductCategory, string> = {
  streaming: 'اشتراک رسمی با تحویل فوری',
  ai: 'دسترسی حرفه‌ای به هوش مصنوعی',
  gaming: 'محصول اورجینال با تحویل فوری',
  design: 'ابزار حرفه‌ای طراحی و خلاقیت',
  social: 'ارتقای حساب با فعال‌سازی فوری',
  other: 'محصول دیجیتال با تحویل فوری',
}

const CATEGORY_FEATURES: Record<ProductCategory, string[]> = {
  streaming: ['تحویل فوری', 'کیفیت بالا', 'پشتیبانی کامل'],
  ai: ['دسترسی اولویت‌دار', 'فعال‌سازی سریع', 'پشتیبانی کامل'],
  gaming: ['کد اورجینال', 'تحویل فوری', 'ضمانت اصالت'],
  design: ['دسترسی کامل', 'تحویل فوری', 'پشتیبانی فنی'],
  social: ['فعال‌سازی فوری', 'حساب شخصی', 'پشتیبانی کامل'],
  other: ['تحویل فوری', 'ضمانت اصالت', 'پشتیبانی کامل'],
}

interface BrandRule {
  aliases: string[]
  name: string
  tier?: string
  category?: ProductCategory
}

const BRANDS: BrandRule[] = [
  {
    aliases: ['netflix'],
    name: 'نتفلیکس',
    category: 'streaming',
  },
  {
    aliases: ['spotify'],
    name: 'اسپاتیفای',
    tier: 'پریمیوم',
    category: 'streaming',
  },
  {
    aliases: ['youtube premium', 'youtube music', 'youtube'],
    name: 'یوتیوب پریمیوم',
    category: 'streaming',
  },
  {
    aliases: ['disney plus', 'disney+', 'disney'],
    name: 'دیزنی پلاس',
    category: 'streaming',
  },
  {
    aliases: ['amazon prime', 'prime video'],
    name: 'آمازون پرایم',
    category: 'streaming',
  },
  {
    aliases: ['hbo max', 'hbo'],
    name: 'اچ‌بی‌او مکس',
    category: 'streaming',
  },
  {
    aliases: ['paramount plus', 'paramount+', 'paramount'],
    name: 'پارامونت پلاس',
    category: 'streaming',
  },
  {
    aliases: ['crunchyroll'],
    name: 'کرانچی‌رول',
    category: 'streaming',
  },
  {
    aliases: ['apple music'],
    name: 'اپل موزیک',
    category: 'streaming',
  },
  {
    aliases: ['twitch'],
    name: 'توییچ',
    category: 'streaming',
  },
  {
    aliases: ['chatgpt', 'chat gpt', 'gpt plus', 'openai'],
    name: 'چت‌جی‌پی‌تی',
    tier: 'پلاس',
    category: 'ai',
  },
  {
    aliases: ['claude', 'anthropic'],
    name: 'کلود',
    category: 'ai',
  },
  {
    aliases: ['midjourney'],
    name: 'میدجرنی',
    category: 'ai',
  },
  {
    aliases: ['perplexity'],
    name: 'پرپلکسیتی',
    category: 'ai',
  },
  {
    aliases: ['gemini', 'google ai'],
    name: 'جمینای',
    category: 'ai',
  },
  {
    aliases: ['steam wallet', 'steam gift card', 'steam'],
    name: 'استیم والت',
    category: 'gaming',
  },
  {
    aliases: ['playstation plus', 'playstation network', 'psn', 'ps plus', 'playstation'],
    name: 'پلی‌استیشن پلاس',
    category: 'gaming',
  },
  {
    aliases: ['xbox game pass', 'xbox live', 'xbox'],
    name: 'ایکس‌باکس',
    category: 'gaming',
  },
  {
    aliases: ['nintendo'],
    name: 'نینتندو',
    category: 'gaming',
  },
  {
    aliases: ['discord nitro', 'discord'],
    name: 'دیسکورد نیترو',
    category: 'gaming',
  },
  {
    aliases: ['adobe creative cloud', 'creative cloud', 'adobe'],
    name: 'ادوبی کریتیو کلود',
    category: 'design',
  },
  {
    aliases: ['canva'],
    name: 'کانوا',
    category: 'design',
  },
  {
    aliases: ['figma'],
    name: 'فیگما',
    category: 'design',
  },
  {
    aliases: ['capcut'],
    name: 'کپ‌کات',
    category: 'design',
  },
  {
    aliases: ['telegram premium', 'telegram'],
    name: 'تلگرام پریمیوم',
    category: 'social',
  },
  {
    aliases: ['instagram', 'meta verified'],
    name: 'اینستاگرام',
    category: 'social',
  },
  {
    aliases: ['twitter', 'x premium'],
    name: 'ایکس پریمیوم',
    category: 'social',
  },
  {
    aliases: ['linkedin'],
    name: 'لینکدین',
    category: 'social',
  },
  {
    aliases: ['snapchat'],
    name: 'اسنپ‌چت',
    category: 'social',
  },
  {
    aliases: ['microsoft 365', 'office 365', 'microsoft office', 'microsoft'],
    name: 'مایکروسافت ۳۶۵',
    category: 'other',
  },
  {
    aliases: ['icloud', 'apple one'],
    name: 'آی‌کلاد',
    category: 'other',
  },
  {
    aliases: ['nordvpn'],
    name: 'نورد وی‌پی‌ان',
    category: 'other',
  },
  {
    aliases: ['expressvpn'],
    name: 'اکسپرس وی‌پی‌ان',
    category: 'other',
  },
  {
    aliases: ['grammarly'],
    name: 'گرامرلی',
    category: 'other',
  },
  {
    aliases: ['duolingo'],
    name: 'دولینگو',
    category: 'other',
  },
  {
    aliases: ['google play', 'google one'],
    name: 'گوگل پلی',
    category: 'other',
  },
  {
    aliases: ['zoom'],
    name: 'زوم',
    category: 'other',
  },
]

const BRAND_ALIASES = BRANDS.flatMap((brand) =>
  brand.aliases.map((alias) => ({ alias, brand })),
).sort((a, b) => b.alias.length - a.alias.length)

const TIER_RULES: Array<{ tokens: string[]; label: string }> = [
  { tokens: ['ultimate'], label: 'اولتیمیت' },
  { tokens: ['premium', 'prem'], label: 'پریمیوم' },
  { tokens: ['family'], label: 'خانوادگی' },
  { tokens: ['business'], label: 'تجاری' },
  { tokens: ['standard'], label: 'استاندارد' },
  { tokens: ['individual'], label: 'فردی' },
  { tokens: ['personal'], label: 'شخصی' },
  { tokens: ['student'], label: 'دانشجویی' },
  { tokens: ['duo'], label: 'دو نفره' },
  { tokens: ['basic'], label: 'پایه' },
  { tokens: ['plus'], label: 'پلاس' },
  { tokens: ['pro'], label: 'پرو' },
  { tokens: ['lite'], label: 'لایت' },
  { tokens: ['free'], label: 'رایگان' },
  { tokens: ['lifetime'], label: 'مادام‌العمر' },
  { tokens: ['trial'], label: 'آزمایشی' },
]

const KIND_RULES: Array<{ tokens: string[]; label: string }> = [
  { tokens: ['gift card', 'giftcard', 'voucher'], label: 'گیفت‌کارت' },
  { tokens: ['wallet top up', 'top up', 'wallet'], label: 'کیف پول' },
  { tokens: ['license key', 'activation key', 'cd key', 'product key', 'key'], label: 'کد فعال‌سازی' },
  { tokens: ['subscription', 'membership', 'plan'], label: 'اشتراک' },
  { tokens: ['account', 'profile'], label: 'اکانت' },
]

const REGION_RULES: Array<{ tokens: string[]; label: string; global?: boolean }> = [
  { tokens: ['worldwide', 'all regions', 'global'], label: '', global: true },
  { tokens: ['turkey', 'turkish'], label: 'ترکیه' },
  { tokens: ['argentina'], label: 'آرژانتین' },
  { tokens: ['brazil'], label: 'برزیل' },
  { tokens: ['canada'], label: 'کانادا' },
  { tokens: ['germany'], label: 'آلمان' },
  { tokens: ['france'], label: 'فرانسه' },
  { tokens: ['united kingdom', 'uk', 'england'], label: 'انگلیس' },
  { tokens: ['united states', 'usa', 'us'], label: 'آمریکا' },
  { tokens: ['europe'], label: 'اروپا' },
  { tokens: ['india'], label: 'هند' },
  { tokens: ['japan'], label: 'ژاپن' },
  { tokens: ['uae', 'emirates'], label: 'امارات' },
  { tokens: ['egypt'], label: 'مصر' },
  { tokens: ['nigeria'], label: 'نیجریه' },
  { tokens: ['pakistan'], label: 'پاکستان' },
]

const PHRASE_RULES: Array<[string, string]> = [
  ['delivery within 24 hours', 'تحویل کمتر از ۲۴ ساعت'],
  ['delivery within 1 hour', 'تحویل کمتر از ۱ ساعت'],
  ['instant activation', 'فعال‌سازی فوری'],
  ['instant delivery', 'تحویل فوری'],
  ['immediate delivery', 'تحویل فوری'],
  ['lifetime access', 'دسترسی مادام‌العمر'],
  ['private profile', 'پروفایل اختصاصی'],
  ['personal account', 'حساب شخصی'],
  ['shared account', 'اکانت اشتراکی'],
  ['full warranty', 'گارانتی کامل'],
  ['with warranty', 'همراه با گارانتی'],
  ['offline download', 'دانلود آفلاین'],
  ['4k ultra hd', '۴K اولترا اچ‌دی'],
  ['ultra hd', 'اولترا اچ‌دی'],
  ['high quality', 'کیفیت بالا'],
  ['no ads', 'بدون تبلیغ'],
  ['ad free', 'بدون تبلیغ'],
  ['ad-free', 'بدون تبلیغ'],
  ['renewable', 'قابل تمدید'],
  ['activation', 'فعال‌سازی'],
  ['subscription', 'اشتراک'],
  ['account', 'اکانت'],
  ['gift card', 'گیفت‌کارت'],
  ['support 24/7', 'پشتیبانی ۲۴ ساعته'],
  ['support', 'پشتیبانی'],
  ['instant', 'فوری'],
  ['immediate', 'فوری'],
  ['worldwide', 'جهانی'],
  ['global', 'جهانی'],
  ['lifetime', 'مادام‌العمر'],
  ['warranty', 'گارانتی'],
  ['premium', 'پریمیوم'],
  ['plus', 'پلاس'],
  ['pro', 'پرو'],
]

const WORD_RULES: Array<[string, string]> = [
  ['with', 'همراه با'],
  ['and', 'و'],
  ['for', 'برای'],
  ['on', 'روی'],
  ['in', 'در'],
  ['to', ''],
  ['of', ''],
  ['the', ''],
  ['your', 'شخصی'],
  ['you', 'شما'],
  ['all', 'همه'],
  ['apps', 'برنامه‌ها'],
  ['app', 'برنامه'],
  ['months', 'ماه'],
  ['month', 'ماه'],
  ['days', 'روز'],
  ['day', 'روز'],
  ['years', 'سال'],
  ['year', 'سال'],
  ['hours', 'ساعت'],
  ['hour', 'ساعت'],
  ['minutes', 'دقیقه'],
  ['minute', 'دقیقه'],
  ['devices', 'دستگاه‌ها'],
  ['device', 'دستگاه'],
  ['users', 'کاربران'],
  ['user', 'کاربر'],
  ['streaming', 'استریم'],
  ['music', 'موسیقی'],
  ['videos', 'ویدیوها'],
  ['video', 'ویدیو'],
  ['movies', 'فیلم‌ها'],
  ['movie', 'فیلم'],
  ['games', 'بازی‌ها'],
  ['game', 'بازی'],
  ['storage', 'فضای ذخیره‌سازی'],
  ['quality', 'کیفیت'],
  ['unlimited', 'نامحدود'],
  ['access', 'دسترسی'],
  ['official', 'رسمی'],
  ['original', 'اورجینال'],
  ['secure', 'امن'],
  ['fast', 'سریع'],
  ['new', 'جدید'],
]

const BADGE_RULES: Array<[string, string]> = [
  ['best seller', 'پرفروش‌ترین'],
  ['bestseller', 'پرفروش‌ترین'],
  ['top rated', 'برترین'],
  ['popular', 'محبوب'],
  ['trending', 'پرطرفدار'],
  ['hot', 'پرطرفدار'],
  ['limited', 'محدود'],
  ['exclusive', 'اختصاصی'],
  ['on sale', 'تخفیف‌دار'],
  ['sale', 'تخفیف‌دار'],
  ['deal', 'پیشنهاد ویژه'],
  ['new', 'جدید'],
]

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text)
}

function matchBrand(text: string): BrandRule | undefined {
  return BRAND_ALIASES.find(({ alias }) => hasToken(text, alias))?.brand
}

function matchTiers(text: string): string[] {
  return TIER_RULES.filter((rule) =>
    rule.tokens.some((token) => hasToken(text, token)),
  ).map((rule) => rule.label)
}

const TITLE_EXTRAS: Array<{ tokens: string[]; label: string }> = [
  { tokens: ['all apps', 'all applications'], label: 'همه برنامه‌ها' },
  { tokens: ['api credits', 'api credit'], label: 'اعتبار API' },
]

function matchTitleExtra(text: string): string | undefined {
  return TITLE_EXTRAS.find((entry) => entry.tokens.some((token) => hasToken(text, token)))?.label
}

function matchKind(text: string): string | undefined {
  return KIND_RULES.find((rule) => rule.tokens.some((token) => hasToken(text, token)))?.label
}

function matchRegion(text: string): string | undefined {
  const rule = REGION_RULES.find((entry) =>
    entry.tokens.some((token) => hasToken(text, token)),
  )
  return rule?.global ? undefined : rule?.label
}

/** `1M`, `30 days`, `12 months`, `1 year` → «۱ ماهه» / «۳۰ روزه» / «۱ ساله». */
function parseDuration(text: string): string | undefined {
  const years = text.match(/(\d+)\s*(?:years?|yrs?|y)\b/)
  if (years) return `${toPersianDigits(years[1]!)} ساله`

  const months = text.match(/(\d+)\s*(?:months?|mon|mo|m)\b/)
  if (months) {
    const count = Number(months[1])
    if (count === 12) return '۱ ساله'
    if (count > 12 && count % 12 === 0) return `${toPersianDigits(String(count / 12))} ساله`
    return `${toPersianDigits(months[1]!)} ماهه`
  }

  const days = text.match(/(\d+)\s*(?:days?|d)\b/)
  if (days) {
    const count = Number(days[1])
    if (count === 30) return '۱ ماهه'
    if (count === 365 || count === 360) return '۱ ساله'
    return `${toPersianDigits(days[1]!)} روزه`
  }

  return undefined
}

function parseAmount(text: string): string | undefined {
  const dollar = text.match(/\$\s*(\d+(?:\.\d+)?)/) ??
    text.match(/(\d+(?:\.\d+)?)\s*(?:usd|dollars?|dollar)\b/)
  return dollar ? `${toPersianDigits(dollar[1]!)} دلاری` : undefined
}

function localizeTitle(raw: string, category: ProductCategory): string {
  if (!raw.trim()) return CATEGORY_TITLES[category]
  if (PERSIAN_RE.test(raw) && !LATIN_RE.test(raw)) return raw.trim()

  const text = normalize(raw)
  const brand = matchBrand(text)
  const tiers = matchTiers(text)
  // "YouTube Premium Family" implies Premium in the brand name; keep Family.
  const explicitTier = tiers.find((tier) => !brand?.name.includes(tier)) ?? tiers[0]
  const tier = explicitTier ?? brand?.tier
  const extra = matchTitleExtra(text)
  const duration = parseDuration(text)
  const region = matchRegion(text)
  const amount = parseAmount(text)

  const parts: string[] = []
  if (brand) {
    parts.push(brand.name)
    if (tier && !brand.name.includes(tier)) parts.push(tier)
  } else {
    parts.push(matchKind(text) ?? CATEGORY_TITLES[category])
    if (tier) parts.push(tier)
  }

  if (extra) parts.push(extra)
  if (duration) parts.push(duration)
  if (region) parts.push(region)
  if (amount) parts.push(amount)

  return parts.join(' ')
}

function replaceTerm(text: string, source: string, target: string): string {
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const startsAlphanumeric = /^[a-z0-9]/i.test(source)
  const endsAlphanumeric = /[a-z0-9]$/i.test(source)
  const prefix = startsAlphanumeric ? '(^|[^a-z0-9])' : ''
  const suffix = endsAlphanumeric ? '(?=$|[^a-z0-9])' : ''

  if (prefix) {
    return text.replace(new RegExp(`${prefix}${escaped}${suffix}`, 'gi'), `$1${target}`)
  }
  return text.replace(new RegExp(`${escaped}${suffix}`, 'gi'), target)
}

function replacePhrases(raw: string): string {
  let result = raw
  for (const { alias, brand } of BRAND_ALIASES) result = replaceTerm(result, alias, brand.name)
  for (const [source, target] of PHRASE_RULES) result = replaceTerm(result, source, target)
  for (const [source, target] of WORD_RULES) result = replaceTerm(result, source, target)

  const normalized = result
    .replace(/\s*[,|]\s*/g, ' · ')
    .replace(/^\s*·\s*/, '')
    .replace(/\s*·\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()

  return toPersianDigits(normalized)
}

function localizeSubtitle(raw: string | undefined, category: ProductCategory): string {
  if (raw?.trim()) {
    if (PERSIAN_RE.test(raw) && !LATIN_RE.test(raw)) return raw.trim()

    const translated = replacePhrases(raw)
    if (PERSIAN_RE.test(translated) && !LATIN_RE.test(translated)) return translated
  }

  return CATEGORY_SUBTITLES[category]
}

function localizeDescription(
  raw: string | undefined,
  category: ProductCategory,
  title: string,
): string {
  if (raw?.trim() && PERSIAN_RE.test(raw) && !LATIN_RE.test(raw)) return raw.trim()

  if (raw?.trim()) {
    const translated = replacePhrases(raw)
    if (PERSIAN_RE.test(translated) && !LATIN_RE.test(translated)) return translated
  }

  return `${title}؛ ${CATEGORY_DESCRIPTIONS[category]}`
}

function localizeFeatures(
  raw: string[] | undefined,
  category: ProductCategory,
): string[] {
  const translated = (raw ?? [])
    .map((feature) => {
      if (PERSIAN_RE.test(feature) && !LATIN_RE.test(feature)) return feature.trim()
      const next = replacePhrases(feature)
      return PERSIAN_RE.test(next) && !LATIN_RE.test(next) ? next : null
    })
    .filter((feature): feature is string => feature !== null && feature.length > 0)

  const unique = Array.from(new Set(translated))
  if (unique.length >= 2) return unique.slice(0, 6)
  return Array.from(new Set([...unique, ...CATEGORY_FEATURES[category]])).slice(0, 6)
}

function localizeBadge(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined
  if (PERSIAN_RE.test(raw) && !LATIN_RE.test(raw)) return raw.trim()

  const text = normalize(raw)
  const exact = BADGE_RULES.find(([source]) => source === text)
  if (exact) return exact[1]

  const partial = BADGE_RULES.find(([source]) => text.includes(source))
  if (partial) return partial[1]

  const translated = replacePhrases(raw)
  return PERSIAN_RE.test(translated) && !LATIN_RE.test(translated) ? translated : undefined
}

function localizeDeliveryTime(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined
  if (PERSIAN_RE.test(raw) && !LATIN_RE.test(raw)) return raw.trim()

  const text = normalize(raw)
  if (/instant|immediate|within minutes|minutes/.test(text)) {
    const minutes = text.match(/(\d+)\s*(?:minutes?|mins?)/)
    return minutes ? `کمتر از ${toPersianDigits(minutes[1]!)} دقیقه` : 'فوری'
  }
  const hours = text.match(/(\d+)\s*(?:hours?|hrs?)/)
  if (hours) return `کمتر از ${toPersianDigits(hours[1]!)} ساعت`
  const days = text.match(/(\d+)\s*(?:days?|business days?)/)
  if (days) return `${toPersianDigits(days[1]!)} روز کاری`
  if (/same day|today/.test(text)) return 'همان روز'

  return undefined
}

/** Localize every customer-facing field of one provider product. */
export function localizeProviderProduct(product: AccountProduct): AccountProduct {
  const title = localizeTitle(product.title, product.category)

  return {
    ...product,
    title,
    subtitle: localizeSubtitle(product.subtitle, product.category),
    description: localizeDescription(product.description, product.category, title),
    features: localizeFeatures(product.features, product.category),
    badge: localizeBadge(product.badge),
    deliveryTime: localizeDeliveryTime(product.deliveryTime),
  }
}
