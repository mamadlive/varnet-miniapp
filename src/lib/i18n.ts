import type {
  BroadcastAudience,
  OrderKind,
  OrderStatus,
  ProductCategory,
  SupportTicketCategory,
  SupportTicketStatus,
  TransactionStatus,
  TransactionType,
  UserRole,
  VpnServerStatus,
} from '@/types'

/**
 * Central Persian (fa-IR) copy for labels shared across screens.
 *
 * The whole product is Persian-first, so page-specific copy lives inline in
 * each page/component (like any single-language app), while reusable domain
 * labels (statuses, categories, navigation, shared actions) are kept here so
 * admin tables and Mini App cards can never drift apart.
 */

export const LOCALE = 'fa-IR' as const

const categories: Record<ProductCategory, string> = {
  streaming: 'استریم',
  ai: 'هوش مصنوعی',
  gaming: 'گیمینگ',
  design: 'طراحی',
  social: 'شبکه‌های اجتماعی',
  other: 'سایر',
}

const orderStatuses: Record<OrderStatus, string> = {
  pending: 'در انتظار',
  paid: 'پرداخت‌شده',
  provisioning: 'در حال فعال‌سازی',
  completed: 'تکمیل‌شده',
  cancelled: 'لغوشده',
  refunded: 'بازگشت وجه',
}

const orderKinds: Record<OrderKind, string> = {
  account: 'اکانت',
  vpn: 'آی‌پی ثابت اختصاصی',
}

const transactionTypes: Record<TransactionType, string> = {
  deposit: 'واریز',
  purchase: 'خرید',
  refund: 'بازگشت وجه',
  withdrawal: 'برداشت',
  bonus: 'پاداش',
}

const transactionStatuses: Record<TransactionStatus, string> = {
  pending: 'در انتظار',
  completed: 'انجام‌شده',
  failed: 'ناموفق',
}

const vpnStatuses: Record<VpnServerStatus, string> = {
  online: 'آنلاین',
  offline: 'آفلاین',
  maintenance: 'در دست تعمیر',
  degraded: 'کاهش کیفیت',
  coming_soon: 'به‌زودی',
}

const ticketCategories: Record<SupportTicketCategory, string> = {
  technical: 'مشکل فنی',
  billing: 'مالی و پرداخت',
  order: 'سفارش و تحویل',
  other: 'سایر',
}

const ticketStatuses: Record<SupportTicketStatus, string> = {
  open: 'در انتظار پاسخ',
  answered: 'پاسخ داده شد',
  closed: 'بسته‌شده',
}

const broadcastAudiences: Record<BroadcastAudience, string> = {
  all_users: 'همه کاربران ربات',
  channel: 'کانال اصلی',
}

const roles: Record<UserRole, string> = {
  user: 'کاربر',
  admin: 'مدیر',
}

export const fa = {
  appName: 'ورنت',
  tagline: 'اکانت‌های دیجیتال و آی‌پی ثابت',
  locale: LOCALE,

  nav: {
    home: 'خانه',
    marketplace: 'بازارچه',
    vpn: 'آی‌پی ثابت',
    wallet: 'کیف پول',
    orders: 'سفارش‌ها',
    profile: 'پروفایل',
  },

  common: {
    purchase: 'خرید',
    confirmAndPay: 'تایید و پرداخت',
    cancel: 'انصراف',
    search: 'جستجو',
    retry: 'تلاش دوباره',
    loading: 'در حال بارگذاری…',
    available: 'موجود',
    unavailable: 'ناموجود',
    soldOut: 'ناموجود',
    inStock: 'موجود',
    items: 'مورد',
    seeAll: 'مشاهده همه',
    viewAll: 'مشاهده همه',
    demo: 'نمایشی',
    close: 'بستن',
    all: 'همه',
    back: 'بازگشت',
    edit: 'ویرایش',
    delete: 'حذف',
    save: 'ذخیره',
    refresh: 'بازآوری',
    noResults: 'نتیجه‌ای یافت نشد',
  },

  marketplace: {
    title: 'بازارچه',
    subtitle: 'اکانت‌های پرمیوم و آی‌پی ثابت — تحویل فوری.',
    premiumAccounts: 'اکانت‌های پرمیوم',
    staticIpVpns: 'آی‌پی ثابت اختصاصی',
    walletBalance: 'موجودی کیف پول',
    curated: 'منتخب',
    purchaseConfirmTitle: 'تایید خرید',
    purchaseConfirm: (title: string, price: string) =>
      `آیا از خرید «${title}» با قیمت ${price} مطمئن هستید؟`,
    purchaseSuccess: (title: string) => `خرید ثبت شد · ${title}`,
    purchaseNote: 'پس از تایید، خرید در کنسول ثبت می‌شود (نسخه نمایشی).',
  },

  wallet: {
    title: 'کیف پول',
    balance: 'موجودی',
    topUp: 'افزایش موجودی',
    transactions: 'تراکنش‌ها',
    noTransactions: 'هنوز تراکنشی ثبت نشده است.',
  },

  categories,
  orderStatuses,
  orderKinds,
  transactionTypes,
  transactionStatuses,
  vpnStatuses,
  ticketCategories,
  ticketStatuses,
  broadcastAudiences,
  roles,
} as const

export type FaDictionary = typeof fa
