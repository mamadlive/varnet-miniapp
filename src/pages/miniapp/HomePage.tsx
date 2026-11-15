import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  Globe,
  PackageOpen,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react'
import {
  AccountOfferCard,
  AccountOfferCardSkeleton,
  FeaturedOfferCard,
  MarketplaceTabs,
  PurchaseConfirmSheet,
  VpnOfferCard,
  VpnOfferCardSkeleton,
} from '@/components/marketplace'
import type { MarketplaceTab, PurchaseTarget } from '@/components/marketplace'
import { toFlagEmoji } from '@/components/miniapp/flags'
import { OpenVpnNotice } from '@/components/miniapp/OpenVpnNotice'
import { VpnDeliverySheet } from '@/components/miniapp/VpnDeliverySheet'
import { WalletPill } from '@/components/miniapp/WalletPill'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { useTelegram } from '@/hooks/useTelegram'
import { formatCount } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { pickFeaturedProducts } from '@/lib/providerMapper'
import { initials } from '@/lib/utils'
import { listAccountProducts } from '@/services/accounts.service'
import { listVpnPlans } from '@/services/vpn.service'
import { useAuthStore } from '@/store/authStore'
import { useWalletStore } from '@/store/walletStore'
import type { AccountProduct, Currency, VpnPlan } from '@/types'

function greetingForHour(hour: number): string {
  if (hour < 5) return 'شب بخیر'
  if (hour < 12) return 'صبح بخیر'
  if (hour < 18) return 'وقت بخیر'
  return 'عصر بخیر'
}

// Evaluated once when the module loads — the greeting only needs to be roughly right.
const GREETING = greetingForHour(new Date().getHours())

const TRUST_POINTS = [
  { icon: Zap, label: 'تحویل فوری' },
  { icon: ShieldCheck, label: 'همراه با گارانتی' },
  { icon: Wallet, label: 'پرداخت از کیف پول' },
]

/** Everything the purchase confirmation sheet needs about the tapped offer. */
interface PendingPurchase {
  target: PurchaseTarget
  price: number
  currency: Currency
  description?: string
  emoji?: string
}

function SectionHeading({
  title,
  subtitle,
  count,
}: {
  title: string
  subtitle: string
  count: number
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-0.5">
      <div className="min-w-0">
        <h3 dir="auto" className="text-[15px] font-bold text-tg-text">
          {title}
        </h3>
        <p dir="auto" className="mt-0.5 text-[11.5px] leading-snug text-tg-hint">
          {subtitle}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-tg-bg px-2 py-1 text-[10px] font-semibold tabular-nums text-tg-hint ring-1 ring-tg-separator">
        {formatCount(count)} {fa.common.items}
      </span>
    </div>
  )
}

function TrustStrip() {
  return (
    <div className="mt-6 grid grid-cols-3 gap-2">
      {TRUST_POINTS.map((point) => {
        const Icon = point.icon
        return (
          <div
            key={point.label}
            className="flex flex-col items-center gap-1 rounded-2xl border border-tg-separator bg-tg-bg px-2 py-2.5 text-center shadow-sm"
          >
            <span className="flex size-8 items-center justify-center rounded-xl bg-tg-button/10 text-tg-button">
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="text-[10px] font-medium leading-tight text-tg-hint">{point.label}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Mini App marketplace (`/app`).
 *
 * One screen, two catalogues: digital accounts and Static IP VPNs. Data comes
 * from the service layer (mock-backed until the FastAPI endpoints are wired).
 * Tapping «خرید» opens the shared `PurchaseConfirmSheet`; only «تایید و پرداخت»
 * records the purchase (console, for now) and shows the success toast.
 */
export default function HomePage() {
  const { haptic } = useTelegram()

  const user = useAuthStore((state) => state.user)
  const balance = useWalletStore((state) => state.balance)
  const currency = useWalletStore((state) => state.currency)

  const [tab, setTab] = useState<MarketplaceTab>('accounts')
  const [products, setProducts] = useState<AccountProduct[]>([])
  const [plans, setPlans] = useState<VpnPlan[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [plansLoading, setPlansLoading] = useState(true)
  const [productsFailed, setProductsFailed] = useState(false)
  const [plansFailed, setPlansFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [pendingPurchase, setPendingPurchase] = useState<PendingPurchase | null>(null)
  const [delivery, setDelivery] = useState<{ planTitle: string } | null>(null)
  const [toast, setToast] = useState<PurchaseTarget | null>(null)
  const toastTimer = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    listAccountProducts()
      .then((result) => {
        if (!cancelled) setProducts(result)
      })
      .catch(() => {
        if (!cancelled) {
          setProducts([])
          setProductsFailed(true)
        }
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false)
      })

    listVpnPlans()
      .then((result) => {
        if (!cancelled) setPlans(result)
      })
      .catch(() => {
        if (!cancelled) {
          setPlans([])
          setPlansFailed(true)
        }
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [reloadKey])

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    },
    [],
  )

  const counts = useMemo<Record<MarketplaceTab, number>>(
    () => ({ accounts: products.length, vpn: plans.length }),
    [products.length, plans.length],
  )

  const featured = useMemo(() => pickFeaturedProducts(products), [products])

  const handleTabChange = useCallback(
    (next: MarketplaceTab) => {
      haptic('light')
      setTab(next)
    },
    [haptic],
  )

  const retry = useCallback(() => {
    setProductsLoading(true)
    setPlansLoading(true)
    setProductsFailed(false)
    setPlansFailed(false)
    setReloadKey((key) => key + 1)
  }, [])

  /** Opens the confirmation sheet — never logs anything by itself. */
  const handlePurchase = useCallback(
    (target: PurchaseTarget) => {
      haptic('light')

      const product = products.find((item) => item.id === target.id)
      if (product) {
        setPendingPurchase({
          target,
          price: product.price,
          currency: product.currency,
          description: product.subtitle ?? product.description,
          emoji: product.emoji,
        })
        return
      }

      const plan = plans.find((item) => item.id === target.id)
      if (plan) {
        setPendingPurchase({
          target,
          price: plan.price,
          currency: plan.currency,
          description: `${plan.location} · ${formatCount(plan.durationDays)} روز`,
          emoji: toFlagEmoji(plan.countryCode),
        })
        return
      }

      setPendingPurchase({ target, price: 0, currency: 'IRT' })
    },
    [haptic, plans, products],
  )

  const handlePurchaseConfirm = useCallback(
    (target: PurchaseTarget) => {
      setPendingPurchase(null)

      if (plans.some((plan) => plan.id === target.id)) {
        setDelivery({ planTitle: target.title })
        return
      }

      setToast(target)
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => setToast(null), 3000)
    },
    [plans],
  )

  const handlePurchaseCancel = useCallback(() => {
    setPendingPurchase(null)
  }, [])

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'مهمان ورنت'

  return (
    <div className="tg-page pt-4">
      {/* ---------------------------------------------------------------- */}
      {/* Top bar: greeting + wallet balance                                */}
      {/* ---------------------------------------------------------------- */}
      <header className="flex animate-fade-in items-center gap-3">
        <Link
          to="/app/profile"
          aria-label="باز کردن پروفایل"
          onClick={() => haptic('light')}
          className="shrink-0 rounded-full transition-transform active:scale-95"
        >
          {user?.photoUrl ? (
            <img
              src={user.photoUrl}
              alt={displayName}
              className="size-11 rounded-full border border-tg-separator object-cover"
            />
          ) : (
            <span className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[13px] font-bold text-white shadow-sm">
              {initials(displayName)}
            </span>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-medium leading-tight text-tg-hint">{GREETING} 👋</p>
          <h1 dir="auto" className="truncate text-[19px] font-bold leading-tight text-tg-text">
            {user?.firstName ?? 'خوش آمدید'}
          </h1>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="pe-1 text-[9.5px] font-semibold text-tg-hint">
            {fa.marketplace.walletBalance}
          </span>
          <WalletPill balance={balance} currency={currency} />
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Title                                                             */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-5 flex items-start justify-between gap-3 animate-fade-in">
        <div className="min-w-0">
          <h2 className="text-[22px] font-bold leading-tight text-tg-text">
            {fa.marketplace.title}
          </h2>
          <p className="mt-0.5 text-[12px] leading-snug text-tg-hint">
            {fa.marketplace.subtitle}
          </p>
        </div>
        <span className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-tg-separator bg-tg-bg px-2 py-1 text-[10px] font-semibold text-tg-hint shadow-sm">
          <Sparkles className="size-3 text-brand-500" aria-hidden />
          {fa.marketplace.curated}
        </span>
      </div>

      <MarketplaceTabs
        value={tab}
        counts={counts}
        onChange={handleTabChange}
        className="mt-4"
      />

      {/* ---------------------------------------------------------------- */}
      {/* Panel: Premium Accounts                                           */}
      {/* ---------------------------------------------------------------- */}
      {tab === 'accounts' ? (
        <section
          key="accounts"
          role="tabpanel"
          id="marketplace-panel-accounts"
          aria-labelledby="marketplace-tab-accounts"
          className="mt-5 animate-fade-in"
        >
          {featured.length > 0 ? (
            <div className="mb-6" aria-labelledby="featured-products-heading">
              <div className="mb-2.5 flex items-end justify-between gap-3 px-0.5">
                <div className="min-w-0">
                  <h3
                    id="featured-products-heading"
                    className="flex items-center gap-1.5 text-[15px] font-bold text-tg-text"
                  >
                    <Sparkles className="size-4 text-brand-500" aria-hidden />
                    محصولات ویژه
                  </h3>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-tg-hint">
                    محبوب‌ترین اشتراک‌ها، دست‌چین‌شده با تحویل فوری
                  </p>
                </div>
                <span className="shrink-0 text-[10.5px] font-medium text-tg-hint">پیشنهاد ما</span>
              </div>
              <div
                role="group"
                aria-label="محصولات ویژه"
                tabIndex={0}
                className="hide-scrollbar -mx-4 flex flex-nowrap snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-px-4 px-4 pb-1 [-webkit-overflow-scrolling:touch]"
              >
                {featured.map((product, index) => (
                  <FeaturedOfferCard
                    key={product.id}
                    product={product}
                    onPurchase={handlePurchase}
                    style={{ animationDelay: `${index * 40}ms` }}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <SectionHeading
            title={fa.marketplace.premiumAccounts}
            subtitle="استریم، هوش مصنوعی، گیمینگ و اشتراک‌های طراحی"
            count={counts.accounts}
          />

          {productsLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <AccountOfferCardSkeleton key={index} />
              ))}
            </div>
          ) : productsFailed ? (
            <Card padded={false}>
              <EmptyState
                icon={RefreshCw}
                title="بارگذاری اکانت‌ها ناموفق بود"
                description="در حال حاضر به کاتالوگ دسترسی نداریم. اتصال خود را بررسی کنید و دوباره تلاش کنید."
                action={
                  <Button size="sm" variant="secondary" onClick={retry}>
                    {fa.common.retry}
                  </Button>
                }
              />
            </Card>
          ) : products.length === 0 ? (
            <Card padded={false}>
              <EmptyState
                icon={PackageOpen}
                title="اکانتی در انبار نیست"
                description="اشتراک‌های جدید در طول روز اضافه می‌شوند. کمی بعد دوباره سر بزنید."
              />
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {products.map((product, index) => (
                <AccountOfferCard
                  key={product.id}
                  product={product}
                  onPurchase={handlePurchase}
                  style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        /* -------------------------------------------------------------- */
        /* Panel: Static IP VPNs                                          */
        /* -------------------------------------------------------------- */
        <section
          key="vpn"
          role="tabpanel"
          id="marketplace-panel-vpn"
          aria-labelledby="marketplace-tab-vpn"
          className="mt-5 animate-fade-in"
        >
          <SectionHeading
            title={fa.marketplace.staticIpVpns}
            subtitle="آی‌پی ثابت اختصاصی روی تونل امن OpenVPN (UDP)"
            count={counts.vpn}
          />

          {plansLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <VpnOfferCardSkeleton key={index} />
              ))}
            </div>
          ) : plansFailed ? (
            <Card padded={false}>
              <EmptyState
                icon={RefreshCw}
                title="دریافت پیشنهادهای آی‌پی ثابت ناموفق بود"
                description="در حال حاضر به کاتالوگ نودها دسترسی نداریم. اتصال خود را بررسی کنید و دوباره تلاش کنید."
                action={
                  <Button size="sm" variant="secondary" onClick={retry}>
                    {fa.common.retry}
                  </Button>
                }
              />
            </Card>
          ) : plans.length === 0 ? (
            <Card padded={false}>
              <EmptyState
                icon={Globe}
                title="همه نودها ناموجودند"
                description="ظرفیت آی‌پی ثابت به‌سرعت تکمیل می‌شود. هر هفته ظرفیت جدیدی اضافه می‌شود."
              />
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {plans.map((plan, index) => (
                <VpnOfferCard
                  key={plan.id}
                  plan={plan}
                  onPurchase={handlePurchase}
                  style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
                />
              ))}
            </div>
          )}

          <div className="mt-3 rounded-2xl border border-tg-separator bg-tg-bg p-3 shadow-sm">
            <p className="flex items-start gap-2 text-[11px] leading-snug text-tg-hint">
              <Zap className="mt-0.5 size-3.5 shrink-0 text-brand-500" aria-hidden />
              <span>
                <span className="font-semibold text-tg-text">
                  تحویل تقریباً فوری پس از تایید پرداخت.
                </span>{' '}
                نام کاربری و رمز روی تونل امن OpenVPN (UDP) به‌صورت خودکار تزریق و پروفایل شما در
                بخش سفارش‌ها تحویل داده می‌شود.
              </span>
            </p>
          </div>

          <OpenVpnNotice className="mt-3" compact />
        </section>
      )}

      <TrustStrip />

      <p className="mt-6 text-center text-[10.5px] text-tg-hint">
        ورنت · اکانت‌های دیجیتال و آی‌پی ثابت
      </p>

      {/* Purchase feedback (demo mode — the real flow opens checkout) */}
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
          <div
            role="status"
            aria-live="polite"
            className="flex max-w-full animate-slide-up items-center gap-2 rounded-full bg-tg-button px-4 py-2.5 text-[12px] font-medium text-tg-button-text shadow-lg shadow-black/20"
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{fa.marketplace.purchaseSuccess(toast.title)}</span>
          </div>
        </div>
      ) : null}

      <PurchaseConfirmSheet
        open={pendingPurchase !== null}
        target={pendingPurchase?.target ?? null}
        price={pendingPurchase?.price ?? 0}
        currency={pendingPurchase?.currency ?? 'IRT'}
        description={pendingPurchase?.description}
        emoji={pendingPurchase?.emoji}
        onConfirm={handlePurchaseConfirm}
        onCancel={handlePurchaseCancel}
      />

      <VpnDeliverySheet
        open={delivery !== null}
        planTitle={delivery?.planTitle ?? ''}
        onClose={() => setDelivery(null)}
      />
    </div>
  )
}
