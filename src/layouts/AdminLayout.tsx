import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminTopbar } from '@/components/admin/AdminTopbar'
import { useThemeStore } from '@/store/themeStore'

/**
 * Desktop-first admin shell.
 *
 * The navigation rail is pinned to the inline-start edge (right in RTL) with a
 * sticky top bar and a single scrollable content column capped at 1400px. The
 * Mini App lives at `/app`; this shell is only mounted under `/admin/*`.
 */
export default function AdminLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const syncAdminTheme = useThemeStore((state) => state.syncAdmin)

  // The admin palette is independent of the Mini App's Telegram scheme.
  useEffect(() => {
    syncAdminTheme()
  }, [syncAdminTheme])

  // Escape + scroll-lock while the mobile drawer is visible. Navigation links
  // close the drawer themselves via `onNavigate`.
  useEffect(() => {
    if (!mobileNavOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [mobileNavOpen])

  return (
    <div className="min-h-dvh min-w-0 bg-tg-secondary-bg">
      <AdminSidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />

      <div className="min-w-0 lg:ps-[4.5rem] xl:ps-64">
        <AdminTopbar onOpenMobileNav={() => setMobileNavOpen(true)} />

        <main className="mx-auto w-full max-w-[1400px] p-4 sm:p-6 xl:p-8">
          <div className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
