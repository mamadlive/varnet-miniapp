import type { LucideIcon } from 'lucide-react'
import {
  ArrowUpRight,
  CreditCard,
  Headset,
  LayoutDashboard,
  Megaphone,
  ReceiptText,
  Server,
  Settings,
  ShoppingBag,
  TicketPercent,
  Users,
  X,
} from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { UserAvatar } from '@/components/admin/UserAvatar'
import { useAuthStore } from '@/store/authStore'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface AdminNavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

interface AdminNavGroup {
  title: string
  items: AdminNavItem[]
}

const NAV_GROUPS: AdminNavGroup[] = [
  {
    title: 'نمای کلی',
    items: [{ to: '/admin', label: 'داشبورد', icon: LayoutDashboard, end: true }],
  },
  {
    title: 'کاتالوگ',
    items: [
      { to: '/admin/products', label: 'محصولات اکانت', icon: ShoppingBag },
      { to: '/admin/vpn-servers', label: 'نودهای آی‌پی ثابت', icon: Server },
    ],
  },
  {
    title: 'عملیات',
    items: [
      { to: '/admin/orders', label: 'سفارش‌ها', icon: ReceiptText },
      { to: '/admin/receipts', label: 'تایید واریزی‌های کارت', icon: CreditCard },
      { to: '/admin/coupons', label: 'کدهای تخفیف', icon: TicketPercent },
    ],
  },
  {
    title: 'ارتباطات',
    items: [
      { to: '/admin/tickets', label: 'تیکت‌های پشتیبانی', icon: Headset },
      { to: '/admin/broadcast', label: 'پیام انبوه', icon: Megaphone },
    ],
  },
  {
    title: 'کاربران',
    items: [{ to: '/admin/users', label: 'کاربران', icon: Users }],
  },
  {
    title: 'سیستم',
    items: [{ to: '/admin/settings', label: 'تنظیمات', icon: Settings }],
  },
]

interface SidebarBodyProps {
  /** `true` renders the mobile slide-over; `false` is the responsive desktop rail. */
  expanded: boolean
  onNavigate?: () => void
  onClose?: () => void
}

function SidebarBody({ expanded, onNavigate, onClose }: SidebarBodyProps) {
  const user = useAuthStore((state) => state.user)
  const displayName = user ? `${user.firstName} ${user.lastName ?? ''}`.trim() : 'مدیر ورنت'
  const roleLabel = user?.role === 'admin' ? fa.roles.admin : 'مدیر نمایشی'

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Brand mark ------------------------------------------------------ */}
      <div
        className={cn(
          'flex h-16 shrink-0 items-center gap-2.5 border-b border-tg-separator px-4',
          expanded ? '' : 'justify-center xl:justify-start',
        )}
      >
        <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25">
          <span className="text-[15px] font-black leading-none">V</span>
          <span className="absolute end-0.5 top-0.5 size-1.5 rounded-full bg-white/75" />
        </span>
        <div className={cn('min-w-0 items-center gap-2', expanded ? 'flex' : 'hidden xl:flex')}>
          <span className="truncate text-[15px] font-semibold text-tg-text">{fa.appName}</span>
          <span className="rounded-md bg-brand-500/12 px-1.5 py-0.5 text-[10px] font-bold text-brand-600">
            {fa.roles.admin}
          </span>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن منو"
            className="ms-auto flex size-8 shrink-0 items-center justify-center rounded-lg text-tg-hint transition-colors hover:bg-tg-secondary-bg hover:text-tg-text"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {/* Grouped navigation --------------------------------------------- */}
      <nav aria-label="بخش‌های پنل مدیریت" className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
        <div className="space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p
                className={cn(
                  'px-2 pb-2 text-[10.5px] font-semibold text-tg-hint/80',
                  expanded ? 'block' : 'hidden xl:block',
                )}
              >
                {group.title}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={onNavigate}
                      title={expanded ? undefined : item.label}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex h-10 items-center gap-3 rounded-xl px-2.5 text-[13px] font-medium transition-colors',
                          expanded ? 'justify-start' : 'justify-center xl:justify-start',
                          isActive
                            ? 'bg-brand-500/10 text-brand-600'
                            : 'text-tg-hint hover:bg-tg-secondary-bg hover:text-tg-text',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive ? (
                            <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-brand-500" />
                          ) : null}
                          <Icon className="size-[18px] shrink-0" aria-hidden />
                          <span className={cn('truncate', expanded ? 'inline' : 'hidden xl:inline')}>
                            {item.label}
                          </span>
                        </>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Footer: Mini App link + session chip ---------------------------- */}
      <div className="shrink-0 space-y-2 border-t border-tg-separator p-3">
        <Link
          to="/app"
          onClick={onNavigate}
          title={expanded ? undefined : 'رفتن به مینی‌اپ'}
          className={cn(
            'flex h-10 items-center gap-2.5 rounded-xl border border-tg-separator bg-tg-bg px-2.5 text-[12.5px] font-medium text-tg-text transition-colors hover:bg-tg-secondary-bg',
            expanded ? 'justify-start' : 'justify-center xl:justify-start',
          )}
        >
          <ArrowUpRight className="size-4 shrink-0 text-tg-hint" aria-hidden />
          <span className={cn('truncate', expanded ? 'inline' : 'hidden xl:inline')}>
            رفتن به مینی‌اپ
          </span>
        </Link>

        <div
          className={cn(
            'flex items-center gap-2.5 rounded-xl bg-tg-secondary-bg p-2',
            expanded ? '' : 'justify-center xl:justify-start',
          )}
        >
          <UserAvatar name={displayName} photoUrl={user?.photoUrl} size="sm" />
          <div className={cn('min-w-0', expanded ? 'block' : 'hidden xl:block')}>
            <p className="truncate text-[12px] font-semibold text-tg-text">{displayName}</p>
            <p className="truncate text-[11px] text-tg-hint">{roleLabel}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export interface AdminSidebarProps {
  mobileOpen: boolean
  onCloseMobile: () => void
}

/**
 * Desktop admin navigation — pinned to the inline-start (right in RTL) edge.
 *
 * - ≥1280px: full 256px sidebar
 * - 1024–1279px: 72px icon rail with tooltips
 * - <1024px: hidden behind a slide-over drawer opened from the top bar
 */
export function AdminSidebar({ mobileOpen, onCloseMobile }: AdminSidebarProps) {
  return (
    <>
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-[4.5rem] flex-col border-s border-tg-separator bg-tg-bg lg:flex xl:w-64">
        <SidebarBody expanded={false} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex justify-start lg:hidden">
          <button
            type="button"
            aria-label="بستن منو"
            onClick={onCloseMobile}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="منوی مدیریت"
            className="relative flex h-full w-64 max-w-[85vw] animate-fade-in flex-col border-s border-tg-separator bg-tg-bg shadow-2xl"
          >
            <SidebarBody expanded onNavigate={onCloseMobile} onClose={onCloseMobile} />
          </aside>
        </div>
      ) : null}
    </>
  )
}
