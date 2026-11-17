import type {
  AccountProduct,
  AdminStats,
  Broadcast,
  Coupon,
  RevenuePoint,
  SupportTicket,
  TelegramUser,
  Transaction,
  User,
  Wallet,
} from '@/types'
import type { ProfitMargin } from '@/lib/pricing'

/**
 * Local demo data.
 *
 * Digital accounts, wallet and admin views are served from here until the
 * third-party provider proxy exists. The static-IP catalogue lives in the D1
 * `static_ip_nodes` table and is managed from the admin panel.
 */

const iso = (daysAgo: number, hoursAgo = 0): string =>
  new Date(Date.now() - daysAgo * 86_400_000 - hoursAgo * 3_600_000).toISOString()

const inDays = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString()

export const mockTelegramUser: TelegramUser = {
  id: 600_000_001,
  first_name: 'آرش',
  last_name: 'محمدی',
  username: 'varnet_demo',
  language_code: 'fa',
  is_premium: true,
}

/* -------------------------------------------------------------------------- */
/* Marketplace                                                                */
/* -------------------------------------------------------------------------- */

export const mockAccountProducts: AccountProduct[] = [
  {
    id: 'acc_netflix',
    title: 'نتفلیکس پریمیوم',
    subtitle: '۴K اولترا اچ‌دی · ۱ ماه · ۱ پروفایل',
    category: 'streaming',
    price: 450_000,
    oldPrice: 620_000,
    currency: 'IRT',
    stock: 27,
    rating: 4.9,
    reviewCount: 812,
    badge: 'پرفروش‌ترین',
    deliveryTime: 'فوری',
    description: 'پروفایل اختصاصی روی پلن ۴K اولترا اچ‌دی؛ دسترسی کامل به تمام کاتالوگ.',
    features: ['استریم ۴K اولترا اچ‌دی', 'پروفایل اختصاصی', 'تحویل فوری', 'همراه با گارانتی'],
    gradient: 'from-rose-500 via-red-500 to-orange-500',
    emoji: '🎬',
  },
  {
    id: 'acc_spotify',
    title: 'اسپاتیفای پریمیوم',
    subtitle: 'اشتراک فردی · ۱ ماه',
    category: 'streaming',
    price: 280_000,
    oldPrice: 390_000,
    currency: 'IRT',
    stock: 64,
    rating: 4.8,
    reviewCount: 1_204,
    badge: 'محبوب',
    deliveryTime: 'فوری',
    description: 'موسیقی بدون تبلیغ، دانلود آفلاین و صدای باکیفیت روی حساب شخصی خودتان.',
    features: ['شنیدن بدون تبلیغ', 'دانلود آفلاین', 'صدای باکیفیت', 'روی حساب شخصی'],
    gradient: 'from-emerald-500 via-green-500 to-teal-500',
    emoji: '🎧',
  },
  {
    id: 'acc_chatgpt',
    title: 'چت‌جی‌پی‌تی پلاس',
    subtitle: 'GPT-5 · ۱ ماه',
    category: 'ai',
    price: 1_450_000,
    oldPrice: 1_850_000,
    currency: 'IRT',
    stock: 12,
    rating: 4.9,
    reviewCount: 456,
    badge: 'پرطرفدار',
    deliveryTime: 'کمتر از ۱۵ دقیقه',
    description: 'اشتراک شخصی چت‌جی‌پی‌تی پلاس با دسترسی اولویت‌دار به جدیدترین مدل‌ها.',
    features: ['جدیدترین مدل‌ها', 'دسترسی اولویت‌دار', 'ابزارهای پیشرفته', 'گارانتی ۱ ماهه'],
    gradient: 'from-violet-500 via-purple-500 to-indigo-500',
    emoji: '🤖',
  },
  {
    id: 'acc_steam',
    title: 'استیم والت ۵۰ دلاری',
    subtitle: 'گیفت‌کارت جهانی',
    category: 'gaming',
    price: 4_750_000,
    currency: 'IRT',
    stock: 9,
    rating: 4.7,
    reviewCount: 233,
    deliveryTime: 'فوری',
    description: 'کد کیف پول جهانی استیم؛ مستقیم در کلاینت استیم خودتان فعال کنید.',
    features: ['منطقه جهانی', 'کد فوری', 'بدون تاریخ انقضا', 'بازگشت وجه در صورت نامعتبر بودن'],
    gradient: 'from-sky-500 via-blue-500 to-indigo-500',
    emoji: '🎮',
  },
  {
    id: 'acc_adobe',
    title: 'ادوبی کریتیو کلود',
    subtitle: 'همه برنامه‌ها · ۱ ماه',
    category: 'design',
    price: 1_650_000,
    oldPrice: 2_100_000,
    currency: 'IRT',
    stock: 6,
    rating: 4.6,
    reviewCount: 178,
    badge: 'محدود',
    deliveryTime: 'کمتر از ۱ ساعت',
    description: 'مجموعه کامل کریتیو کلود شامل فوتوشاپ، ایلاستریتور، پریمیر پرو و بیشتر.',
    features: ['بیش از ۲۰ برنامه', 'فضای ابری', 'اعتبار هوش مصنوعی مولد', 'همراه با گارانتی'],
    gradient: 'from-fuchsia-500 via-pink-500 to-rose-500',
    emoji: '🎨',
  },
  {
    id: 'acc_telegram',
    title: 'تلگرام پریمیوم',
    subtitle: '۱ ماه · فوری',
    category: 'social',
    price: 320_000,
    currency: 'IRT',
    stock: 41,
    rating: 4.8,
    reviewCount: 967,
    deliveryTime: 'فوری',
    description: 'آپلود ۴ گیگابایتی، دانلود سریع‌تر، استیکرهای اختصاصی و امکانات بیشتر.',
    features: ['آپلود ۴ گیگابایتی', 'دانلود سریع‌تر', 'بدون تبلیغ', 'استیکرهای پریمیوم'],
    gradient: 'from-sky-400 via-cyan-400 to-blue-500',
    emoji: '✈️',
  },
  {
    id: 'acc_canva',
    title: 'کانوا پرو',
    subtitle: '۱ سال · دعوت‌نامه',
    category: 'design',
    price: 850_000,
    currency: 'IRT',
    stock: 18,
    rating: 4.5,
    reviewCount: 312,
    deliveryTime: 'کمتر از ۱۵ دقیقه',
    description: 'یک سال کانوا پرو روی حساب شخصی خودتان — قالب‌ها، کیت برند و مجیک استودیو.',
    features: ['دسترسی ۱ ساله', 'مجیک استودیو', 'کیت برند', 'خروجی نامحدود'],
    gradient: 'from-teal-400 via-cyan-500 to-sky-500',
    emoji: '🖌️',
  },
  {
    id: 'acc_discord',
    title: 'دیسکورد نیترو',
    subtitle: 'گیمینگ · ۱ ماه',
    category: 'gaming',
    price: 620_000,
    oldPrice: 750_000,
    currency: 'IRT',
    stock: 23,
    rating: 4.7,
    reviewCount: 421,
    deliveryTime: 'فوری',
    description: 'نیتروی کامل با ۲ بوست سرور، استریم اچ‌دی و آواتارهای متحرک.',
    features: ['۲ بوست سرور', 'استریم اچ‌دی', 'ایموجی سفارشی', 'حجم آپلود بیشتر'],
    gradient: 'from-indigo-500 via-violet-500 to-purple-500',
    emoji: '💬',
  },
]

/** Ids of the built-in fixtures, so the admin can purge the demo catalogue. */
export const TEST_PRODUCT_IDS: string[] = mockAccountProducts.map((product) => product.id)

/* -------------------------------------------------------------------------- */
/* Pricing & discounts                                                        */
/* -------------------------------------------------------------------------- */

/** Seed markups on top of the provider's base prices (admin editable). */
export const mockProfitMargins: Record<string, ProfitMargin> = {
  acc_netflix: { type: 'percent', value: 12 },
  acc_chatgpt: { type: 'fixed', value: 250_000 },
}

export const mockCoupons: Coupon[] = [
  {
    id: 'coup_varnet20',
    code: 'VARNET20',
    type: 'percent',
    value: 20,
    minSubtotal: 300_000,
    maxDiscount: 200_000,
    active: true,
    usageLimit: 500,
    usedCount: 143,
    expiresAt: inDays(30),
    description: 'تخفیف ۲۰٪ برای خریدهای بالای ۳۰۰ هزار تومان',
  },
  {
    id: 'coup_welcome50',
    code: 'WELCOME50',
    type: 'fixed',
    value: 50_000,
    minSubtotal: 200_000,
    active: true,
    usageLimit: 1_000,
    usedCount: 420,
    expiresAt: inDays(60),
    description: 'هدیه خوش‌آمدگویی برای اولین خرید',
  },
  {
    id: 'coup_tether100',
    code: 'TETHER100',
    type: 'fixed',
    value: 100_000,
    minSubtotal: 1_000_000,
    active: true,
    usageLimit: 200,
    usedCount: 37,
    expiresAt: inDays(14),
    description: 'تخفیف پرداخت تتری برای سفارش‌های بزرگ',
  },
  {
    id: 'coup_vip10',
    code: 'VIP10',
    type: 'percent',
    value: 10,
    active: false,
    usageLimit: 100,
    usedCount: 88,
    description: 'کد اختصاصی مشتریان وفادار — موقتاً غیرفعال',
  },
  {
    id: 'coup_norouz15',
    code: 'NOROOZ15',
    type: 'percent',
    value: 15,
    minSubtotal: 250_000,
    active: true,
    usageLimit: 300,
    usedCount: 300,
    expiresAt: iso(14),
    description: 'کمپین نوروز — منقضی شده',
  },
]

/* -------------------------------------------------------------------------- */
/* Wallet & orders                                                            */
/* -------------------------------------------------------------------------- */

export const mockWallet: Wallet = {
  balance: 2_480_000,
  currency: 'IRT',
  pending: 0,
  lifetimeSpent: 12_847_500,
}

export const mockTransactions: Transaction[] = [
  {
    id: 'txn_1007',
    type: 'deposit',
    amount: 1_000_000,
    currency: 'IRT',
    status: 'completed',
    description: 'شارژ کیف پول · تتر (TRC20)',
    createdAt: iso(0, 3),
    reference: '0x8f2c…91ad',
  },
  {
    id: 'txn_1006',
    type: 'purchase',
    amount: -150_000,
    currency: 'IRT',
    status: 'completed',
    description: 'خرید آی‌پی ثابت · فرانکفورت',
    createdAt: iso(1, 5),
    reference: 'ord_2041',
  },
  {
    id: 'txn_1005',
    type: 'refund',
    amount: 450_000,
    currency: 'IRT',
    status: 'completed',
    description: 'بازگشت وجه · نتفلیکس پریمیوم',
    createdAt: iso(2, 1),
    reference: 'ord_2038',
  },
  {
    id: 'txn_1004',
    type: 'purchase',
    amount: -1_650_000,
    currency: 'IRT',
    status: 'completed',
    description: 'خرید ادوبی کریتیو کلود',
    createdAt: iso(4, 7),
    reference: 'ord_2035',
  },
  {
    id: 'txn_1003',
    type: 'bonus',
    amount: 25_000,
    currency: 'IRT',
    status: 'completed',
    description: 'پاداش معرفی',
    createdAt: iso(6, 2),
  },
  {
    id: 'txn_1002',
    type: 'deposit',
    amount: 500_000,
    currency: 'IRT',
    status: 'completed',
    description: 'شارژ کیف پول · کارت بانکی',
    createdAt: iso(9, 4),
    reference: 'pi_3Nk…',
  },
  {
    id: 'txn_1001',
    type: 'withdrawal',
    amount: -200_000,
    currency: 'IRT',
    status: 'pending',
    description: 'درخواست برداشت',
    createdAt: iso(11, 6),
  },
]

/* -------------------------------------------------------------------------- */
/* Support & broadcasts                                                       */
/* -------------------------------------------------------------------------- */

export const mockSupportTickets: SupportTicket[] = [
  {
    id: 'tkt_1042',
    userId: 'usr_1',
    userName: 'آرش محمدی',
    subject: 'کندی اتصال روی آی‌پی ثابت آلمان',
    category: 'technical',
    status: 'answered',
    createdAt: iso(0, 6),
    updatedAt: iso(0, 4),
    messages: [
      {
        id: 'msg_1',
        author: 'user',
        body: 'سلام، از دیروز سرعت تونل امن روی نود آلمان کم شده است. می‌شود بررسی کنید؟',
        createdAt: iso(0, 6),
      },
      {
        id: 'msg_2',
        author: 'support',
        body: 'سلام، نود فرانکفورت را بررسی کردیم؛ پروفایل شما روی پورت با بار کمتر منتقل شد. لطفاً اتصال OpenVPN را یک‌بار قطع و وصل کنید و نتیجه را همین‌جا بنویسید.',
        createdAt: iso(0, 4),
      },
    ],
  },
  {
    id: 'tkt_1041',
    userId: 'usr_1',
    userName: 'آرش محمدی',
    subject: 'درخواست تمدید پیش از پایان حجم',
    category: 'order',
    status: 'open',
    createdAt: iso(1, 3),
    updatedAt: iso(1, 3),
    messages: [
      {
        id: 'msg_3',
        author: 'user',
        body: 'بسته ۱۰ گیگابایتی‌ام رو به اتمام است. آیا می‌توانم همین حالا تمدید کنم و تنظیمات فعلی را نگه دارم؟',
        createdAt: iso(1, 3),
      },
    ],
  },
  {
    id: 'tkt_1038',
    userId: 'usr_3',
    userName: 'محمدرضا رضایی',
    subject: 'مشکل در ورود به اکانت چت‌جی‌پی‌تی',
    category: 'technical',
    status: 'open',
    createdAt: iso(2, 8),
    updatedAt: iso(2, 8),
    messages: [
      {
        id: 'msg_4',
        author: 'user',
        body: 'بعد از خرید، اطلاعات ورود را دریافت کردم اما پیام «حساب موقتاً قفل است» نمایش داده می‌شود.',
        createdAt: iso(2, 8),
      },
    ],
  },
  {
    id: 'tkt_1035',
    userId: 'usr_2',
    userName: 'سارا احمدی',
    subject: 'دریافت فاکتور رسمی خرید',
    category: 'billing',
    status: 'closed',
    createdAt: iso(5, 2),
    updatedAt: iso(4, 9),
    messages: [
      {
        id: 'msg_5',
        author: 'user',
        body: 'برای سفارش ord_2040 فاکتور رسمی لازم دارم. امکان ارسال وجود دارد؟',
        createdAt: iso(5, 2),
      },
      {
        id: 'msg_6',
        author: 'support',
        body: 'فاکتور سفارش شما در بخش سفارش‌ها قابل دریافت است و نسخه PDF هم به تلگرام‌تان ارسال شد. تیکت بسته می‌شود.',
        createdAt: iso(4, 9),
      },
    ],
  },
]

export const mockBroadcasts: Broadcast[] = [
  {
    id: 'bcast_302',
    message:
      'ظرفیت جدید آی‌پی ثابت آلمان اضافه شد. سرویس‌ها با تحویل تقریباً فوری و آی‌پی اختصاصی در دسترس‌اند.',
    audience: 'all_users',
    recipients: 1_284,
    sentAt: iso(0, 7),
  },
  {
    id: 'bcast_301',
    message: 'به‌روزرسانی تونل امن OpenVPN (UDP) انجام شد؛ برای اعمال تنظیمات جدید یک‌بار به پروفایل وصل شوید.',
    audience: 'channel',
    recipients: 8_420,
    sentAt: iso(3, 2),
  },
]

/* -------------------------------------------------------------------------- */
/* Admin                                                                      */
/* -------------------------------------------------------------------------- */

export const mockUsers: User[] = [
  {
    id: 'usr_1',
    telegramId: 600_000_001,
    username: 'varnet_demo',
    firstName: 'آرش',
    lastName: 'محمدی',
    role: 'user',
    balance: 2_480_000,
    currency: 'IRT',
    createdAt: iso(180),
  },
  {
    id: 'usr_2',
    telegramId: 600_000_002,
    username: 'sara_ahmadi',
    firstName: 'سارا',
    lastName: 'احمدی',
    role: 'user',
    balance: 362_500,
    currency: 'IRT',
    createdAt: iso(120),
  },
  {
    id: 'usr_3',
    telegramId: 600_000_003,
    username: 'mreza',
    firstName: 'محمدرضا',
    lastName: 'رضایی',
    role: 'user',
    balance: 120_000,
    currency: 'IRT',
    createdAt: iso(96),
  },
  {
    id: 'usr_4',
    telegramId: 600_000_004,
    username: 'nadia_k',
    firstName: 'نادیا',
    lastName: 'کریمی',
    role: 'user',
    balance: 4_021_000,
    currency: 'IRT',
    createdAt: iso(64),
  },
  {
    id: 'usr_5',
    telegramId: 600_000_005,
    username: 'ali_h',
    firstName: 'علی',
    lastName: 'حسینی',
    role: 'admin',
    balance: 0,
    currency: 'IRT',
    createdAt: iso(240),
  },
]

export const mockAdminStats: AdminStats = {
  totalRevenue: 1_248_000_000,
  revenueChange: 12.4,
  activeUsers: 1_284,
  usersChange: 8.2,
  ordersToday: 42,
  ordersChange: -3.1,
  vpnNodesOnline: 1,
  vpnNodesTotal: 6,
}

export const mockRevenueSeries: RevenuePoint[] = [
  { label: 'شنبه', revenue: 112_000_000, orders: 18 },
  { label: 'یکشنبه', revenue: 148_000_000, orders: 24 },
  { label: 'دوشنبه', revenue: 131_000_000, orders: 21 },
  { label: 'سه‌شنبه', revenue: 186_000_000, orders: 29 },
  { label: 'چهارشنبه', revenue: 224_000_000, orders: 36 },
  { label: 'پنجشنبه', revenue: 202_000_000, orders: 31 },
  { label: 'جمعه', revenue: 245_000_000, orders: 42 },
]
