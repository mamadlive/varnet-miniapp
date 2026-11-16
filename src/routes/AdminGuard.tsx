import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Spinner } from '@/components/ui/Spinner'
import { useAdminAuthStore } from '@/store/adminAuthStore'
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
 * Access is granted by exactly two credentials:
 * - a real Telegram Mini App admin session (`role === 'admin'`, never demo), or
 * - the signed admin token issued by the Telegram-OTP web login.
 *
 * There is no browser demo bypass. Everything else is sent to `/admin/login`.
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const location = useLocation()
  const miniAppStatus = useAuthStore((state) => state.status)
  const isMiniAppAdmin = useAuthStore((state) => state.isAdmin && !state.isDemo)

  const token = useAdminAuthStore((state) => state.token)
  const adminStatus = useAdminAuthStore((state) => state.status)
  const hydrate = useAdminAuthStore((state) => state.hydrate)

  useEffect(() => {
    if (isMiniAppAdmin) return
    if (token && adminStatus === 'idle') void hydrate()
  }, [adminStatus, hydrate, isMiniAppAdmin, token])

  if (isMiniAppAdmin) return <>{children}</>

  if (!token) {
    // Wait for the Mini App boot to resolve before deciding (a Telegram admin
    // has a valid session without any OTP token).
    if (miniAppStatus === 'idle' || miniAppStatus === 'hydrating') return <GuardFallback />
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
  }

  if (adminStatus === 'idle' || adminStatus === 'checking') return <GuardFallback />
  if (adminStatus === 'authenticated') return <>{children}</>

  return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
}
