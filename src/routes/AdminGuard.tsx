import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Spinner } from '@/components/ui/Spinner'
import { useAuthStore } from '@/store/authStore'

interface AdminGuardProps {
  children: ReactNode
}

function GuardFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-tg-secondary-bg">
      <Spinner label="در حال بررسی دسترسی مدیر…" />
    </div>
  )
}

/**
 * Route guard for `/admin/*`.
 *
 * - Only the limited browser preview (`isDemo`) bypasses the role check so the
 *   panel skeleton can be reviewed without a Telegram session.
 * - Inside Telegram the user must have `role === 'admin'` from D1 (returned by
 *   `POST /api/auth/telegram`).
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const status = useAuthStore((state) => state.status)
  const isAdmin = useAuthStore((state) => state.isAdmin)
  const isDemo = useAuthStore((state) => state.isDemo)
  const location = useLocation()

  if (isDemo) return <>{children}</>

  if (status === 'idle' || status === 'hydrating') return <GuardFallback />

  if (!isAdmin) {
    return <Navigate to="/app" replace state={{ blockedFrom: location.pathname }} />
  }

  return <>{children}</>
}
