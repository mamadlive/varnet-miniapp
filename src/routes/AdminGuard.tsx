import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Spinner } from '@/components/ui/Spinner'
import { env } from '@/config/env'
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
 * - With `VITE_DEMO_MODE=true` the panel is always reachable so the skeleton
 *   can be reviewed without a backend session.
 * - Otherwise the signed-in user must have `role === 'admin'` (JWT claim set
 *   by `POST /auth/telegram`).
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const status = useAuthStore((state) => state.status)
  const isAdmin = useAuthStore((state) => state.isAdmin)
  const location = useLocation()

  if (env.demoMode) return <>{children}</>

  if (status === 'idle' || status === 'hydrating') return <GuardFallback />

  if (!isAdmin) {
    return <Navigate to="/app" replace state={{ blockedFrom: location.pathname }} />
  }

  return <>{children}</>
}
