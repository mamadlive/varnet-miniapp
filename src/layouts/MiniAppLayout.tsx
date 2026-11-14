import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Home, LayoutGrid, ShieldCheck, UserRound, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui'
import { env } from '@/config/env'
import { useTelegram } from '@/hooks/useTelegram'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/store/themeStore'

interface Tab {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const TABS: Tab[] = [
  { to: '/app', label: fa.nav.home, icon: Home, end: true },
  { to: '/app/marketplace', label: fa.nav.marketplace, icon: LayoutGrid },
  { to: '/app/vpn', label: fa.nav.vpn, icon: ShieldCheck },
  { to: '/app/wallet', label: fa.nav.wallet, icon: Wallet },
  { to: '/app/profile', label: fa.nav.profile, icon: UserRound },
]

/**
 * Customer-facing Telegram Mini App shell.
 *
 * Mobile-first 480px column with a sticky themed header, page outlet and a
 * fixed five-tab bottom bar that respects the home-indicator safe area.
 */
export default function MiniAppLayout() {
  const { isTelegram, haptic } = useTelegram()
  const syncMiniAppTheme = useThemeStore((state) => state.syncMiniApp)
  const showDemoChip = env.demoMode && !isTelegram

  // Inside Telegram the client palette is authoritative; a browser preview
  // follows the OS so the admin's dark choice never leaks into the storefront.
  useEffect(() => {
    syncMiniAppTheme()
  }, [isTelegram, syncMiniAppTheme])

  return (
    <div className="flex min-h-dvh flex-col bg-tg-secondary-bg">
      <header className="safe-top sticky top-0 z-40 border-b border-tg-separator bg-tg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[480px] items-center gap-2.5 px-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-500/25">
            <ShieldCheck className="size-5" aria-hidden />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-tight text-tg-text">{env.appName}</p>
            <p className="truncate text-[11px] leading-tight text-tg-hint">{env.appTagline}</p>
          </div>

          {showDemoChip ? (
            <Badge tone="warning" size="sm" className="shrink-0">
              {fa.common.demo}
            </Badge>
          ) : null}
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <nav
        aria-label="ناوبری اصلی"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-tg-separator bg-tg-bg/90 backdrop-blur-xl"
      >
        <div className="safe-bottom mx-auto grid w-full max-w-[480px] grid-cols-5 px-2 pt-1">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                onClick={() => haptic('light')}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 pb-0.5 text-[10px] font-medium transition-colors',
                    isActive ? 'text-tg-button' : 'text-tg-hint hover:text-tg-text',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200',
                        isActive ? 'bg-tg-button/12' : 'bg-transparent',
                      )}
                    >
                      <Icon
                        aria-hidden
                        className={cn('size-[21px]', isActive ? 'stroke-[2.4]' : 'stroke-[1.9]')}
                      />
                    </span>
                    <span className="truncate">{tab.label}</span>
                  </>
                )}
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
