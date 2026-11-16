import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppErrorBoundary } from '@/components/shared/AppErrorBoundary'
import { AuthGate } from '@/components/shared/AuthGate'
import { ScrollToTop } from '@/components/shared/ScrollToTop'
import { Spinner } from '@/components/ui/Spinner'
import MiniAppLayout from '@/layouts/MiniAppLayout'
import NotFoundPage from '@/pages/NotFoundPage'
import HomePage from '@/pages/miniapp/HomePage'
import MarketplacePage from '@/pages/miniapp/MarketplacePage'
import MiniAppOrdersPage from '@/pages/miniapp/OrdersPage'
import ProfilePage from '@/pages/miniapp/ProfilePage'
import SupportPage from '@/pages/miniapp/SupportPage'
import TermsPage from '@/pages/miniapp/TermsPage'
import VpnPage from '@/pages/miniapp/VpnPage'
import WalletPage from '@/pages/miniapp/WalletPage'
import { AdminGuard } from '@/routes/AdminGuard'

/**
 * VarNet route map
 * --------------------------------------------------------------------------
 *  /                 -> redirects to the Telegram Mini App
 *  /app/*            -> customer-facing Mini App (mobile first, eager: instant
 *                       first paint matters inside the Telegram WebView)
 *  /admin/*          -> desktop admin panel, code-split so its tables, charts
 *                       and icons are never downloaded by Mini App users
 *  *                 -> 404
 */
const AdminLayout = lazy(() => import('@/layouts/AdminLayout'))
const DashboardPage = lazy(() => import('@/pages/admin/DashboardPage'))
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'))
const ProductsPage = lazy(() => import('@/pages/admin/ProductsPage'))
const VpnServersPage = lazy(() => import('@/pages/admin/VpnServersPage'))
const AdminOrdersPage = lazy(() => import('@/pages/admin/OrdersPage'))
const CouponsPage = lazy(() => import('@/pages/admin/CouponsPage'))
const TicketsPage = lazy(() => import('@/pages/admin/TicketsPage'))
const BroadcastPage = lazy(() => import('@/pages/admin/BroadcastPage'))
const SettingsPage = lazy(() => import('@/pages/admin/SettingsPage'))

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-tg-secondary-bg">
      <Spinner size="lg" label="در حال بارگذاری…" />
    </div>
  )
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <AuthGate>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
            {/* ---------------------------------------------------------- */}
            {/* Telegram Mini App (customer facing, mobile first)           */}
            {/* ---------------------------------------------------------- */}
            <Route path="/app" element={<MiniAppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="marketplace" element={<MarketplacePage />} />
              <Route path="vpn" element={<VpnPage />} />
              <Route path="wallet" element={<WalletPage />} />
              <Route path="orders" element={<MiniAppOrdersPage />} />
              <Route path="support" element={<SupportPage />} />
              <Route path="terms" element={<TermsPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            {/* ---------------------------------------------------------- */}
            {/* Web admin panel (desktop first, lazy-loaded)                */}
            {/* ---------------------------------------------------------- */}
            <Route
              path="/admin"
              element={
                <AdminGuard>
                  <AdminLayout />
                </AdminGuard>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="vpn-servers" element={<VpnServersPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
              <Route path="coupons" element={<CouponsPage />} />
              <Route path="tickets" element={<TicketsPage />} />
              <Route path="broadcast" element={<BroadcastPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            {/* Root + global fallback */}
            <Route path="/" element={<Navigate to="/app" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          </Suspense>
        </AuthGate>
      </BrowserRouter>
    </AppErrorBoundary>
  )
}
