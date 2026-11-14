import { Bell, ChevronDown, Menu, Moon, Search, Sun } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { UserAvatar } from '@/components/admin/UserAvatar'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'

const SECTION_TITLES: Array<{ path: string; title: string }> = [
  { path: '/admin/users', title: 'کاربران' },
  { path: '/admin/products', title: 'محصولات اکانت' },
  { path: '/admin/vpn-servers', title: 'نودهای آی‌پی ثابت' },
  { path: '/admin/orders', title: 'سفارش‌ها' },
  { path: '/admin/coupons', title: 'کدهای تخفیف' },
  { path: '/admin/tickets', title: 'تیکت‌های پشتیبانی' },
  { path: '/admin/broadcast', title: 'پیام انبوه' },
  { path: '/admin/settings', title: 'تنظیمات' },
  { path: '/admin', title: 'نمای کلی' },
]

function resolveSectionTitle(pathname: string): string {
  const match = SECTION_TITLES.find((section) =>
    section.path === '/admin' ? pathname === '/admin' : pathname.startsWith(section.path),
  )
  return match?.title ?? 'پنل مدیریت'
}

export interface AdminTopbarProps {
  onOpenMobileNav: () => void
}

/** Sticky desktop header: section context, global search, notifications, account. */
export function AdminTopbar({ onOpenMobileNav }: AdminTopbarProps) {
  const user = useAuthStore((state) => state.user)
  const theme = useThemeStore((state) => state.theme)
  const toggleTheme = useThemeStore((state) => state.toggleAdminTheme)
  const { pathname } = useLocation()
  const sectionTitle = resolveSectionTitle(pathname)
  const displayName = user ? `${user.firstName} ${user.lastName ?? ''}`.trim() : 'مدیر ورنت'
  const firstName = user?.firstName ?? 'مدیر'
  const isDark = theme === 'dark'

  return (
    <header className="sticky top-0 z-30 border-b border-tg-separator bg-tg-bg/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6 xl:px-8">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="باز کردن منو"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-tg-separator bg-tg-bg text-tg-hint transition-colors hover:bg-tg-secondary-bg hover:text-tg-text lg:hidden"
        >
          <Menu className="size-[18px]" aria-hidden />
        </button>

        <div className="min-w-0 flex-1">
          <p className="hidden text-[10.5px] font-semibold text-tg-hint sm:block">پنل مدیریت</p>
          <p className="truncate text-[14px] font-semibold text-tg-text">{sectionTitle}</p>
        </div>

        <div className="hidden w-64 shrink-0 md:block xl:w-80">
          <Input
            icon={Search}
            placeholder="جستجوی کاربران، سفارش‌ها…"
            aria-label="جستجو (به‌زودی)"
            wrapperClassName="w-full"
          />
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-pressed={isDark}
          aria-label={isDark ? 'تغییر به حالت روشن' : 'تغییر به حالت تاریک'}
          title={isDark ? 'حالت روشن' : 'حالت تاریک'}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-tg-separator bg-tg-bg text-tg-hint transition-colors hover:bg-tg-secondary-bg hover:text-tg-text"
        >
          {isDark ? (
            <Sun className="size-[18px]" aria-hidden />
          ) : (
            <Moon className="size-[18px]" aria-hidden />
          )}
        </button>

        <button
          type="button"
          aria-label="اعلان‌ها (به‌زودی)"
          title="اعلان‌ها (به‌زودی)"
          className="relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-tg-separator bg-tg-bg text-tg-hint transition-colors hover:bg-tg-secondary-bg hover:text-tg-text"
        >
          <Bell className="size-[18px]" aria-hidden />
          <span className="absolute end-2.5 top-2.5 size-1.5 rounded-full bg-rose-500 ring-2 ring-tg-bg" />
        </button>

        <button
          type="button"
          aria-label="منوی حساب (به‌زودی)"
          title="منوی حساب (به‌زودی)"
          className="flex shrink-0 items-center gap-2 rounded-xl border border-tg-separator bg-tg-bg p-1 pe-2 transition-colors hover:bg-tg-secondary-bg"
        >
          <UserAvatar name={displayName} photoUrl={user?.photoUrl} size="sm" />
          <span className="hidden max-w-24 truncate text-[12.5px] font-medium text-tg-text sm:block">
            {firstName}
          </span>
          <ChevronDown className="hidden size-3.5 text-tg-hint sm:block" aria-hidden />
        </button>
      </div>
    </header>
  )
}
