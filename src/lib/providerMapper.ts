import { toPersianDigits } from '@/lib/format'
import type { AccountProduct, ProductCategory } from '@/types'

/**
 * Provider catalogue localization.
 *
 * Upstream titles are inconsistent English strings ("Spotify 1M Global",
 * "NETFLIX PREMIUM 30D", "Claude 50M"). This module turns them into stable
 * Persian copy, brand emojis and gradients before anything reaches the Mini App
 * or admin tables. Product ids are never touched, so profit-margin rules keep
 * matching after every sync.
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
    'اشتراک استریم با کیفیت بالا؛ تماشای فیلم و سریال روی تلویزیون، موبایل و مرورگر با فعال‌سازی روی حساب شخصی.',
  ai: 'اشتراک پرمیوم هوش مصنوعی برای تولید متن و کد، تحلیل داده و افزایش سرعت کار؛ فعال‌سازی سریع روی حساب شخصی.',
  gaming:
    'محصول گیمینگ اورجینال برای خرید بازی، اعتبار درون‌بازی و اشتراک آنلاین؛ تحویل فوری با ضمانت اصالت.',
  design:
    'نرم‌افزار قدرتمند طراحی و گرافیک برای ساخت تصویر، ویدیو و رابط کاربری؛ دسترسی کامل با تحویل فوری.',
  social:
    'اشتراک شبکه اجتماعی با فعال‌سازی فوری روی حساب شخصی و امکانات ویژه مانند تیک آبی و ابزارهای حرفه‌ای.',
  other:
    'محصول دیجیتال اورجینال با لایسنس معتبر، تحویل فوری و پشتیبانی کامل؛ مناسب استفاده شخصی و حرفه‌ای.',
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

/** Artwork used when the provider sends no brand-specific emoji. */
const CATEGORY_STYLE: Record<ProductCategory, { emoji: string; gradient: string }> = {
  streaming: { emoji: '🎬', gradient: 'from-rose-500 via-red-500 to-orange-500' },
  ai: { emoji: '🤖', gradient: 'from-violet-500 via-purple-500 to-indigo-500' },
  gaming: { emoji: '🎮', gradient: 'from-sky-500 via-blue-500 to-indigo-500' },
  design: { emoji: '🎨', gradient: 'from-fuchsia-500 via-pink-500 to-rose-500' },
  social: { emoji: '✈️', gradient: 'from-sky-400 via-cyan-400 to-blue-500' },
  other: { emoji: '💻', gradient: 'from-brand-500 to-brand-700' },
}

const GENERIC_GRADIENTS = new Set(Object.values(CATEGORY_STYLE).map((style) => style.gradient))

const VPN_BLURB = 'VPN پرسرعت با رمزنگاری قوی برای تغییر موقعیت و حفظ حریم خصوصی.'
const ANTIVIRUS_BLURB = 'آنتی‌ویروس و امنیت دستگاه در برابر ویروس، باج‌گیر و تهدیدهای آنلاین.'
const PASSWORD_BLURB = 'مدیریت امن رمزهای عبور و داده‌های حساس روی همه دستگاه‌ها.'

interface BrandRule {
  aliases: string[]
  /** Stable identifier used by storefront curation (e.g. «محصولات ویژه»). */
  key?: string
  name: string
  category: ProductCategory
  emoji: string
  tier?: string
  gradient?: string
  /** Persian one-liner used when the upstream description is missing or unusable. */
  blurb?: string
}

/**
 * Brand dictionary. Aliases are matched as whole tokens (longest alias wins),
 * so «adobe photoshop» is preferred over «adobe» and «youtube music» over
 * «youtube».
 */
const BRANDS: BrandRule[] = [
  /* ------------------------------- Streaming ------------------------------ */
  {
    aliases: ['netflix', 'نتفلیکس'],
    key: 'netflix',
    name: 'نتفلیکس',
    category: 'streaming',
    emoji: '🎬',
    gradient: 'from-red-600 via-rose-600 to-neutral-900',
    blurb: 'پخش فیلم و سریال با کیفیت ۴K روی تلویزیون، موبایل و مرورگر.',
  },
  {
    aliases: ['spotify', 'اسپاتیفای'],
    key: 'spotify',
    name: 'اسپاتیفای',
    tier: 'پریمیوم',
    category: 'streaming',
    emoji: '🎧',
    gradient: 'from-emerald-500 via-green-500 to-neutral-900',
    blurb: 'پخش موسیقی و پادکست بدون تبلیغ همراه با دانلود آفلاین.',
  },
  {
    aliases: ['youtube premium', 'youtube red', 'یوتیوب پریمیوم'],
    key: 'youtube-premium',
    name: 'یوتیوب پریمیوم',
    category: 'streaming',
    emoji: '▶️',
    gradient: 'from-red-500 via-red-600 to-rose-700',
    blurb: 'تماشای یوتیوب بدون تبلیغ با پخش پس‌زمینه و دانلود آفلاین.',
  },
  {
    aliases: ['youtube music', 'یوتیوب موزیک'],
    name: 'یوتیوب موزیک',
    category: 'streaming',
    emoji: '🎵',
    blurb: 'پخش موسیقی و پادکست یوتیوب بدون تبلیغ.',
  },
  {
    aliases: ['youtube', 'یوتیوب'],
    name: 'یوتیوب',
    category: 'streaming',
    emoji: '▶️',
    blurb: 'تماشای ویدیوهای یوتیوب بدون تبلیغ با پخش پس‌زمینه.',
  },
  {
    aliases: ['disney plus', 'disney+', 'disney', 'دیزنی پلاس'],
    key: 'disney-plus',
    name: 'دیزنی پلاس',
    category: 'streaming',
    emoji: '🏰',
    gradient: 'from-blue-600 via-indigo-600 to-purple-700',
    blurb: 'فیلم‌ها و سریال‌های دیزنی، پیکسار، مارول و استار وارز.',
  },
  {
    aliases: ['amazon prime', 'prime video', 'amazon', 'آمازون پرایم', 'آمازون'],
    name: 'آمازون پرایم',
    category: 'streaming',
    emoji: '📦',
    gradient: 'from-sky-500 via-blue-600 to-cyan-500',
    blurb: 'اشتراک آمازون شامل پرایم ویدیو، موزیک و ارسال رایگان.',
  },
  {
    aliases: ['hbo max', 'hbo', 'اچ‌بی‌او مکس', 'اچ بی او مکس'],
    name: 'اچ‌بی‌او مکس',
    category: 'streaming',
    emoji: '🎭',
    gradient: 'from-purple-600 via-violet-700 to-neutral-900',
    blurb: 'سریال‌ها و فیلم‌های اچ‌بی‌او و برادران وارنر.',
  },
  {
    aliases: ['paramount plus', 'paramount+', 'paramount', 'پارامونت پلاس'],
    name: 'پارامونت پلاس',
    category: 'streaming',
    emoji: '⛰️',
    blurb: 'فیلم‌ها و سریال‌های پارامونت، سی‌بی‌اس و شوتایم.',
  },
  {
    aliases: ['crunchyroll'],
    name: 'کرانچی‌رول',
    category: 'streaming',
    emoji: '🍥',
    gradient: 'from-orange-500 via-amber-500 to-rose-500',
    blurb: 'تماشای انیمه و سریال‌های ژاپنی با زیرنویس.',
  },
  {
    aliases: ['apple tv plus', 'apple tv+', 'apple tv', 'اپل تی‌وی'],
    name: 'اپل تی‌وی',
    category: 'streaming',
    emoji: '🍎',
    blurb: 'سریال‌ها و فیلم‌های اختصاصی اپل تی‌وی پلاس.',
  },
  {
    aliases: ['apple music', 'اپل موزیک'],
    name: 'اپل موزیک',
    category: 'streaming',
    emoji: '🎵',
    blurb: 'استریم موسیقی بدون تبلیغ با کیفیت Lossless و Spatial Audio.',
  },
  {
    aliases: ['apple', 'اپل'],
    name: 'اپل',
    category: 'other',
    emoji: '🍎',
    blurb: 'دسترسی به سرویس‌ها و محصولات دیجیتال اپل.',
  },
  {
    aliases: ['hulu', 'هولو'],
    name: 'هولو',
    category: 'streaming',
    emoji: '💚',
    blurb: 'سریال‌ها و فیلم‌های هولو، اف‌ایکس و شبکه‌های آمریکایی.',
  },
  {
    aliases: ['peacock'],
    name: 'پیکاک',
    category: 'streaming',
    emoji: '🦚',
    blurb: 'سریال‌ها و فیلم‌های پیکاک و ان‌بی‌سی.',
  },
  {
    aliases: ['starz'],
    name: 'استارز',
    category: 'streaming',
    emoji: '⭐',
    blurb: 'فیلم‌ها و سریال‌های اورجینال استارز.',
  },
  {
    aliases: ['showtime'],
    name: 'شوتایم',
    category: 'streaming',
    emoji: '🎪',
    blurb: 'سریال‌ها و فیلم‌های شوتایم.',
  },
  {
    aliases: ['tidal'],
    name: 'تایدال',
    category: 'streaming',
    emoji: '🌊',
    blurb: 'استریم موسیقی با کیفیت بالا و صدای بدون افت.',
  },
  {
    aliases: ['deezer'],
    name: 'دیزر',
    category: 'streaming',
    emoji: '🎶',
    blurb: 'پخش موسیقی و پادکست بدون تبلیغ.',
  },
  {
    aliases: ['audible'],
    name: 'آدیبل',
    category: 'streaming',
    emoji: '🎙️',
    blurb: 'کتاب صوتی و پادکست با دسترسی نامحدود.',
  },
  {
    aliases: ['kindle unlimited', 'kindle'],
    name: 'کیندل',
    category: 'streaming',
    emoji: '📖',
    blurb: 'کتابخانه دیجیتال با میلیون‌ها کتاب و مجله.',
  },
  {
    aliases: ['shahid'],
    name: 'شاهد',
    category: 'streaming',
    emoji: '📽️',
    blurb: 'فیلم و سریال عربی و نمایش خانگی.',
  },
  {
    aliases: ['filimo'],
    name: 'فیلیمو',
    category: 'streaming',
    emoji: '🍿',
    blurb: 'تماشای فیلم و سریال ایرانی و خارجی.',
  },
  {
    aliases: ['namava'],
    name: 'نماوا',
    category: 'streaming',
    emoji: '🎥',
    blurb: 'سرویس نمایش خانگی فیلم و سریال.',
  },
  {
    aliases: ['osn'],
    name: 'او‌اس‌ان',
    category: 'streaming',
    emoji: '📺',
    blurb: 'فیلم و سریال هالیوودی و عربی.',
  },
  {
    aliases: ['starzplay'],
    name: 'استارزپلی',
    category: 'streaming',
    emoji: '🌟',
    blurb: 'سریال‌ها و فیلم‌های استریم خاورمیانه.',
  },
  {
    aliases: ['tod tv', 'tod'],
    name: 'تاد',
    category: 'streaming',
    emoji: '🏟️',
    blurb: 'پخش زنده مسابقات ورزشی و فیلم و سریال.',
  },
  {
    aliases: ['anghami'],
    name: 'انغامی',
    category: 'streaming',
    emoji: '🎼',
    blurb: 'استریم موسیقی عربی و بین‌المللی.',
  },
  {
    aliases: ['rakuten viki', 'viki'],
    name: 'ویکی',
    category: 'streaming',
    emoji: '🌏',
    blurb: 'سریال‌های آسیایی با زیرنویس چندزبانه.',
  },
  {
    aliases: ['mubi'],
    name: 'موبی',
    category: 'streaming',
    emoji: '🎟️',
    blurb: 'فیلم‌های هنری و جشنواره‌ای منتخب.',
  },
  {
    aliases: ['discovery plus', 'discovery+', 'discovery'],
    name: 'دیسکاوری پلاس',
    category: 'streaming',
    emoji: '🌍',
    blurb: 'مستندهای طبیعت، علم و سبک زندگی.',
  },
  {
    aliases: ['britbox'],
    name: 'بریت‌باکس',
    category: 'streaming',
    emoji: '🇬🇧',
    blurb: 'سریال‌های بریتانیایی بی‌بی‌سی و آی‌تی‌وی.',
  },
  {
    aliases: ['zee5', 'zee 5'],
    name: 'زی۵',
    category: 'streaming',
    emoji: '🟣',
    blurb: 'فیلم و سریال هندی و بولیوود.',
  },
  {
    aliases: ['iqiyi'],
    name: 'آی‌چی‌یی',
    category: 'streaming',
    emoji: '🀄',
    blurb: 'فیلم و سریال چینی و آسیایی.',
  },
  {
    aliases: ['wetv', 'we tv'],
    name: 'وی‌تی‌وی',
    category: 'streaming',
    emoji: '🐉',
    blurb: 'درام‌ها و برنامه‌های چینی با زیرنویس.',
  },
  {
    aliases: ['tubi'],
    name: 'توبی',
    category: 'streaming',
    emoji: '🎞️',
    blurb: 'فیلم و سریال رایگان با تبلیغات محدود.',
  },
  {
    aliases: ['vix'],
    name: 'ویکس',
    category: 'streaming',
    emoji: '🌶️',
    blurb: 'فیلم و سریال اسپانیایی‌زبان.',
  },
  {
    aliases: ['twitch'],
    name: 'توییچ',
    category: 'streaming',
    emoji: '📡',
    gradient: 'from-violet-500 via-purple-600 to-indigo-700',
    blurb: 'پخش زنده بازی و دنبال کردن استریمرها.',
  },
  {
    aliases: ['kick'],
    name: 'کیک',
    category: 'streaming',
    emoji: '🟩',
    blurb: 'پلتفرم پخش زنده بازی و سرگرمی.',
  },

  /* ----------------------------- Artificial AI ---------------------------- */
  {
    aliases: ['chatgpt', 'chat gpt', 'gpt plus', 'openai', 'چت‌جی‌پی‌تی', 'چت جی پی تی'],
    key: 'chatgpt',
    name: 'چت‌جی‌پی‌تی',
    tier: 'پلاس',
    category: 'ai',
    emoji: '🤖',
    gradient: 'from-emerald-400 via-teal-500 to-cyan-600',
    blurb: 'اشتراک پرمیوم هوش مصنوعی برای تولید متن و کد و پاسخ به پرسش‌ها.',
  },
  {
    aliases: ['claude', 'anthropic', 'کلود'],
    key: 'claude',
    name: 'کلود',
    category: 'ai',
    emoji: '🧠',
    gradient: 'from-orange-400 via-amber-500 to-rose-500',
    blurb: 'دستیار هوش مصنوعی برای نوشتن، برنامه‌نویسی و تحلیل اسناد طولانی.',
  },
  {
    aliases: ['gemini', 'google ai', 'bard', 'جمینای'],
    name: 'جمینای',
    category: 'ai',
    emoji: '♊',
    gradient: 'from-blue-500 via-indigo-500 to-purple-600',
    blurb: 'دستیار هوش مصنوعی گوگل با دسترسی به مدل‌های Gemini.',
  },
  {
    aliases: ['grok', 'xai', 'x.ai', 'گروک'],
    name: 'گروک',
    category: 'ai',
    emoji: '🚀',
    gradient: 'from-neutral-700 via-neutral-800 to-black',
    blurb: 'دستیار هوش مصنوعی xAI با پاسخ‌های لحظه‌ای و دسترسی به داده‌های ایکس.',
  },
  {
    aliases: ['microsoft copilot', 'copilot'],
    name: 'کوپایلوت',
    category: 'ai',
    emoji: '🪄',
    blurb: 'دستیار هوش مصنوعی مایکروسافت برای آفیس و کدنویسی.',
  },
  {
    aliases: ['github copilot'],
    name: 'گیت‌هاب کوپایلوت',
    category: 'ai',
    emoji: '🐙',
    blurb: 'تکمیل کد و برنامه‌نویسی با هوش مصنوعی داخل ادیتور.',
  },
  {
    aliases: ['perplexity', 'پرپلکسیتی'],
    name: 'پرپلکسیتی',
    category: 'ai',
    emoji: '🔎',
    blurb: 'موتور جستجوی هوشمند با پاسخ‌های مستند و منابع معتبر.',
  },
  {
    aliases: ['deepseek', 'deep seek', 'دیپ‌سیک', 'دیپ سیک'],
    name: 'دیپ‌سیک',
    category: 'ai',
    emoji: '🐋',
    blurb: 'مدل هوش مصنوعی پیشرفته برای کدنویسی و استدلال.',
  },
  {
    aliases: ['poe'],
    name: 'پو',
    category: 'ai',
    emoji: '🗨️',
    blurb: 'دسترسی هم‌زمان به چند مدل هوش مصنوعی در یک برنامه.',
  },
  {
    aliases: ['character.ai', 'character ai'],
    name: 'کاراکتر ای‌آی',
    category: 'ai',
    emoji: '👥',
    blurb: 'ساخت و گفتگو با شخصیت‌های هوش مصنوعی.',
  },
  {
    aliases: ['jasper'],
    name: 'جاسپر',
    category: 'ai',
    emoji: '✨',
    blurb: 'تولید محتوای بازاریابی و تبلیغاتی با هوش مصنوعی.',
  },
  {
    aliases: ['copy.ai', 'copy ai'],
    name: 'کاپی ای‌آی',
    category: 'ai',
    emoji: '📝',
    blurb: 'نوشتن متن تبلیغاتی و محتوای وب با هوش مصنوعی.',
  },
  {
    aliases: ['writesonic'],
    name: 'رایت‌سونیک',
    category: 'ai',
    emoji: '✒️',
    blurb: 'تولید مقاله و محتوای سئو با هوش مصنوعی.',
  },
  {
    aliases: ['grammarly'],
    name: 'گرامرلی',
    category: 'ai',
    emoji: '✍️',
    gradient: 'from-emerald-500 via-green-600 to-teal-700',
    blurb: 'اصلاح گرامر و بازنویسی متن انگلیسی با هوش مصنوعی.',
  },
  {
    aliases: ['quillbot'],
    name: 'کوئیل‌بات',
    category: 'ai',
    emoji: '🪶',
    blurb: 'بازنویسی، خلاصه‌سازی و بررسی متن.',
  },
  {
    aliases: ['midjourney', 'میدجرنی'],
    name: 'میدجرنی',
    category: 'ai',
    emoji: '🎨',
    gradient: 'from-indigo-500 via-purple-500 to-pink-500',
    blurb: 'تولید تصویر هنری با هوش مصنوعی برای طراحان و کانسپت آرت.',
  },
  {
    aliases: ['leonardo ai', 'leonardo'],
    name: 'لئوناردو',
    category: 'ai',
    emoji: '🌌',
    blurb: 'تولید تصویر و دارایی بازی با هوش مصنوعی.',
  },
  {
    aliases: ['ideogram'],
    name: 'آیدیوگرام',
    category: 'ai',
    emoji: '💡',
    blurb: 'تولید تصویر با هوش مصنوعی و متن خوانا.',
  },
  {
    aliases: ['stable diffusion', 'stability ai'],
    name: 'استیبل دیفیوژن',
    category: 'ai',
    emoji: '🌀',
    blurb: 'مدل متن‌باز تولید تصویر با هوش مصنوعی.',
  },
  {
    aliases: ['kling ai', 'kling'],
    name: 'کلینگ',
    category: 'ai',
    emoji: '🎥',
    blurb: 'تولید ویدیو از متن یا تصویر با هوش مصنوعی.',
  },
  {
    aliases: ['luma ai', 'luma'],
    name: 'لوما',
    category: 'ai',
    emoji: '🌙',
    blurb: 'ساخت ویدیو و مدل سه‌بعدی با هوش مصنوعی.',
  },
  {
    aliases: ['pika'],
    name: 'پیکا',
    category: 'ai',
    emoji: '⚡',
    blurb: 'تولید ویدیوی کوتاه با هوش مصنوعی.',
  },
  {
    aliases: ['heygen', 'heygen ai'],
    name: 'هی‌جن',
    category: 'ai',
    emoji: '🗣️',
    blurb: 'ساخت ویدیوی گوینده مجازی با هوش مصنوعی.',
  },
  {
    aliases: ['synthesia'],
    name: 'سینتزیا',
    category: 'ai',
    emoji: '🧑‍🏫',
    blurb: 'تولید ویدیوی آموزشی با آواتار و صدای هوش مصنوعی.',
  },
  {
    aliases: ['suno'],
    name: 'سونو',
    category: 'ai',
    emoji: '🎼',
    blurb: 'ساخت موسیقی و آهنگ از روی متن با هوش مصنوعی.',
  },
  {
    aliases: ['udio'],
    name: 'اودیو',
    category: 'ai',
    emoji: '🎹',
    blurb: 'تولید موسیقی با هوش مصنوعی.',
  },
  {
    aliases: ['elevenlabs', 'eleven labs'],
    name: 'الون‌لبز',
    category: 'ai',
    emoji: '🔊',
    blurb: 'تبدیل متن به گفتار و دوبله با صدای طبیعی.',
  },
  {
    aliases: ['runway'],
    name: 'ران‌وی',
    category: 'ai',
    emoji: '🎬',
    blurb: 'تولید و ویرایش ویدیو با هوش مصنوعی.',
  },
  {
    aliases: ['descript'],
    name: 'دیسکریپت',
    category: 'ai',
    emoji: '🎚️',
    blurb: 'ویرایش پادکست و ویدیو با متن و هوش مصنوعی.',
  },
  {
    aliases: ['cursor'],
    name: 'کرسر',
    category: 'ai',
    emoji: '⌨️',
    blurb: 'ادیتور کد هوشمند با تکمیل و بازنویسی خودکار.',
  },
  {
    aliases: ['replit'],
    name: 'ریپلیت',
    category: 'ai',
    emoji: '🧑‍💻',
    blurb: 'محیط برنامه‌نویسی آنلاین با دستیار هوش مصنوعی.',
  },

  /* --------------------------------- Design ------------------------------- */
  {
    aliases: ['adobe creative cloud', 'creative cloud', 'adobe', 'ادوبی کریتیو کلود', 'ادوبی'],
    key: 'adobe-cc',
    name: 'ادوبی کریتیو کلود',
    category: 'design',
    emoji: '🅰️',
    gradient: 'from-red-500 via-rose-600 to-neutral-900',
    blurb: 'نرم‌افزار قدرتمند طراحی و گرافیک شامل فتوشاپ، ایلاستریتور و پریمیر.',
  },
  {
    aliases: ['adobe photoshop', 'photoshop', 'ادوبی فتوشاپ'],
    name: 'ادوبی فتوشاپ',
    category: 'design',
    emoji: '🖌️',
    gradient: 'from-sky-500 via-blue-600 to-indigo-700',
    blurb: 'ویرایش و روتوش تصویر و ساخت طرح‌های گرافیکی.',
  },
  {
    aliases: ['adobe illustrator', 'illustrator', 'ادوبی ایلاستریتور'],
    name: 'ادوبی ایلاستریتور',
    category: 'design',
    emoji: '✒️',
    gradient: 'from-orange-500 via-amber-600 to-yellow-700',
    blurb: 'طراحی وکتور، لوگو و تصویرسازی حرفه‌ای.',
  },
  {
    aliases: ['adobe premiere', 'premiere pro', 'premiere', 'ادوبی پریمیر'],
    name: 'ادوبی پریمیر',
    category: 'design',
    emoji: '🎬',
    gradient: 'from-violet-500 via-purple-600 to-indigo-700',
    blurb: 'تدوین ویدیو حرفه‌ای برای فیلم و شبکه‌های اجتماعی.',
  },
  {
    aliases: ['adobe after effects', 'after effects', 'ادوبی افترافکت'],
    name: 'ادوبی افترافکت',
    category: 'design',
    emoji: '🎞️',
    gradient: 'from-indigo-500 via-violet-600 to-purple-700',
    blurb: 'ساخت موشن‌گرافیک و جلوه‌های ویژه ویدیو.',
  },
  {
    aliases: ['adobe lightroom', 'lightroom', 'ادوبی لایتروم'],
    name: 'ادوبی لایتروم',
    category: 'design',
    emoji: '📷',
    blurb: 'ویرایش، روتوش و مدیریت عکس‌های حرفه‌ای.',
  },
  {
    aliases: ['adobe acrobat', 'acrobat', 'ادوبی آکروبات'],
    name: 'ادوبی آکروبات',
    category: 'design',
    emoji: '📄',
    blurb: 'ویرایش، امضای دیجیتال و مدیریت فایل‌های PDF.',
  },
  {
    aliases: ['adobe indesign', 'indesign', 'ادوبی ایندیزاین'],
    name: 'ادوبی ایندیزاین',
    category: 'design',
    emoji: '📐',
    blurb: 'صفحه‌آرایی مجله، کتاب و بروشور.',
  },
  {
    aliases: ['canva', 'کانوا'],
    key: 'canva',
    name: 'کانوا',
    category: 'design',
    emoji: '🖼️',
    gradient: 'from-cyan-400 via-sky-500 to-violet-500',
    blurb: 'طراحی گرافیک آسان با قالب‌های آماده برای شبکه‌های اجتماعی.',
  },
  {
    aliases: ['figma', 'فیگما'],
    name: 'فیگما',
    category: 'design',
    emoji: '🧩',
    gradient: 'from-fuchsia-500 via-purple-500 to-orange-400',
    blurb: 'طراحی رابط کاربری و همکاری تیمی روی پروژه‌های دیجیتال.',
  },
  {
    aliases: ['capcut', 'کپ‌کات', 'کپ کات'],
    name: 'کپ‌کات',
    category: 'design',
    emoji: '✂️',
    gradient: 'from-neutral-700 via-slate-800 to-black',
    blurb: 'ویرایش ویدیو و تدوین برای شبکه‌های اجتماعی.',
  },
  {
    aliases: ['framer'],
    name: 'فریمر',
    category: 'design',
    emoji: '🖥️',
    blurb: 'ساخت وب‌سایت و نمونه اولیه تعاملی بدون کدنویسی.',
  },
  {
    aliases: ['procreate'],
    name: 'پروکریت',
    category: 'design',
    emoji: '🖍️',
    blurb: 'نقاشی دیجیتال و تصویرسازی روی آیپد.',
  },
  {
    aliases: ['affinity designer', 'affinity photo', 'affinity'],
    name: 'افینیتی',
    category: 'design',
    emoji: '🎛️',
    blurb: 'مجموعه طراحی و ویرایش تصویر حرفه‌ای.',
  },
  {
    aliases: ['sketch'],
    name: 'اسکچ',
    category: 'design',
    emoji: '✏️',
    blurb: 'طراحی رابط کاربری و آیکون برای مک.',
  },
  {
    aliases: ['envato elements', 'envato'],
    name: 'انواتو المنتس',
    category: 'design',
    emoji: '🗃️',
    blurb: 'دانلود نامحدود قالب، فونت و دارایی گرافیکی.',
  },
  {
    aliases: ['freepik'],
    name: 'فریپیک',
    category: 'design',
    emoji: '🧿',
    blurb: 'تصاویر، وکتور و قالب‌های گرافیکی آماده.',
  },
  {
    aliases: ['shutterstock'],
    name: 'شاتراستاک',
    category: 'design',
    emoji: '📸',
    blurb: 'عکس، ویدیو و موسیقی استوک با لایسنس تجاری.',
  },
  {
    aliases: ['blender'],
    name: 'بلندر',
    category: 'design',
    emoji: '🧊',
    blurb: 'مدل‌سازی سه‌بعدی، انیمیشن و رندر.',
  },
  {
    aliases: ['autocad'],
    name: 'اتوکد',
    category: 'design',
    emoji: '🏗️',
    blurb: 'طراحی نقشه‌های دوبعدی و سه‌بعدی مهندسی.',
  },

  /* --------------------------------- Gaming ------------------------------- */
  {
    aliases: ['steam wallet', 'steam gift card'],
    name: 'استیم والت',
    category: 'gaming',
    emoji: '🎮',
    gradient: 'from-slate-700 via-slate-800 to-blue-900',
    blurb: 'شارژ کیف پول استیم برای خرید بازی و آیتم.',
  },
  {
    aliases: ['steam'],
    name: 'استیم',
    category: 'gaming',
    emoji: '🎮',
    gradient: 'from-slate-700 via-slate-800 to-blue-900',
    blurb: 'پلتفرم خرید و اجرای بازی‌های رایانه‌ای.',
  },
  {
    aliases: ['playstation plus', 'ps plus', 'psn', 'playstation network', 'پلی‌استیشن پلاس'],
    name: 'پلی‌استیشن پلاس',
    category: 'gaming',
    emoji: '🕹️',
    gradient: 'from-blue-600 via-indigo-700 to-slate-900',
    blurb: 'بازی آنلاین، بازی‌های ماهانه و تخفیف‌های پلی‌استیشن.',
  },
  {
    aliases: ['playstation', 'پلی‌استیشن'],
    name: 'پلی‌استیشن',
    category: 'gaming',
    emoji: '🕹️',
    gradient: 'from-blue-600 via-indigo-700 to-slate-900',
    blurb: 'شارژ و خرید از فروشگاه پلی‌استیشن.',
  },
  {
    aliases: ['xbox game pass', 'xbox live', 'xbox', 'ایکس‌باکس'],
    name: 'ایکس‌باکس',
    category: 'gaming',
    emoji: '🟩',
    gradient: 'from-green-500 via-emerald-600 to-green-800',
    blurb: 'اشتراک بازی ایکس‌باکس و دسترسی به کتابخانه گیم‌پس.',
  },
  {
    aliases: ['nintendo switch online', 'nintendo eshop', 'nintendo'],
    name: 'نینتندو',
    category: 'gaming',
    emoji: '🍄',
    blurb: 'بازی آنلاین و خرید از فروشگاه نینتندو.',
  },
  {
    aliases: ['discord nitro', 'discord', 'دیسکورد نیترو', 'دیسکورد'],
    name: 'دیسکورد نیترو',
    category: 'gaming',
    emoji: '💬',
    gradient: 'from-indigo-500 via-violet-600 to-purple-700',
    blurb: 'امکانات ویژه دیسکورد شامل آپلود بزرگ‌تر و ایموجی سفارشی.',
  },
  {
    aliases: ['roblox', 'robux'],
    name: 'رابلاکس',
    category: 'gaming',
    emoji: '🧱',
    blurb: 'خرید روباکس و آیتم برای بازی رابلاکس.',
  },
  {
    aliases: ['minecraft'],
    name: 'ماینکرفت',
    category: 'gaming',
    emoji: '⛏️',
    blurb: 'لایسنس بازی ماینکرفت برای ساخت و کاوش.',
  },
  {
    aliases: ['fortnite', 'v-bucks', 'vbucks'],
    name: 'فورتنایت',
    category: 'gaming',
    emoji: '🏗️',
    blurb: 'شارژ وی‌باکس برای خرید اسکین و بتل‌پس.',
  },
  {
    aliases: ['valorant'],
    name: 'والورانت',
    category: 'gaming',
    emoji: '🎯',
    blurb: 'شارژ والورانت پوینت برای اسکین و بتل‌پس.',
  },
  {
    aliases: ['riot points'],
    name: 'ریوت پوینت',
    category: 'gaming',
    emoji: '💠',
    blurb: 'اعتبار ریوت برای بازی‌های لیگ آو لجندز و والورانت.',
  },
  {
    aliases: ['league of legends'],
    name: 'لیگ آو لجندز',
    category: 'gaming',
    emoji: '⚔️',
    blurb: 'شارژ حساب و خرید اسکین لیگ آو لجندز.',
  },
  {
    aliases: ['genshin impact', 'genshin'],
    name: 'گنشین ایمپکت',
    category: 'gaming',
    emoji: '🌸',
    blurb: 'شارژ کریستال برای بازی گنشین ایمپکت.',
  },
  {
    aliases: ['epic games'],
    name: 'اپیک گیمز',
    category: 'gaming',
    emoji: '🎮',
    blurb: 'شارژ کیف پول اپیک گیمز برای خرید بازی.',
  },
  {
    aliases: ['ea play', 'ea sports'],
    name: 'ای‌ای پلی',
    category: 'gaming',
    emoji: '⚽',
    blurb: 'اشتراک بازی‌های الکترونیک آرتس.',
  },
  {
    aliases: ['ubisoft plus', 'ubisoft+', 'ubisoft'],
    name: 'یوبی‌سافت',
    category: 'gaming',
    emoji: '🎮',
    blurb: 'اشتراک و خرید بازی‌های یوبی‌سافت.',
  },
  {
    aliases: ['battle.net', 'blizzard'],
    name: 'بلیزارد',
    category: 'gaming',
    emoji: '❄️',
    blurb: 'شارژ حساب بتل‌نت و بازی‌های بلیزارد.',
  },
  {
    aliases: ['razer gold', 'razer'],
    name: 'ریزر گلد',
    category: 'gaming',
    emoji: '🐍',
    blurb: 'کیف پول ریزر گلد برای خرید بازی و آیتم.',
  },
  {
    aliases: ['pubg mobile', 'pubg uc', 'pubg'],
    name: 'پابجی',
    category: 'gaming',
    emoji: '🪂',
    blurb: 'شارژ یوسی برای خرید اسکین و بتل‌پس پابجی.',
  },
  {
    aliases: ['free fire'],
    name: 'فری فایر',
    category: 'gaming',
    emoji: '🔥',
    blurb: 'شارژ جم برای خرید اسکین و آیتم فری فایر.',
  },
  {
    aliases: ['mobile legends'],
    name: 'موبایل لجندز',
    category: 'gaming',
    emoji: '💎',
    blurb: 'شارژ الماس برای خرید قهرمان و اسکین.',
  },
  {
    aliases: ['clash of clans'],
    name: 'کلش آو کلنز',
    category: 'gaming',
    emoji: '🛡️',
    blurb: 'شارژ جم برای ارتقای پایگاه و قهرمان‌ها.',
  },
  {
    aliases: ['brawl stars'],
    name: 'براول استارز',
    category: 'gaming',
    emoji: '🌟',
    blurb: 'شارژ جم برای خرید براولر و اسکین.',
  },

  /* --------------------------------- Social ------------------------------- */
  {
    aliases: ['telegram premium', 'telegram', 'تلگرام پریمیوم', 'تلگرام'],
    name: 'تلگرام پریمیوم',
    category: 'social',
    emoji: '✈️',
    gradient: 'from-sky-400 via-blue-500 to-cyan-500',
    blurb: 'ارتقای تلگرام با استیکر اختصاصی، آپلود بزرگ‌تر و سرعت بیشتر.',
  },
  {
    aliases: ['instagram', 'meta verified', 'insta', 'اینستاگرام'],
    name: 'اینستاگرام',
    category: 'social',
    emoji: '📸',
    gradient: 'from-pink-500 via-rose-500 to-amber-400',
    blurb: 'ارتقای حساب اینستاگرام و امکانات ویژه سازندگان محتوا.',
  },
  {
    aliases: ['tiktok', 'tik tok', 'تیک‌تاک', 'تیک تاک'],
    name: 'تیک‌تاک',
    category: 'social',
    emoji: '🕺',
    gradient: 'from-neutral-900 via-rose-500 to-cyan-400',
    blurb: 'ابزارهای حرفه‌ای تولید و تحلیل محتوای تیک‌تاک.',
  },
  {
    aliases: ['facebook'],
    name: 'فیسبوک',
    category: 'social',
    emoji: '👍',
    blurb: 'ارتقای صفحه و امکانات تبلیغاتی فیسبوک.',
  },
  {
    aliases: ['snapchat'],
    name: 'اسنپ‌چت',
    category: 'social',
    emoji: '👻',
    blurb: 'قابلیت‌های ویژه اسنپ‌چت و اسنپ‌چت پلاس.',
  },
  {
    aliases: ['x premium', 'twitter blue', 'twitter'],
    name: 'ایکس پریمیوم',
    category: 'social',
    emoji: '🐦',
    gradient: 'from-neutral-700 via-neutral-800 to-black',
    blurb: 'اشتراک ایکس با تیک آبی، ویرایش پست و دسترسی به هوش مصنوعی.',
  },
  {
    aliases: ['linkedin premium', 'linkedin'],
    name: 'لینکدین',
    category: 'social',
    emoji: '💼',
    blurb: 'امکانات حرفه‌ای لینکدین برای جذب فرصت شغلی و دیده‌شدن.',
  },
  {
    aliases: ['linkedin learning'],
    name: 'لینکدین لرنینگ',
    category: 'other',
    emoji: '💼',
    blurb: 'دوره‌های آموزشی حرفه‌ای برای مهارت‌های شغلی.',
  },
  {
    aliases: ['reddit'],
    name: 'ردیت',
    category: 'social',
    emoji: '👽',
    blurb: 'اشتراک ردیت و دسترسی به انجمن‌های تخصصی.',
  },
  {
    aliases: ['pinterest'],
    name: 'پینترست',
    category: 'social',
    emoji: '📌',
    blurb: 'ابزارهای حرفه‌ای پینترست برای ایده و بازاریابی.',
  },
  {
    aliases: ['threads'],
    name: 'تردز',
    category: 'social',
    emoji: '🧵',
    blurb: 'ارتقای حساب تردز و امکانات سازندگان محتوا.',
  },
  {
    aliases: ['whatsapp business', 'whatsapp'],
    name: 'واتس‌اپ',
    category: 'social',
    emoji: '📱',
    blurb: 'امکانات تجاری واتس‌اپ برای کسب‌وکار.',
  },
  {
    aliases: ['tinder gold', 'tinder plus', 'tinder'],
    name: 'تیندر',
    category: 'social',
    emoji: '💘',
    blurb: 'اشتراک تیندر با لایک نامحدود و دیده‌شدن بیشتر.',
  },
  {
    aliases: ['bumble premium', 'bumble'],
    name: 'بامبل',
    category: 'social',
    emoji: '🐝',
    blurb: 'اشتراک بامبل با امکانات ویژه آشنایی.',
  },
  {
    aliases: ['bluesky'],
    name: 'بلواسکای',
    category: 'social',
    emoji: '🦋',
    blurb: 'شبکه اجتماعی بلواسکای و امکانات حرفه‌ای.',
  },

  /* ------------------------------- Education ------------------------------ */
  {
    aliases: ['duolingo', 'super duolingo', 'دولینگو'],
    name: 'دولینگو',
    category: 'other',
    emoji: '🦉',
    gradient: 'from-lime-400 via-green-500 to-emerald-600',
    blurb: 'یادگیری زبان با تمرین‌های کوتاه و بازی‌وار بدون تبلیغ.',
  },
  {
    aliases: ['coursera', 'کورسرا'],
    name: 'کورسرا',
    category: 'other',
    emoji: '🎓',
    blurb: 'دوره‌های دانشگاهی و گواهی‌نامه معتبر.',
  },
  {
    aliases: ['udemy'],
    name: 'یودمی',
    category: 'other',
    emoji: '🎓',
    blurb: 'هزاران دوره آموزشی مهارتی و حرفه‌ای.',
  },
  {
    aliases: ['edx'],
    name: 'ایدیکس',
    category: 'other',
    emoji: '🎓',
    blurb: 'دوره‌های دانشگاهی آنلاین از برترین موسسات.',
  },
  {
    aliases: ['skillshare'],
    name: 'اسکیل‌شیر',
    category: 'other',
    emoji: '🎓',
    blurb: 'کلاس‌های خلاقیت، طراحی و مهارت‌های دیجیتال.',
  },
  {
    aliases: ['masterclass'],
    name: 'مسترکلاس',
    category: 'other',
    emoji: '🏛️',
    blurb: 'کلاس‌های تخصصی از استادان مشهور جهان.',
  },
  {
    aliases: ['babbel'],
    name: 'بابل',
    category: 'other',
    emoji: '🗨️',
    blurb: 'یادگیری زبان با تمرین مکالمه و درس‌های کوتاه.',
  },
  {
    aliases: ['rosetta stone'],
    name: 'رزتا استون',
    category: 'other',
    emoji: '🗿',
    blurb: 'یادگیری زبان با روش غوطه‌وری و تکرار.',
  },
  {
    aliases: ['chegg'],
    name: 'چگ',
    category: 'other',
    emoji: '📚',
    blurb: 'کمک‌آموزشی و راهنمای حل تمرین درسی.',
  },
  {
    aliases: ['turnitin'],
    name: 'ترنیتین',
    category: 'other',
    emoji: '📋',
    blurb: 'بررسی اصالت و همانندجویی متون دانشگاهی.',
  },
  {
    aliases: ['brilliant'],
    name: 'بریلیانت',
    category: 'other',
    emoji: '🔢',
    blurb: 'یادگیری تعاملی ریاضی، علم و برنامه‌نویسی.',
  },
  {
    aliases: ['datacamp'],
    name: 'دیتاکمپ',
    category: 'other',
    emoji: '🧪',
    blurb: 'دوره‌های تعاملی داده، آمار و برنامه‌نویسی.',
  },
  {
    aliases: ['udacity'],
    name: 'یوداسیتی',
    category: 'other',
    emoji: '🎓',
    blurb: 'دوره‌های تخصصی فناوری و نانودراگره.',
  },

  /* ---------------------------- Work & systems ---------------------------- */
  {
    aliases: ['microsoft 365', 'office 365', 'microsoft office', 'microsoft'],
    name: 'مایکروسافت ۳۶۵',
    category: 'other',
    emoji: '📊',
    gradient: 'from-red-500 via-orange-500 to-amber-500',
    blurb: 'مجموعه آفیس شامل Word، Excel و PowerPoint با فضای ابری.',
  },
  {
    aliases: ['office 2021'],
    name: 'آفیس ۲۰۲۱',
    category: 'other',
    emoji: '📊',
    gradient: 'from-red-500 via-orange-500 to-amber-500',
    blurb: 'لایسنس مادام‌العمر آفیس ۲۰۲۱ برای ویندوز یا مک.',
  },
  {
    aliases: ['office 2019'],
    name: 'آفیس ۲۰۱۹',
    category: 'other',
    emoji: '📊',
    gradient: 'from-red-500 via-orange-500 to-amber-500',
    blurb: 'لایسنس مادام‌العمر آفیس ۲۰۱۹.',
  },
  {
    aliases: ['windows 11', 'win 11', 'ویندوز ۱۱', 'ویندوز 11'],
    name: 'ویندوز ۱۱',
    category: 'other',
    emoji: '🪟',
    gradient: 'from-sky-400 via-blue-500 to-indigo-600',
    blurb: 'لایسنس اورجینال ویندوز ۱۱ با فعال‌سازی مادام‌العمر.',
  },
  {
    aliases: ['windows 10', 'win 10', 'ویندوز ۱۰', 'ویندوز 10'],
    name: 'ویندوز ۱۰',
    category: 'other',
    emoji: '🪟',
    gradient: 'from-sky-400 via-blue-500 to-indigo-600',
    blurb: 'لایسنس اورجینال ویندوز ۱۰ با فعال‌سازی مادام‌العمر.',
  },
  {
    aliases: ['windows server', 'ویندوز سرور'],
    name: 'ویندوز سرور',
    category: 'other',
    emoji: '🖥️',
    blurb: 'لایسنس ویندوز سرور برای محیط‌های سازمانی.',
  },
  {
    aliases: ['windows', 'ویندوز'],
    name: 'ویندوز',
    category: 'other',
    emoji: '🪟',
    gradient: 'from-sky-400 via-blue-500 to-indigo-600',
    blurb: 'لایسنس اورجینال ویندوز با فعال‌سازی مادام‌العمر.',
  },
  {
    aliases: ['visual studio'],
    name: 'ویژوال استودیو',
    category: 'other',
    emoji: '👨‍💻',
    blurb: 'محیط توسعه یکپارچه مایکروسافت برای برنامه‌نویسی.',
  },
  {
    aliases: ['notion'],
    name: 'نوشن',
    category: 'other',
    emoji: '📝',
    blurb: 'فضای کاری هوشمند برای یادداشت، پروژه و مدیریت تیم.',
  },
  {
    aliases: ['evernote'],
    name: 'اورنوت',
    category: 'other',
    emoji: '🐘',
    blurb: 'یادداشت‌برداری و سازمان‌دهی اطلاعات.',
  },
  {
    aliases: ['todoist'],
    name: 'تودویست',
    category: 'other',
    emoji: '✅',
    blurb: 'مدیریت کارها و برنامه‌ریزی روزانه.',
  },
  {
    aliases: ['trello'],
    name: 'ترلو',
    category: 'other',
    emoji: '🗂️',
    blurb: 'مدیریت پروژه با بردهای کانبان.',
  },
  {
    aliases: ['asana'],
    name: 'آسانا',
    category: 'other',
    emoji: '🧭',
    blurb: 'مدیریت وظایف و همکاری تیمی.',
  },
  {
    aliases: ['monday.com', 'monday'],
    name: 'ماندی',
    category: 'other',
    emoji: '📅',
    blurb: 'پلتفرم مدیریت کار و گردش‌کار تیمی.',
  },
  {
    aliases: ['clickup'],
    name: 'کلیک‌آپ',
    category: 'other',
    emoji: '🟣',
    blurb: 'مدیریت پروژه و بهره‌وری تیم در یک برنامه.',
  },
  {
    aliases: ['airtable'],
    name: 'ایرتیبل',
    category: 'other',
    emoji: '🗃️',
    blurb: 'پایگاه داده و مدیریت اطلاعات تیمی.',
  },
  {
    aliases: ['miro'],
    name: 'میرو',
    category: 'other',
    emoji: '🖇️',
    blurb: 'تخته سفید تعاملی برای طوفان فکری و طراحی.',
  },
  {
    aliases: ['slack'],
    name: 'اسلک',
    category: 'other',
    emoji: '#️⃣',
    blurb: 'پیام‌رسان تیمی و همکاری در محیط کار.',
  },
  {
    aliases: ['zoom'],
    name: 'زوم',
    category: 'other',
    emoji: '📹',
    blurb: 'تماس ویدیویی و جلسات آنلاین با کیفیت بالا.',
  },
  {
    aliases: ['google workspace', 'gsuite'],
    name: 'گوگل ورک‌اسپیس',
    category: 'other',
    emoji: '📁',
    blurb: 'ایمیل سازمانی و ابزارهای همکاری گوگل.',
  },
  {
    aliases: ['google one'],
    name: 'گوگل وان',
    category: 'other',
    emoji: '☁️',
    blurb: 'فضای ذخیره‌سازی ابری گوگل و امکانات ویژه.',
  },
  {
    aliases: ['google play'],
    name: 'گیفت‌کارت گوگل پلی',
    category: 'other',
    emoji: '🎁',
    blurb: 'گیفت‌کارت خرید برنامه، بازی و محتوا از گوگل پلی.',
  },
  {
    aliases: ['dropbox'],
    name: 'دراپ‌باکس',
    category: 'other',
    emoji: '🗂️',
    blurb: 'ذخیره‌سازی و اشتراک فایل در فضای ابری.',
  },
  {
    aliases: ['onedrive'],
    name: 'وان‌درایو',
    category: 'other',
    emoji: '☁️',
    blurb: 'فضای ذخیره‌سازی ابری مایکروسافت.',
  },
  {
    aliases: ['icloud', 'apple one', 'آی‌کلاد', 'آی کلاد', 'اپل وان'],
    name: 'آی‌کلاد',
    category: 'other',
    emoji: '☁️',
    blurb: 'فضای ذخیره‌سازی ابری اپل و همگام‌سازی دستگاه‌ها.',
  },
  {
    aliases: ['mega.nz', 'mega cloud'],
    name: 'مگا',
    category: 'other',
    emoji: '☁️',
    blurb: 'فضای ذخیره‌سازی ابری با رمزنگاری سرتاسری.',
  },
  {
    aliases: ['pcloud'],
    name: 'پی‌کلاد',
    category: 'other',
    emoji: '☁️',
    blurb: 'ذخیره‌سازی ابری امن با لایسنس مادام‌العمر.',
  },
  {
    aliases: ['box'],
    name: 'باکس',
    category: 'other',
    emoji: '🗄️',
    blurb: 'مدیریت و اشتراک امن فایل‌های سازمانی.',
  },
  {
    aliases: [
      'apple gift card',
      'itunes gift card',
      'app store gift card',
      'گیفت کارت اپل',
      'اپل گیفت کارت',
    ],
    name: 'گیفت‌کارت اپل',
    category: 'other',
    emoji: '🍎',
    blurb: 'گیفت‌کارت خرید از اپ استور و فروشگاه اپل.',
  },
  {
    aliases: ['amazon gift card', 'گیفت کارت آمازون', 'آمازون گیفت کارت'],
    name: 'گیفت‌کارت آمازون',
    category: 'other',
    emoji: '🎁',
    blurb: 'گیفت‌کارت خرید از فروشگاه آمازون.',
  },
  {
    aliases: ['ebay gift card', 'ebay'],
    name: 'گیفت‌کارت ای‌بی',
    category: 'other',
    emoji: '🛒',
    blurb: 'گیفت‌کارت خرید از فروشگاه ای‌بی.',
  },
  {
    aliases: ['visa gift card', 'prepaid visa'],
    name: 'کارت هدیه ویزا',
    category: 'other',
    emoji: '💳',
    blurb: 'کارت پرداخت پیش‌پرداخت ویزا برای خرید آنلاین.',
  },
  {
    aliases: ['scribd', 'everand'],
    name: 'اسکرایبد',
    category: 'other',
    emoji: '📚',
    blurb: 'کتاب الکترونیکی، کتاب صوتی و مقاله نامحدود.',
  },
  {
    aliases: ['storytel'],
    name: 'استوری‌تل',
    category: 'other',
    emoji: '🎧',
    blurb: 'کتاب صوتی و الکترونیکی با دسترسی نامحدود.',
  },
  {
    aliases: ['blinkist'],
    name: 'بلینکیست',
    category: 'other',
    emoji: '💡',
    blurb: 'خلاصه کتاب‌های پرفروش در چند دقیقه.',
  },
  {
    aliases: ['marvel unlimited'],
    name: 'مارول آنلیمیتد',
    category: 'other',
    emoji: '🦸',
    blurb: 'کمیک‌های مارول با دسترسی نامحدود.',
  },
  {
    aliases: ['dc universe infinite', 'dc universe'],
    name: 'دی‌سی آنلیمیتد',
    category: 'other',
    emoji: '🦇',
    blurb: 'کمیک‌های دی‌سی با دسترسی نامحدود.',
  },
  {
    aliases: ['comixology'],
    name: 'کامیکسولوژی',
    category: 'other',
    emoji: '💥',
    blurb: 'کمیک و رمان گرافیکی دیجیتال.',
  },

  /* -------------------------------- Finance ------------------------------- */
  {
    aliases: ['tradingview'],
    name: 'تریدینگ‌ویو',
    category: 'other',
    emoji: '📈',
    gradient: 'from-sky-500 via-blue-600 to-indigo-700',
    blurb: 'تحلیل تکنیکال بازارهای مالی و چارت‌های حرفه‌ای.',
  },
  {
    aliases: ['binance'],
    name: 'بایننس',
    category: 'other',
    emoji: '🪙',
    blurb: 'دسترسی به صرافی ارز دیجیتال و ابزارهای معاملاتی.',
  },
  {
    aliases: ['bybit'],
    name: 'بای‌بیت',
    category: 'other',
    emoji: '🪙',
    blurb: 'صرافی ارز دیجیتال و معاملات مشتقه.',
  },
  {
    aliases: ['coinbase'],
    name: 'کوین‌بیس',
    category: 'other',
    emoji: '🪙',
    blurb: 'خرید و فروش ارز دیجیتال و کیف پول امن.',
  },
  {
    aliases: ['kucoin', 'ku coin'],
    name: 'کوکوین',
    category: 'other',
    emoji: '🪙',
    blurb: 'صرافی ارز دیجیتال با تنوع بالای توکن.',
  },
  {
    aliases: ['okx'],
    name: 'اوکی‌ایکس',
    category: 'other',
    emoji: '🪙',
    blurb: 'صرافی ارز دیجیتال و ابزارهای وب۳.',
  },
  {
    aliases: ['mexc'],
    name: 'ام‌ایکس‌سی',
    category: 'other',
    emoji: '🪙',
    blurb: 'صرافی ارز دیجیتال با کارمزد پایین.',
  },
  {
    aliases: ['bitget'],
    name: 'بیت‌گت',
    category: 'other',
    emoji: '🪙',
    blurb: 'صرافی ارز دیجیتال و کپی‌تریدینگ.',
  },
  {
    aliases: ['kraken'],
    name: 'کراکن',
    category: 'other',
    emoji: '🪙',
    blurb: 'صرافی ارز دیجیتال با امنیت بالا.',
  },
  {
    aliases: ['etoro'],
    name: 'ای‌تورو',
    category: 'other',
    emoji: '📊',
    blurb: 'پلتفرم معاملات و کپی‌تریدینگ چنددارایی.',
  },
  {
    aliases: ['quotex'],
    name: 'کوتکس',
    category: 'other',
    emoji: '📉',
    blurb: 'پلتفرم معاملات آنلاین با آموزش و حساب آزمایشی.',
  },
  {
    aliases: ['pocket option'],
    name: 'پاکت آپشن',
    category: 'other',
    emoji: '📉',
    blurb: 'پلتفرم معاملات آنلاین و ابزارهای تحلیل.',
  },
  {
    aliases: ['iq option'],
    name: 'آی‌کیو آپشن',
    category: 'other',
    emoji: '📊',
    blurb: 'پلتفرم معاملات آنلاین و آموزش ترید.',
  },
  {
    aliases: ['metatrader', 'meta trader', 'mt4', 'mt5'],
    name: 'متاتریدر',
    category: 'other',
    emoji: '📊',
    blurb: 'پلتفرم معاملات فارکس و تحلیل چارت.',
  },
  {
    aliases: ['ftmo'],
    name: 'اف‌تی‌ام‌او',
    category: 'other',
    emoji: '🏦',
    blurb: 'چالش پراپ تریدینگ و مدیریت سرمایه.',
  },
  {
    aliases: ['fundednext', 'funded next'],
    name: 'فاندد نکست',
    category: 'other',
    emoji: '🏦',
    blurb: 'چالش پراپ تریدینگ با سرمایه شرکت.',
  },

  /* --------------------------- Security & VPN ----------------------------- */
  {
    aliases: ['nordvpn', 'nord vpn'],
    name: 'نورد وی‌پی‌ان',
    category: 'other',
    emoji: '🌐',
    gradient: 'from-blue-500 via-indigo-500 to-sky-600',
    blurb: VPN_BLURB,
  },
  {
    aliases: ['expressvpn', 'express vpn', 'اکسپرس وی‌پی‌ان', 'اکسپرس وی پی ان'],
    name: 'اکسپرس وی‌پی‌ان',
    category: 'other',
    emoji: '🚀',
    gradient: 'from-red-500 via-rose-600 to-orange-600',
    blurb: VPN_BLURB,
  },
  {
    aliases: ['surfshark'],
    name: 'سرف‌شارک',
    category: 'other',
    emoji: '🦈',
    gradient: 'from-teal-400 via-cyan-500 to-blue-600',
    blurb: VPN_BLURB,
  },
  {
    aliases: ['proton vpn', 'protonvpn', 'proton mail', 'proton drive', 'proton'],
    name: 'پروتون',
    category: 'other',
    emoji: '🛡️',
    blurb: VPN_BLURB,
  },
  {
    aliases: ['cyberghost', 'cyber ghost'],
    name: 'سایبرگوست',
    category: 'other',
    emoji: '👻',
    blurb: VPN_BLURB,
  },
  {
    aliases: ['ipvanish'],
    name: 'آی‌پی‌ونیش',
    category: 'other',
    emoji: '🕵️',
    blurb: VPN_BLURB,
  },
  {
    aliases: ['private internet access', 'pia vpn'],
    name: 'پی‌آی‌ای وی‌پی‌ان',
    category: 'other',
    emoji: '🕶️',
    blurb: VPN_BLURB,
  },
  {
    aliases: ['mullvad'],
    name: 'مولود',
    category: 'other',
    emoji: '🧅',
    blurb: VPN_BLURB,
  },
  {
    aliases: ['windscribe'],
    name: 'وینداسکرایب',
    category: 'other',
    emoji: '💨',
    blurb: VPN_BLURB,
  },
  {
    aliases: ['vyprvpn', 'vypr vpn'],
    name: 'وایپر وی‌پی‌ان',
    category: 'other',
    emoji: '🧭',
    blurb: VPN_BLURB,
  },
  {
    aliases: ['tunnelbear', 'tunnel bear'],
    name: 'تانل‌بیر',
    category: 'other',
    emoji: '🐻',
    blurb: VPN_BLURB,
  },
  {
    aliases: ['hide.me'],
    name: 'هایدمی',
    category: 'other',
    emoji: '🙈',
    blurb: VPN_BLURB,
  },
  {
    aliases: ['purevpn', 'pure vpn'],
    name: 'پیور وی‌پی‌ان',
    category: 'other',
    emoji: '🌍',
    blurb: VPN_BLURB,
  },
  {
    aliases: ['astrill'],
    name: 'استریل',
    category: 'other',
    emoji: '🛰️',
    blurb: VPN_BLURB,
  },
  {
    aliases: ['kaspersky'],
    name: 'کسپرسکی',
    category: 'other',
    emoji: '🛡️',
    gradient: 'from-emerald-600 via-teal-600 to-cyan-700',
    blurb: ANTIVIRUS_BLURB,
  },
  {
    aliases: ['norton 360', 'norton'],
    name: 'نورتون',
    category: 'other',
    emoji: '🔐',
    gradient: 'from-yellow-400 via-amber-500 to-orange-600',
    blurb: ANTIVIRUS_BLURB,
  },
  {
    aliases: ['mcafee'],
    name: 'مک‌آفی',
    category: 'other',
    emoji: '🛡️',
    blurb: ANTIVIRUS_BLURB,
  },
  {
    aliases: ['bitdefender'],
    name: 'بیت‌دیفندر',
    category: 'other',
    emoji: '🛡️',
    blurb: ANTIVIRUS_BLURB,
  },
  {
    aliases: ['eset', 'nod32'],
    name: 'ایست',
    category: 'other',
    emoji: '🛡️',
    blurb: ANTIVIRUS_BLURB,
  },
  {
    aliases: ['avast'],
    name: 'آواست',
    category: 'other',
    emoji: '🛡️',
    blurb: ANTIVIRUS_BLURB,
  },
  {
    aliases: ['avg'],
    name: 'ای‌وی‌جی',
    category: 'other',
    emoji: '🛡️',
    blurb: ANTIVIRUS_BLURB,
  },
  {
    aliases: ['avira'],
    name: 'آویرا',
    category: 'other',
    emoji: '🛡️',
    blurb: ANTIVIRUS_BLURB,
  },
  {
    aliases: ['malwarebytes'],
    name: 'مالوربایتس',
    category: 'other',
    emoji: '🛡️',
    blurb: ANTIVIRUS_BLURB,
  },
  {
    aliases: ['trend micro'],
    name: 'ترند میکرو',
    category: 'other',
    emoji: '🛡️',
    blurb: ANTIVIRUS_BLURB,
  },
  {
    aliases: ['totalav', 'total av'],
    name: 'توتال ای‌وی',
    category: 'other',
    emoji: '🛡️',
    blurb: ANTIVIRUS_BLURB,
  },
  {
    aliases: ['sophos'],
    name: 'سوفوس',
    category: 'other',
    emoji: '🛡️',
    blurb: ANTIVIRUS_BLURB,
  },
  {
    aliases: ['panda security', 'panda dome'],
    name: 'پاندا امنیت',
    category: 'other',
    emoji: '🐼',
    blurb: ANTIVIRUS_BLURB,
  },
  {
    aliases: ['f-secure', 'fsecure'],
    name: 'اف‌سکیور',
    category: 'other',
    emoji: '🛡️',
    blurb: ANTIVIRUS_BLURB,
  },
  {
    aliases: ['1password', '1 password'],
    name: 'وان‌پسورد',
    category: 'other',
    emoji: '🔑',
    blurb: PASSWORD_BLURB,
  },
  {
    aliases: ['bitwarden'],
    name: 'بیت‌واردن',
    category: 'other',
    emoji: '🔐',
    blurb: PASSWORD_BLURB,
  },
  {
    aliases: ['dashlane'],
    name: 'دشلین',
    category: 'other',
    emoji: '🗝️',
    blurb: PASSWORD_BLURB,
  },
  {
    aliases: ['nordpass'],
    name: 'نوردپس',
    category: 'other',
    emoji: '🔑',
    blurb: PASSWORD_BLURB,
  },
  {
    aliases: ['lastpass'],
    name: 'لست‌پس',
    category: 'other',
    emoji: '🗝️',
    blurb: PASSWORD_BLURB,
  },
  {
    aliases: ['keeper security', 'keeper'],
    name: 'کیپر',
    category: 'other',
    emoji: '🔐',
    blurb: PASSWORD_BLURB,
  },
  {
    aliases: ['adguard'],
    name: 'ادگارد',
    category: 'other',
    emoji: '🚫',
    blurb: 'مسدودسازی تبلیغات و ردیاب‌ها روی همه دستگاه‌ها.',
  },
]

const BRAND_ALIASES = BRANDS.flatMap((brand) =>
  brand.aliases.map((alias) => ({ alias, brand })),
).sort((a, b) => b.alias.length - a.alias.length)

/**
 * Persian brand names let a second localization pass — and catalogues persisted
 * before a brand existed in the dictionary — keep their identity, emoji and
 * curated placement even though the upstream English title is gone.
 */
const BRAND_NAME_MATCHERS = BRANDS.map((brand) => ({
  brand,
  needle: brand.name.replace(/[\u200c\u200e\u200f\s]/g, ''),
})).sort((a, b) => b.needle.length - a.needle.length)

/** Category hints used when the provider files a product under «other». */
const CATEGORY_KEYWORDS: Array<{ tokens: string[]; category: ProductCategory }> = [
  {
    tokens: ['ai', 'gpt', 'llm', 'chatbot', 'image generator', 'text to video', 'ai tools'],
    category: 'ai',
  },
  {
    tokens: ['streaming', 'music', 'movie', 'series', 'tv', 'anime', 'podcast'],
    category: 'streaming',
  },
  {
    tokens: ['in game', 'v bucks', 'top up', 'game pass', 'gaming'],
    category: 'gaming',
  },
  {
    tokens: ['design', 'template', 'photo editor', 'video editor', 'mockup', 'font'],
    category: 'design',
  },
  {
    tokens: ['followers', 'likes', 'views', 'verification', 'social media', 'booster'],
    category: 'social',
  },
  {
    tokens: ['vpn', 'antivirus', 'security', 'password', 'key', 'license'],
    category: 'other',
  },
]

function resolveCategory(
  title: string,
  subtitle: string | undefined,
  provided: ProductCategory,
): ProductCategory {
  if (provided !== 'other') return provided

  const text = normalize(`${title} ${subtitle ?? ''}`)
  const brandCategory = matchBrand(text)?.category
  if (brandCategory) return brandCategory

  return (
    CATEGORY_KEYWORDS.find((entry) => entry.tokens.some((token) => hasToken(text, token)))
      ?.category ?? 'other'
  )
}

const TIER_RULES: Array<{ tokens: string[]; label: string }> = [
  { tokens: ['ultimate'], label: 'اولتیمیت' },
  { tokens: ['premium', 'prem'], label: 'پریمیوم' },
  { tokens: ['family'], label: 'خانوادگی' },
  { tokens: ['business'], label: 'تجاری' },
  { tokens: ['enterprise'], label: 'سازمانی' },
  { tokens: ['team'], label: 'تیمی' },
  { tokens: ['standard'], label: 'استاندارد' },
  { tokens: ['individual'], label: 'فردی' },
  { tokens: ['personal'], label: 'شخصی' },
  { tokens: ['student'], label: 'دانشجویی' },
  { tokens: ['duo'], label: 'دو نفره' },
  { tokens: ['basic'], label: 'پایه' },
  { tokens: ['starter'], label: 'استارتر' },
  { tokens: ['advanced'], label: 'ادونس' },
  { tokens: ['super'], label: 'سوپر' },
  { tokens: ['max'], label: 'مکس' },
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
  { tokens: ['netherlands'], label: 'هلند' },
  { tokens: ['spain'], label: 'اسپانیا' },
  { tokens: ['italy'], label: 'ایتالیا' },
  { tokens: ['poland'], label: 'لهستان' },
  { tokens: ['russia'], label: 'روسیه' },
  { tokens: ['china'], label: 'چین' },
  { tokens: ['south korea', 'korea'], label: 'کره' },
  { tokens: ['sweden'], label: 'سوئد' },
  { tokens: ['switzerland'], label: 'سوئیس' },
  { tokens: ['austria'], label: 'اتریش' },
  { tokens: ['belgium'], label: 'بلژیک' },
  { tokens: ['mexico'], label: 'مکزیک' },
  { tokens: ['colombia'], label: 'کلمبیا' },
  { tokens: ['chile'], label: 'شیلی' },
  { tokens: ['peru'], label: 'پرو' },
  { tokens: ['south africa'], label: 'آفریقای جنوبی' },
  { tokens: ['saudi arabia', 'saudi'], label: 'عربستان' },
  { tokens: ['qatar'], label: 'قطر' },
  { tokens: ['kuwait'], label: 'کویت' },
  { tokens: ['iraq'], label: 'عراق' },
  { tokens: ['afghanistan'], label: 'افغانستان' },
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
  return tokenIndex(text, token) >= 0
}

function tokenIndex(text: string, token: string): number {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).exec(text)
  return match ? match.index : -1
}

function matchBrand(text: string): BrandRule | undefined {
  const alias = BRAND_ALIASES.find(({ alias }) => hasToken(text, alias))?.brand
  if (alias) return alias

  const compact = text.replace(/[\u200c\u200e\u200f\s]/g, '')
  return BRAND_NAME_MATCHERS.find(
    ({ needle }) => needle.length >= 3 && compact.includes(needle),
  )?.brand
}

/** Tier labels ordered by where they appear in the title ("Pro Plus" stays in order). */
function matchTiers(text: string): string[] {
  const found: Array<{ label: string; index: number }> = []
  for (const rule of TIER_RULES) {
    const indexes = rule.tokens
      .map((token) => tokenIndex(text, token))
      .filter((index) => index >= 0)
    if (indexes.length === 0) continue
    found.push({ label: rule.label, index: Math.min(...indexes) })
  }
  found.sort((a, b) => a.index - b.index)
  return found.map((entry) => entry.label)
}

const TITLE_EXTRAS: Array<{ tokens: string[]; label: string }> = [
  { tokens: ['all apps', 'all applications'], label: 'همه برنامه‌ها' },
  { tokens: ['api credits', 'api credit'], label: 'اعتبار API' },
]

function matchTitleExtra(text: string): string | undefined {
  return TITLE_EXTRAS.find((entry) => entry.tokens.some((token) => hasToken(text, token)))?.label
}

function matchRegion(text: string): string | undefined {
  const rule = REGION_RULES.find((entry) =>
    entry.tokens.some((token) => hasToken(text, token)),
  )
  return rule?.global ? undefined : rule?.label
}

/** Counts that read as a quota — "50M tokens", "5K credits", "20 images". */
const QUOTA_RE = /(?:tokens?|credits?|requests?|messages?|prompts?|words?|chars?|characters?|images?|gb|tb)\b/

/** Compact month suffixes that are almost always durations ("1M", "3M", "12M"). */
const COMPACT_MONTH_COUNTS = new Set([1, 2, 3, 4, 6, 12, 24])

function monthsToLabel(count: number, raw: string): string {
  if (count === 12) return '۱ ساله'
  if (count > 12 && count % 12 === 0) return `${toPersianDigits(String(count / 12))} ساله`
  return `${toPersianDigits(raw)} ماهه`
}

/**
 * `1M`, `30 days`, `12 months`, `1 year` → «۱ ماهه» / «۳۰ روزه» / «۱ ساله».
 *
 * Bare `M` is only trusted for the usual plan lengths (1/3/6/12/24 months) and
 * never when the number reads as a token/credit quota — "Claude 50M" must stay
 * «کلود», not «کلود ۵۰ ماهه».
 */
function parseDuration(text: string): string | undefined {
  const years = text.match(/(\d+)\s*(?:years?|yrs?|y)\b/)
  if (years) return `${toPersianDigits(years[1]!)} ساله`

  const months = text.match(/(\d+)\s*(?:months?|mon|mo)\b/)
  if (months) return monthsToLabel(Number(months[1]), months[1]!)

  const compactMonths = text.match(/(\d+)\s*m\b/)
  if (compactMonths && !QUOTA_RE.test(text)) {
    const count = Number(compactMonths[1])
    if (COMPACT_MONTH_COUNTS.has(count)) return monthsToLabel(count, compactMonths[1]!)
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

/** "50M tokens" → «۵۰ میلیون توکن»; other quota units stay out of the title. */
function parseQuota(text: string): string | undefined {
  const match = text.match(
    /(\d+(?:\.\d+)?)\s*(million|m|k|thousand)?\s*(tokens?|credits?|messages?|words?)\b/,
  )
  if (!match) return undefined

  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return undefined

  const unit = match[2]
  const quantity =
    unit === 'million' || unit === 'm'
      ? `${toPersianDigits(String(amount))} میلیون`
      : unit === 'k' || unit === 'thousand'
        ? `${toPersianDigits(String(amount))} هزار`
        : toPersianDigits(String(amount))

  const noun = match[3]!.toLowerCase()
  const label = noun.startsWith('token')
    ? 'توکن'
    : noun.startsWith('credit')
      ? 'اعتبار'
      : noun.startsWith('message')
        ? 'پیام'
        : 'کلمه'

  return `${quantity} ${label}`
}

/**
 * Unknown brands keep their upstream English name instead of collapsing into
 * «محصول دیجیتال»; duration/region noise is stripped because it is re-appended
 * in Persian.
 */
function englishFallbackTitle(raw: string): string {
  const cleaned = raw
    .replace(/[_/|]+/g, ' ')
    .replace(
      /\b\d+\s*(?:years?|yrs?|y|months?|mon|mo|m|days?|d|hours?|hrs?|minutes?|mins?)\b/gi,
      ' ',
    )
    .replace(/\b(?:global|worldwide|all regions)\b/gi, ' ')
    .replace(/\b(?:instant|immediate)\s+(?:delivery|activation)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || raw.trim()
}

function localizeTitle(raw: string, category: ProductCategory): string {
  if (!raw.trim()) return CATEGORY_TITLES[category]
  if (PERSIAN_RE.test(raw) && !LATIN_RE.test(raw)) return raw.trim()

  const text = normalize(raw)
  const brand = matchBrand(text)
  const tiers = matchTiers(text)
  // "YouTube Premium Family" implies Premium in the brand name; keep Family.
  const explicitTiers = tiers.filter((tier) => !brand?.name.includes(tier))
  const tierLabels =
    explicitTiers.length > 0 ? explicitTiers.slice(0, 2) : brand?.tier ? [brand.tier] : []
  const extra = matchTitleExtra(text)
  const duration = parseDuration(text)
  const quota = parseQuota(text)
  const region = matchRegion(text)
  const amount = parseAmount(text)

  const parts: string[] = []
  if (brand) {
    parts.push(brand.name)
    for (const tier of tierLabels) {
      if (!brand.name.includes(tier)) parts.push(tier)
    }
  } else {
    const fallback = englishFallbackTitle(raw)
    const kindRule = KIND_RULES.find((rule) =>
      rule.tokens.some((token) => hasToken(text, token)),
    )
    const nameHasKind =
      kindRule?.tokens.some((token) => hasToken(normalize(fallback), token)) ?? false
    parts.push(kindRule && !nameHasKind ? `${kindRule.label} ${fallback}` : fallback)
    for (const tier of tierLabels) {
      const tierRule = TIER_RULES.find((rule) => rule.label === tier)
      const nameHasTier =
        tierRule?.tokens.some((token) => hasToken(normalize(fallback), token)) ?? false
      if (!nameHasTier) parts.push(tier)
    }
  }

  if (extra) parts.push(extra)
  if (duration) parts.push(duration)
  if (quota && !duration) parts.push(quota)
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

/**
 * Upstream prose is usually English marketing copy that the phrase table cannot
 * fully translate. In that case the brand/category blurb is more useful on the
 * card than raw English, so it becomes the localized description while the
 * verbatim provider text stays available in `providerDescription`.
 */
function localizeDescription(
  raw: string | undefined,
  category: ProductCategory,
  title: string,
  brand: BrandRule | undefined,
): string {
  if (raw?.trim() && PERSIAN_RE.test(raw)) return raw.trim()

  if (raw?.trim()) {
    const translated = replacePhrases(raw)
    if (PERSIAN_RE.test(translated) && !LATIN_RE.test(translated) && translated.length >= 25) {
      return translated
    }
  }

  return `${title}؛ ${brand?.blurb ?? CATEGORY_DESCRIPTIONS[category]}`
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

/**
 * Providers sometimes put an image URL in the `icon` field; that must never be
 * rendered as an emoji. Only short, text-only glyphs are accepted.
 */
function sanitizeEmoji(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.length > 8 || /[A-Za-z0-9]/.test(trimmed) || /\s/.test(trimmed)) {
    return undefined
  }
  return trimmed
}

function resolveEmoji(
  upstream: string | undefined,
  brand: BrandRule | undefined,
  category: ProductCategory,
): string {
  if (brand?.emoji) return brand.emoji
  const clean = sanitizeEmoji(upstream)
  if (clean) return clean
  return CATEGORY_STYLE[category].emoji
}

function resolveGradient(
  upstream: string | undefined,
  brand: BrandRule | undefined,
  category: ProductCategory,
): string {
  const custom = upstream?.trim()
  if (custom && !GENERIC_GRADIENTS.has(custom)) return custom
  return brand?.gradient ?? CATEGORY_STYLE[category].gradient
}

/** Localize every customer-facing field of one provider product. */
export function localizeProviderProduct(product: AccountProduct): AccountProduct {
  const text = normalize(`${product.title} ${product.subtitle ?? ''}`)
  const brand = matchBrand(text)
  // The provider files many brands under «other»; the title usually knows better.
  const category = resolveCategory(product.title, product.subtitle, product.category)
  const title = localizeTitle(product.title, category)
  const description = localizeDescription(product.description, category, title, brand)
  const rawDescription = product.description?.trim()

  return {
    ...product,
    category,
    title,
    subtitle: localizeSubtitle(product.subtitle, category),
    description,
    // The localized copy is generated for unrecognized English prose, so the
    // upstream text is kept verbatim for the product details sheet.
    providerDescription:
      product.providerDescription ??
      (rawDescription && rawDescription !== description ? rawDescription : undefined),
    features: localizeFeatures(product.features, category),
    badge: localizeBadge(product.badge),
    deliveryTime: localizeDeliveryTime(product.deliveryTime),
    emoji: resolveEmoji(product.emoji, brand, category),
    gradient: resolveGradient(product.gradient, brand, category),
    // A second localization pass sees the Persian title, so an existing key must
    // survive it for storefront curation to keep working.
    brandKey: brand?.key ?? product.brandKey,
  }
}

/**
 * Storefront order of the «محصولات ویژه» row on the Home page. Brands are
 * curated by recognition — the row should feel hand-picked, not arbitrary.
 */
export const FEATURED_BRAND_KEYS: readonly string[] = [
  'netflix',
  'spotify',
  'chatgpt',
  'canva',
  'disney-plus',
  'youtube-premium',
  'claude',
  'adobe-cc',
]

const FEATURED_LIMIT = 5
const FEATURED_MINIMUM = 3

/** In stock first, then the cheapest tier so the row shows an entry price. */
function compareFeaturedCandidates(a: AccountProduct, b: AccountProduct): number {
  const stockRank = Number(b.stock > 0) - Number(a.stock > 0)
  if (stockRank !== 0) return stockRank
  return a.price - b.price
}

function compareFallbackCandidates(a: AccountProduct, b: AccountProduct): number {
  const rating = (b.rating ?? 0) - (a.rating ?? 0)
  if (rating !== 0) return rating
  return (b.reviewCount ?? 0) - (a.reviewCount ?? 0)
}

/**
 * Picks the Home page featured row: one in-stock offer per curated brand, then
 * popular in-stock offers when fewer than three brands are available.
 */
export function pickFeaturedProducts(
  products: AccountProduct[],
  limit = FEATURED_LIMIT,
): AccountProduct[] {
  const available = products.filter((product) => product.stock > 0)
  const picked: AccountProduct[] = []
  const pickedIds = new Set<string>()

  for (const key of FEATURED_BRAND_KEYS) {
    if (picked.length >= limit) break
    const best = available
      .filter((product) => product.brandKey === key && !pickedIds.has(product.id))
      .sort(compareFeaturedCandidates)[0]
    if (!best) continue
    picked.push(best)
    pickedIds.add(best.id)
  }

  if (picked.length >= Math.min(FEATURED_MINIMUM, available.length)) return picked

  const fallback = available
    .filter((product) => !pickedIds.has(product.id))
    .sort(compareFallbackCandidates)
  for (const product of fallback) {
    if (picked.length >= Math.min(FEATURED_MINIMUM, available.length)) break
    picked.push(product)
    pickedIds.add(product.id)
  }

  return picked
}
