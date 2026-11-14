import { useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  CheckCircle2,
  Globe,
  KeyRound,
  RefreshCw,
  Server,
  ShieldCheck,
  Timer,
  Wallet,
  Zap,
} from 'lucide-react'
import { toFlagEmoji } from '@/components/miniapp/flags'
import { ActiveServiceCard, ActiveServiceCardSkeleton } from '@/components/miniapp/ActiveServiceCard'
import { OpenVpnNotice } from '@/components/miniapp/OpenVpnNotice'
import { VpnDeliverySheet } from '@/components/miniapp/VpnDeliverySheet'
import type { VpnDeliveryMode } from '@/components/miniapp/VpnDeliverySheet'
import { SectionHeader } from '@/components/miniapp/SectionHeader'
import { VpnPlanCard, VpnPlanCardSkeleton } from '@/components/miniapp/VpnPlanCard'
import { VpnServerStrip, VpnServerStripSkeleton } from '@/components/miniapp/VpnServerStrip'
import { PurchaseConfirmSheet } from '@/components/marketplace'
import type { PurchaseTarget } from '@/components/marketplace'
import { Button, Card, EmptyState } from '@/components/ui'
import { useTelegram } from '@/hooks/useTelegram'
import { formatCount, formatDataSize, formatDecimal } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { daysRemaining } from '@/lib/vpn'
import { listActiveServices, listVpnPlans, listVpnServers, purchaseVpnService, renewVpnService } from '@/services/vpn.service'
import type { ActiveService, VpnPlan, VpnServer } from '@/types'

type ServicesView = 'services' | 'plans'

interface HowItWorksStep {
  title: string
  description: string
  icon: LucideIcon
}

const HOW_IT_WORKS: HowItWorksStep[] = [
  {
    title: 'موقعیت را انتخاب کنید',
    description:
      'هر پلن یک آی‌پی ثابت اختصاصی دارد. در حال حاضر فقط آلمان موجود است؛ موقعیت‌های دیگر به‌زودی.',
    icon: Globe,
  },
  {
    title: 'از کیف پول پرداخت کنید',
    description: 'یک‌بار شارژ کنید، سپس سرویس را با یک ضربه فعال کنید.',
    icon: Wallet,
  },
  {
    title: 'نام کاربری و رمز تزریق می‌شود',
    description:
      'روی تونل امن OpenVPN (UDP)، اطلاعات ورود به‌صورت خودکار داخل پروفایل شما قرار می‌گیرد.',
    icon: KeyRound,
  },
  {
    title: 'فقط نرم‌افزار را نصب کنید',
    description:
      'پروفایل آماده را در برنامه OpenVPN باز کنید و متصل شوید — بدون تنظیم دستی.',
    icon: ShieldCheck,
  },
]

/** Everything the purchase confirmation sheet needs about the selected plan. */
interface PendingPurchase {
  plan: VpnPlan
  target: PurchaseTarget
  /** Buy a new node or add time/volume to an existing subscription. */
  mode: VpnDeliveryMode
  service?: ActiveService
}

interface DeliveryState {
  planTitle: string
  mode: VpnDeliveryMode
  service: ActiveService
}

/** Static-IP catalogue with «سرویس‌های من» usage tracking and instant delivery. */
export default function VpnPage() {
  const { haptic, notify } = useTelegram()

  const [view, setView] = useState<ServicesView>('services')
  const [plans, setPlans] = useState<VpnPlan[]>([])
  const [servers, setServers] = useState<VpnServer[]>([])
  const [services, setServices] = useState<ActiveService[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [serversLoading, setServersLoading] = useState(true)
  const [servicesLoading, setServicesLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [pendingPurchase, setPendingPurchase] = useState<PendingPurchase | null>(null)
  const [delivery, setDelivery] = useState<DeliveryState | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    listVpnPlans()
      .then((result) => {
        if (!cancelled) setPlans(result)
      })
      .catch(() => {
        if (!cancelled) {
          setPlans([])
          setLoadFailed(true)
        }
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false)
      })

    listVpnServers()
      .then((result) => {
        if (!cancelled) setServers(result)
      })
      .catch(() => {
        if (!cancelled) setServers([])
      })
      .finally(() => {
        if (!cancelled) setServersLoading(false)
      })

    listActiveServices()
      .then((result) => {
        if (!cancelled) setServices(result)
      })
      .catch(() => {
        if (!cancelled) setServices([])
      })
      .finally(() => {
        if (!cancelled) setServicesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [reloadKey])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const onlineNodes = useMemo(
    () => servers.filter((server) => server.status === 'online').length,
    [servers],
  )

  const totalUsedGb = useMemo(
    () => services.reduce((sum, service) => sum + service.usedGb, 0),
    [services],
  )

  const nearestDays = useMemo(() => {
    if (services.length === 0) return null
    return Math.min(...services.map((service) => daysRemaining(service.expiresAt)))
  }, [services])

  const retryLoad = () => {
    setPlansLoading(true)
    setServersLoading(true)
    setServicesLoading(true)
    setLoadFailed(false)
    setReloadKey((key) => key + 1)
  }

  const openPurchase = (
    plan: VpnPlan,
    mode: VpnDeliveryMode = 'new',
    service?: ActiveService,
  ) => {
    if (!plan.isActive || plan.stock <= 0 || plan.availability !== 'in_stock') {
      notify('error')
      return
    }
    haptic('light')
    setPendingPurchase({
      plan,
      target: { id: plan.id, title: plan.name },
      mode,
      service,
    })
  }

  const handleRenew = (service: ActiveService) => {
    const plan = plans.find(
      (candidate) =>
        candidate.availability === 'in_stock' &&
        candidate.isActive &&
        candidate.stock > 0 &&
        candidate.location === service.location,
    )
    if (!plan) {
      haptic('light')
      setNotice(
        'تمدید این موقعیت به‌زودی فعال می‌شود؛ برای اطلاع از موجودی با پشتیبانی در تماس باشید.',
      )
      return
    }
    openPurchase(plan, 'renew', service)
  }

  const handlePurchaseConfirm = async (target: PurchaseTarget) => {
    const pending = pendingPurchase
    setPendingPurchase(null)
    if (!pending) return

    const { plan, mode, service } = pending

    try {
      const provisioned =
        mode === 'renew' && service
          ? await renewVpnService(service, plan)
          : await purchaseVpnService(plan)

      setServices((previous) =>
        mode === 'renew' && service
          ? previous.map((item) => (item.id === service.id ? provisioned : item))
          : [provisioned, ...previous],
      )
      setView('services')
      setDelivery({ planTitle: target.title, mode, service: provisioned })

      if (mode === 'renew') {
        setNotice('سرویس تمدید شد؛ نام کاربری، رمز و آی‌پی ثابت قبلی حفظ شد.')
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'فعال‌سازی سرویس ممکن نشد. دوباره تلاش کنید.',
      )
    }
  }

  const handlePurchaseCancel = () => {
    setPendingPurchase(null)
  }

  const selectedPlan = pendingPurchase?.plan
  const purchaseDescription = selectedPlan
    ? [
        pendingPurchase?.mode === 'renew' ? 'تمدید سرویس موجود' : 'خرید نود جدید',
        selectedPlan.location,
        `${formatCount(selectedPlan.durationDays)} روز`,
        selectedPlan.dataCapGb ? `${formatDecimal(selectedPlan.dataCapGb)} گیگابایت` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined

  return (
    <div className="tg-page animate-fade-in pt-5">
      <header>
        <p className="text-[11px] font-semibold text-tg-hint">دسترسی شبکه</p>
        <h1 className="text-[22px] font-bold leading-tight text-tg-text">
          {fa.marketplace.staticIpVpns}
        </h1>
        <p className="mt-1 text-[12.5px] leading-snug text-tg-hint">
          تونل امن OpenVPN (UDP) با آی‌پی ثابت اختصاصی و تحویل تقریباً فوری.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="بخش‌های سرویس آی‌پی ثابت"
        className="mt-4 grid grid-cols-2 gap-1 rounded-2xl border border-tg-separator bg-tg-bg p-1 shadow-sm"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === 'services'}
          onClick={() => {
            haptic('light')
            setView('services')
          }}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-semibold transition-colors',
            view === 'services'
              ? 'bg-tg-button text-tg-button-text shadow-sm'
              : 'text-tg-hint hover:text-tg-text',
          )}
        >
          سرویس‌های من
          {!servicesLoading && services.length > 0 ? (
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                view === 'services' ? 'bg-white/20' : 'bg-tg-secondary-bg',
              )}
            >
              {formatCount(services.length)}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'plans'}
          onClick={() => {
            haptic('light')
            setView('plans')
          }}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-semibold transition-colors',
            view === 'plans'
              ? 'bg-tg-button text-tg-button-text shadow-sm'
              : 'text-tg-hint hover:text-tg-text',
          )}
        >
          خرید سرویس
        </button>
      </div>

      {view === 'services' ? (
        <>
          {servicesLoading ? (
            <div className="mt-4 flex flex-col gap-3">
              <ActiveServiceCardSkeleton />
              <ActiveServiceCardSkeleton />
            </div>
          ) : services.length === 0 ? (
            <Card variant="surface" padded={false} className="mt-4">
              <EmptyState
                icon={Server}
                title="هنوز سرویسی فعال نیست"
                description="اولین آی‌پی ثابت اختصاصی خود را تهیه کنید؛ پروفایل OpenVPN به‌صورت خودکار تحویل داده می‌شود."
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      haptic('light')
                      setView('plans')
                    }}
                  >
                    مشاهده پلن‌ها
                  </Button>
                }
              />
            </Card>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-tg-separator bg-tg-bg p-3 shadow-sm">
                <div>
                  <p className="text-[10px] text-tg-hint">سرویس فعال</p>
                  <p className="mt-0.5 text-[15px] font-bold tabular-nums text-tg-text">
                    {formatCount(services.length)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-tg-hint">مصرف کل</p>
                  <p className="mt-0.5 text-[15px] font-bold text-tg-text">
                    {formatDataSize(totalUsedGb)}
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-[10px] text-tg-hint">
                    <Timer className="size-3" aria-hidden />
                    نزدیک‌ترین انقضا
                  </p>
                  <p className="mt-0.5 text-[15px] font-bold tabular-nums text-tg-text">
                    {nearestDays === null ? '—' : `${formatCount(nearestDays)} روز`}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {services.map((service) => (
                  <ActiveServiceCard
                    key={service.id}
                    service={service}
                    onRenew={handleRenew}
                  />
                ))}
              </div>

              <Button
                fullWidth
                variant="secondary"
                className="mt-4"
                leftIcon={<Zap className="size-4" aria-hidden />}
                onClick={() => {
                  haptic('light')
                  setView('plans')
                }}
              >
                خرید نود جدید
              </Button>
            </>
          )}

          <OpenVpnNotice className="mt-4" />
        </>
      ) : (
        <>
      <section className="relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-950 via-brand-800 to-brand-600 p-5 text-white shadow-xl shadow-brand-900/30">
        <Globe
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-6 size-40 text-white/[0.07]"
        />
        <Server
          aria-hidden
          className="pointer-events-none absolute -bottom-10 right-10 size-28 text-white/[0.07]"
        />

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold backdrop-blur">
            <Zap className="size-3.5" aria-hidden />
            <span className="bidi-ltr">Linux · OpenVPN (UDP)</span>
          </span>

          <h2 className="mt-3 text-[23px] font-bold leading-tight">
            آی‌پی ثابتی که هرگز عوض نمی‌شود.
          </h2>
          <p className="mt-2 max-w-[19rem] text-[12.5px] leading-relaxed text-white/80">
            هر سرویس یک آی‌پی اختصاصی روی تونل امن OpenVPN (UDP) می‌گیرد؛ نام کاربری و رمز
            به‌صورت خودکار تزریق می‌شود و تحویل تقریباً فوری است.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/10 px-2.5 py-2 backdrop-blur">
              <p className="text-[10px] text-white/60">IPv4</p>
              <p className="mt-0.5 text-[13px] font-bold">اختصاصی</p>
            </div>
            <div className="rounded-xl bg-white/10 px-2.5 py-2 backdrop-blur">
              <p className="text-[10px] text-white/60">نودها</p>
              <p className="mt-0.5 text-[13px] font-bold tabular-nums">
                {serversLoading
                  ? '—'
                  : `${formatCount(onlineNodes)} از ${formatCount(servers.length)}`}
              </p>
            </div>
            <div className="rounded-xl bg-white/10 px-2.5 py-2 backdrop-blur">
              <p className="text-[10px] text-white/60">پروتکل</p>
              <p className="mt-0.5 text-[13px] font-bold">
                <span className="bidi-ltr">OpenVPN</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <SectionHeader
          title="موقعیت را انتخاب کنید"
          subtitle="فقط آلمان موجود است؛ انگلیس، فرانسه، آمریکا، کانادا و هلند به‌زودی"
        />

        {plansLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <VpnPlanCardSkeleton key={index} />
            ))}
          </div>
        ) : loadFailed ? (
          <Card variant="surface" padded={false}>
            <EmptyState
              icon={RefreshCw}
              title="پلن‌ها در دسترس نیستند"
              description="دسترسی به کاتالوگ سرویس‌های آی‌پی ثابت ممکن نشد. اتصال خود را بررسی کنید و دوباره تلاش کنید."
              action={
                <Button size="sm" variant="secondary" onClick={retryLoad}>
                  {fa.common.retry}
                </Button>
              }
            />
          </Card>
        ) : plans.length === 0 ? (
          <Card variant="surface" padded={false}>
            <EmptyState
              icon={Server}
              title="نودی موجود نیست"
              description="همه استخرهای آی‌پی ثابت در حال حاضر تکمیل شده‌اند. نودهای جدید به‌طور منظم فعال می‌شوند."
              action={
                <Button size="sm" variant="secondary" onClick={retryLoad}>
                  {fa.common.refresh}
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {plans.map((plan) => (
              <VpnPlanCard
                key={plan.id}
                plan={plan}
                server={servers.find((server) => server.id === plan.serverId)}
                onSelect={openPurchase}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-7">
        <SectionHeader
          title="وضعیت نودها"
          subtitle={
            serversLoading
              ? 'در حال بررسی زیرساخت…'
              : `${formatCount(onlineNodes)} از ${formatCount(servers.length)} نود همین حالا آنلاین است`
          }
        />

        {serversLoading ? (
          <VpnServerStripSkeleton />
        ) : servers.length === 0 ? (
          <Card variant="muted" className="px-4 py-3">
            <p className="text-[12px] text-tg-hint">
              داده‌های زنده نودها در دسترس نیست. وضعیت موجود بودن پلن‌های بالا همچنان معتبر است.
            </p>
          </Card>
        ) : (
          <VpnServerStrip servers={servers} />
        )}
      </section>

      <section className="mt-7">
        <SectionHeader title="چطور کار می‌کند" subtitle="چهار مرحله، تحویل تقریباً فوری" />

        <Card variant="surface" padded={false} className="overflow-hidden">
          {HOW_IT_WORKS.map((step, index) => {
            const Icon = step.icon
            return (
              <div
                key={step.title}
                className={cn(
                  'flex gap-3 p-4',
                  index > 0 && 'border-t border-tg-separator/60',
                )}
              >
                <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600">
                  <Icon className="size-5" aria-hidden />
                  <span className="absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full bg-tg-button text-[9px] font-bold tabular-nums text-tg-button-text">
                    {formatCount(index + 1)}
                  </span>
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-tg-text">{step.title}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-tg-hint">
                    {step.description}
                  </p>
                </div>
              </div>
            )
          })}
        </Card>
      </section>

          <OpenVpnNotice className="mt-4" />

          <p className="mt-5 text-center text-[11px] leading-relaxed text-tg-hint">
            پس از تایید پرداخت، سرویس بلافاصله روی تونل امن فعال می‌شود و پروفایل OpenVPN شما در
            بخش سفارش‌ها نمایش داده می‌شود.
          </p>
        </>
      )}

      {notice ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div
            role="status"
            className="flex max-w-[440px] animate-slide-up items-start gap-2 rounded-2xl border border-tg-separator bg-tg-bg px-4 py-3 text-[12px] leading-relaxed text-tg-text shadow-2xl"
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
            <p>{notice}</p>
          </div>
        </div>
      ) : null}

      <PurchaseConfirmSheet
        open={pendingPurchase !== null}
        target={pendingPurchase?.target ?? null}
        price={selectedPlan?.price ?? 0}
        currency={selectedPlan?.currency ?? 'IRT'}
        description={purchaseDescription}
        emoji={selectedPlan ? toFlagEmoji(selectedPlan.countryCode) : undefined}
        onConfirm={handlePurchaseConfirm}
        onCancel={handlePurchaseCancel}
      />

      <VpnDeliverySheet
        open={delivery !== null}
        planTitle={delivery?.planTitle ?? ''}
        mode={delivery?.mode ?? 'new'}
        service={delivery?.service}
        onClose={() => setDelivery(null)}
      />
    </div>
  )
}
