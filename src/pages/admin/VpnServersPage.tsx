import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  EyeOff,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from 'lucide-react'
import { AdminErrorState } from '@/components/admin/AdminStates'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { Badge } from '@/components/ui/Badge'
import type { BadgeTone } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { Skeleton } from '@/components/ui/Skeleton'
import { Switch } from '@/components/ui/Switch'
import { formatCount, formatCurrency, formatDate } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  deleteAdminPlan,
  listAdminNodes,
  listAdminPlans,
  saveAdminNode,
  saveAdminPlan,
  toggleAdminNode,
  toggleAdminPlan,
} from '@/services/admin.service'
import type { StaticIpNode, StaticIpNodeAvailability, StaticIpPlan } from '@/types'

const AVAILABILITY_LABELS: Record<StaticIpNodeAvailability, string> = {
  in_stock: 'موجود',
  coming_soon: 'به‌زودی',
  sold_out: 'ناموجود',
}

const AVAILABILITY_TONES: Record<StaticIpNodeAvailability, BadgeTone> = {
  in_stock: 'success',
  coming_soon: 'info',
  sold_out: 'neutral',
}

const AVAILABILITY_OPTIONS: StaticIpNodeAvailability[] = [
  'in_stock',
  'coming_soon',
  'sold_out',
]

/** ISO country code ("DE") → flag emoji (🇩🇪). */
function countryFlag(countryCode: string): string {
  const code = countryCode.trim().toUpperCase()
  if (code.length !== 2) return '🌐'
  return String.fromCodePoint(...[...code].map((char) => 127397 + char.charCodeAt(0)))
}

interface NodeForm {
  name: string
  ip: string
  country: string
  countryCode: string
  price: string
  durationDays: string
  dataCapGb: string
  availability: StaticIpNodeAvailability
  enabled: boolean
}

const EMPTY_FORM: NodeForm = {
  name: '',
  ip: '',
  country: 'آلمان',
  countryCode: 'DE',
  price: '150000',
  durationDays: '30',
  dataCapGb: '50',
  availability: 'in_stock',
  enabled: true,
}

function formFromNode(node: StaticIpNode): NodeForm {
  return {
    name: node.name,
    ip: node.ip,
    country: node.country,
    countryCode: node.countryCode,
    price: String(node.price),
    durationDays: String(node.durationDays),
    dataCapGb: String(node.dataCapGb),
    availability: node.availability,
    enabled: node.enabled,
  }
}

function validateForm(form: NodeForm): string | null {
  if (form.name.trim().length < 2 || form.name.trim().length > 80) {
    return 'نام نود باید بین ۲ تا ۸۰ نویسه باشد.'
  }
  const octet = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
  if (!new RegExp(`^${octet}(\\.${octet}){3}$`).test(form.ip.trim())) {
    return 'نشانی IPv4 نود معتبر نیست.'
  }
  if (form.country.trim().length < 2) return 'نام کشور را کامل وارد کنید.'
  if (!/^[A-Za-z]{2}$/.test(form.countryCode.trim())) {
    return 'کد کشور باید دو حرف لاتین باشد (مثلاً DE).'
  }
  const price = Number(form.price)
  if (!Number.isInteger(price) || price < 0) return 'قیمت نود باید عدد صحیح (تومان) باشد.'
  const duration = Number(form.durationDays)
  if (!Number.isInteger(duration) || duration < 1 || duration > 3650) {
    return 'مدت اعتبار باید بین ۱ تا ۳۶۵۰ روز باشد.'
  }
  const quota = Number(form.dataCapGb)
  if (!Number.isInteger(quota) || quota < 1 || quota > 100_000) {
    return 'حجم سرویس باید عدد صحیح (گیگابایت) باشد.'
  }
  return null
}

interface PlanForm {
  nodeId: string
  name: string
  dataCapGb: string
  durationDays: string
  price: string
  enabled: boolean
  isFeatured: boolean
}

const EMPTY_PLAN_FORM: PlanForm = {
  nodeId: '',
  name: '',
  dataCapGb: '50',
  durationDays: '30',
  price: '150000',
  enabled: true,
  isFeatured: false,
}

function planFormFromPlan(plan: StaticIpPlan): PlanForm {
  return {
    nodeId: plan.nodeId,
    name: plan.name,
    dataCapGb: String(plan.dataCapGb),
    durationDays: String(plan.durationDays),
    price: String(plan.price),
    enabled: plan.enabled,
    isFeatured: plan.isFeatured,
  }
}

function validatePlanForm(form: PlanForm): string | null {
  if (!form.nodeId) return 'نود متصل به پلن را انتخاب کنید.'
  if (form.name.trim().length < 2 || form.name.trim().length > 80) {
    return 'نام پلن باید بین ۲ تا ۸۰ نویسه باشد.'
  }
  const price = Number(form.price)
  if (!Number.isInteger(price) || price < 0) return 'قیمت پلن باید عدد صحیح (تومان) باشد.'
  const duration = Number(form.durationDays)
  if (!Number.isInteger(duration) || duration < 1 || duration > 3650) {
    return 'مدت پلن باید بین ۱ تا ۳۶۵۰ روز باشد.'
  }
  const quota = Number(form.dataCapGb)
  if (!Number.isInteger(quota) || quota < 1 || quota > 100_000) {
    return 'حجم پلن باید عدد صحیح (گیگابایت) باشد.'
  }
  return null
}

export default function VpnServersPage() {
  const [nodes, setNodes] = useState<StaticIpNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<StaticIpNode | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<NodeForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [plans, setPlans] = useState<StaticIpPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [planEditing, setPlanEditing] = useState<StaticIpPlan | null>(null)
  const [planCreating, setPlanCreating] = useState(false)
  const [planForm, setPlanForm] = useState<PlanForm>(EMPTY_PLAN_FORM)
  const [planSaving, setPlanSaving] = useState(false)
  const [planFormError, setPlanFormError] = useState<string | null>(null)
  const [planTogglingId, setPlanTogglingId] = useState<string | null>(null)
  const [planDeleting, setPlanDeleting] = useState<StaticIpPlan | null>(null)
  const [planDeleteBusy, setPlanDeleteBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setNodes(await listAdminNodes())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'بارگیری نودهای آی‌پی ثابت ممکن نشد.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    listAdminNodes()
      .then((data) => {
        if (!cancelled) setNodes(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'بارگیری نودهای آی‌پی ثابت ممکن نشد.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    listAdminPlans()
      .then((data) => {
        if (!cancelled) setPlans(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setNotice(err instanceof Error ? err.message : 'بارگیری پلن‌های فروش ممکن نشد.')
        }
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const refresh = useCallback(() => {
    setError(null)
    setLoading(true)
    setPlansLoading(true)
    void load()
    listAdminPlans()
      .then((data) => setPlans(data))
      .catch((err: unknown) => {
        setNotice(err instanceof Error ? err.message : 'بارگیری پلن‌های فروش ممکن نشد.')
      })
      .finally(() => setPlansLoading(false))
  }, [load])

  const summary = useMemo(() => {
    const enabled = nodes.filter((node) => node.enabled).length
    const inStock = nodes.filter(
      (node) => node.enabled && node.availability === 'in_stock',
    ).length
    return { enabled, hidden: nodes.length - enabled, inStock }
  }, [nodes])

  const openEdit = (node: StaticIpNode) => {
    setForm(formFromNode(node))
    setFormError(null)
    setEditing(node)
    setCreating(false)
  }

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setFormError(null)
    setEditing(null)
    setCreating(true)
  }

  const closeSheet = () => {
    if (saving) return
    setEditing(null)
    setCreating(false)
    setFormError(null)
  }

  const sheetOpen = editing !== null || creating

  const handleToggle = async (node: StaticIpNode) => {
    if (togglingId) return
    setTogglingId(node.id)
    try {
      const updated = await toggleAdminNode(node.id)
      setNodes((previous) => previous.map((item) => (item.id === updated.id ? updated : item)))
      setNotice(
        updated.enabled
          ? 'نود فعال شد و در مینی‌اپ نمایش داده می‌شود.'
          : 'نود غیرفعال شد و از مینی‌اپ مخفی شد.',
      )
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'تغییر وضعیت نود انجام نشد.')
    } finally {
      setTogglingId(null)
    }
  }

  const handleSave = async () => {
    if (saving) return
    const validation = validateForm(form)
    if (validation) {
      setFormError(validation)
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      const saved = await saveAdminNode({
        id: editing?.id,
        name: form.name.trim(),
        ip: form.ip.trim(),
        country: form.country.trim(),
        countryCode: form.countryCode.trim().toUpperCase(),
        price: Number(form.price),
        durationDays: Number(form.durationDays),
        dataCapGb: Number(form.dataCapGb),
        availability: form.availability,
        enabled: form.enabled,
      })
      setNodes((previous) => {
        const exists = previous.some((item) => item.id === saved.id)
        return exists
          ? previous.map((item) => (item.id === saved.id ? saved : item))
          : [...previous, saved]
      })
      setEditing(null)
      setCreating(false)
      setNotice(editing ? 'تغییرات نود ذخیره شد.' : 'نود جدید ساخته شد.')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'ذخیره نود انجام نشد.')
    } finally {
      setSaving(false)
    }
  }

  const patchForm = (patch: Partial<NodeForm>) =>
    setForm((previous) => ({ ...previous, ...patch }))

  const openPlanCreate = () => {
    setPlanForm({ ...EMPTY_PLAN_FORM, nodeId: nodes[0]?.id ?? '' })
    setPlanFormError(null)
    setPlanEditing(null)
    setPlanCreating(true)
  }

  const openPlanEdit = (plan: StaticIpPlan) => {
    setPlanForm(planFormFromPlan(plan))
    setPlanFormError(null)
    setPlanEditing(plan)
    setPlanCreating(false)
  }

  const closePlanSheet = () => {
    if (planSaving) return
    setPlanEditing(null)
    setPlanCreating(false)
    setPlanFormError(null)
  }

  const planSheetOpen = planEditing !== null || planCreating

  const patchPlanForm = (patch: Partial<PlanForm>) =>
    setPlanForm((previous) => ({ ...previous, ...patch }))

  const handlePlanToggle = async (plan: StaticIpPlan) => {
    if (planTogglingId) return
    setPlanTogglingId(plan.id)
    try {
      const updated = await toggleAdminPlan(plan.id)
      setPlans((previous) => previous.map((item) => (item.id === updated.id ? updated : item)))
      setNotice(
        updated.enabled
          ? 'پلن فعال شد و در مینی‌اپ قابل خرید است.'
          : 'پلن غیرفعال شد و از مینی‌اپ مخفی شد.',
      )
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'تغییر وضعیت پلن انجام نشد.')
    } finally {
      setPlanTogglingId(null)
    }
  }

  const handlePlanSave = async () => {
    if (planSaving) return
    const validation = validatePlanForm(planForm)
    if (validation) {
      setPlanFormError(validation)
      return
    }

    setPlanSaving(true)
    setPlanFormError(null)
    try {
      const saved = await saveAdminPlan({
        id: planEditing?.id,
        nodeId: planForm.nodeId,
        name: planForm.name.trim(),
        dataCapGb: Number(planForm.dataCapGb),
        durationDays: Number(planForm.durationDays),
        price: Number(planForm.price),
        enabled: planForm.enabled,
        isFeatured: planForm.isFeatured,
      })
      setPlans((previous) => {
        const exists = previous.some((item) => item.id === saved.id)
        return exists
          ? previous.map((item) => (item.id === saved.id ? saved : item))
          : [...previous, saved]
      })
      setPlanEditing(null)
      setPlanCreating(false)
      setNotice(planEditing ? 'تغییرات پلن ذخیره شد.' : 'پلن جدید ساخته شد.')
    } catch (err) {
      setPlanFormError(err instanceof Error ? err.message : 'ذخیره پلن انجام نشد.')
    } finally {
      setPlanSaving(false)
    }
  }

  const handlePlanDelete = async () => {
    if (!planDeleting || planDeleteBusy) return
    setPlanDeleteBusy(true)
    try {
      const deletedId = await deleteAdminPlan(planDeleting.id)
      setPlans((previous) => previous.filter((item) => item.id !== deletedId))
      setPlanDeleting(null)
      setNotice('پلن حذف شد و از فروشگاه مینی‌اپ برداشته شد.')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'حذف پلن انجام نشد.')
    } finally {
      setPlanDeleteBusy(false)
    }
  }

  const isLoading = loading && nodes.length === 0

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="کاتالوگ"
        title="آی‌پی ثابت · نودها و پلن‌ها"
        description="پلن‌های فروش و نودهای فروشگاه آی‌پی ثابت را مدیریت کنید. هر مورد غیرفعال در مینی‌اپ نمایش داده نمی‌شود."
        meta={
          <Badge tone="brand" size="sm">
            {formatCount(nodes.length)} نود · {formatCount(plans.length)} پلن
          </Badge>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw className="size-4" />}
              loading={loading}
              onClick={refresh}
            >
              {fa.common.refresh}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Server className="size-4" />}
              onClick={openCreate}
            >
              نود جدید
            </Button>
            <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={openPlanCreate}>
              پلن جدید
            </Button>
          </>
        }
      />

      {notice ? (
        <div
          role="status"
          className="rounded-xl border border-brand-500/25 bg-brand-500/10 px-4 py-3 text-[12.5px] font-medium leading-relaxed text-tg-text"
        >
          {notice}
        </div>
      ) : null}

      {error ? (
        <AdminErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          {isLoading ? (
            <Card
              padded={false}
              className="grid grid-cols-1 divide-y divide-tg-separator sm:grid-cols-3 sm:divide-x sm:divide-y-0"
            >
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 p-5">
                  <Skeleton className="size-10 rounded-xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-5 w-14" />
                  </div>
                </div>
              ))}
            </Card>
          ) : (
            <Card
              padded={false}
              className="grid grid-cols-1 divide-y divide-tg-separator sm:grid-cols-3 sm:divide-x sm:divide-y-0"
            >
              <div className="p-5">
                <p className="text-[11px] font-semibold text-tg-hint">فعال در مینی‌اپ</p>
                <p className="mt-0.5 text-[18px] font-semibold leading-none tabular-nums text-tg-text">
                  {formatCount(summary.enabled)}
                  <span className="ms-1 text-[12.5px] font-normal text-tg-hint">
                    از {formatCount(nodes.length)}
                  </span>
                </p>
              </div>
              <div className="p-5">
                <p className="text-[11px] font-semibold text-tg-hint">آماده فروش</p>
                <p className="mt-0.5 text-[18px] font-semibold leading-none tabular-nums text-tg-text">
                  {formatCount(summary.inStock)}
                </p>
              </div>
              <div className="p-5">
                <p className="text-[11px] font-semibold text-tg-hint">مخفی از مینی‌اپ</p>
                <p className="mt-0.5 text-[18px] font-semibold leading-none tabular-nums text-tg-text">
                  {formatCount(summary.hidden)}
                </p>
              </div>
            </Card>
          )}

          <section className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-tg-text">پلن‌های فروش</h2>
                <p className="mt-0.5 text-[12px] leading-relaxed text-tg-hint">
                  هر پلن یک محصول قابل خرید در مینی‌اپ است: حجم، مدت، قیمت و نود متصل را همین‌جا
                  تعیین کنید.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus className="size-4" />}
                onClick={openPlanCreate}
              >
                پلن جدید
              </Button>
            </div>

            {plansLoading ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {Array.from({ length: 2 }).map((_, index) => (
                  <Skeleton key={index} className="h-44 rounded-2xl" />
                ))}
              </div>
            ) : plans.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Package}
                  title="هنوز پلنی ساخته نشده"
                  description="بدون پلن، فروشگاه آی‌پی ثابت در مینی‌اپ خالی می‌ماند. اولین پلن فروش را بسازید."
                  className="py-8"
                  action={
                    <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={openPlanCreate}>
                      ساخت پلن
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {plans.map((plan) => (
                  <Card
                    key={plan.id}
                    className={cn('flex flex-col p-5', !plan.enabled && 'opacity-80')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-tg-text">
                          {plan.name}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-tg-hint">
                          <span aria-hidden>{countryFlag(plan.countryCode)}</span>
                          <span className="truncate">{plan.nodeName}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        <Badge tone={plan.enabled ? 'success' : 'neutral'} size="sm">
                          {plan.enabled ? 'قابل فروش' : 'غیرفعال'}
                        </Badge>
                        {plan.isFeatured ? (
                          <Badge tone="brand" size="sm">
                            پیشنهاد ویژه
                          </Badge>
                        ) : null}
                        <Badge tone={AVAILABILITY_TONES[plan.availability]} size="sm">
                          {AVAILABILITY_LABELS[plan.availability]}
                        </Badge>
                      </div>
                    </div>

                    <dl className="mt-4 grid grid-cols-3 gap-x-3 gap-y-2 rounded-xl bg-tg-secondary-bg/60 p-3">
                      <div>
                        <dt className="text-[10.5px] font-semibold text-tg-hint">قیمت</dt>
                        <dd className="mt-0.5 truncate text-[12px] font-medium text-tg-text">
                          {formatCurrency(plan.price, plan.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10.5px] font-semibold text-tg-hint">حجم</dt>
                        <dd className="mt-0.5 truncate text-[12px] text-tg-text">
                          {formatCount(plan.dataCapGb)} گیگابایت
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10.5px] font-semibold text-tg-hint">مدت</dt>
                        <dd className="mt-0.5 truncate text-[12px] text-tg-text">
                          {formatCount(plan.durationDays)} روز
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-tg-separator pt-3">
                      <label className="flex items-center gap-2 text-[11.5px] font-medium text-tg-hint">
                        <Switch
                          checked={plan.enabled}
                          disabled={planTogglingId === plan.id}
                          onCheckedChange={() => void handlePlanToggle(plan)}
                          label={`فعال یا غیرفعال کردن ${plan.name}`}
                        />
                        نمایش در مینی‌اپ
                      </label>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={<Pencil className="size-3.5" />}
                          onClick={() => openPlanEdit(plan)}
                        >
                          ویرایش
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-500/10"
                          leftIcon={<Trash2 className="size-3.5" />}
                          onClick={() => setPlanDeleting(plan)}
                        >
                          حذف
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <div className="flex items-end justify-between gap-3 pt-2">
            <div>
              <h2 className="text-[15px] font-semibold text-tg-text">نودها</h2>
              <p className="mt-0.5 text-[12px] leading-relaxed text-tg-hint">
                نود غیرفعال و پلن‌های متصل به آن از مینی‌اپ مخفی می‌شوند.
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-60 rounded-2xl" />
              ))}
            </div>
          ) : nodes.length === 0 ? (
            <Card>
              <EmptyState
                icon={Server}
                title="هنوز نود آی‌پی ثابتی ثبت نشده"
                description="با دکمه «نود جدید» اولین نود فروشگاه آی‌پی ثابت را بسازید؛ مینی‌اپ فقط نودهای فعال را نمایش می‌دهد."
                className="py-10"
                action={
                  <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={openCreate}>
                    ساخت نود
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {nodes.map((node) => (
                <Card
                  key={node.id}
                  className={cn('flex flex-col p-5', !node.enabled && 'opacity-80')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tg-secondary-bg text-lg"
                        aria-hidden
                      >
                        {countryFlag(node.countryCode)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-tg-text">
                          {node.name}
                        </p>
                        <p className="truncate font-mono text-[11px] text-tg-hint">
                          <span className="bidi-ltr">{node.ip}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      <Badge tone={AVAILABILITY_TONES[node.availability]} size="sm">
                        {AVAILABILITY_LABELS[node.availability]}
                      </Badge>
                      {node.enabled ? null : (
                        <Badge tone="neutral" size="sm">
                          <EyeOff className="me-1 size-3" aria-hidden />
                          مخفی
                        </Badge>
                      )}
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-tg-secondary-bg/60 p-3 sm:grid-cols-3">
                    <div>
                      <dt className="text-[11px] font-semibold text-tg-hint">نشانی IPv4</dt>
                      <dd className="mt-0.5 truncate font-mono text-[12px] font-medium text-tg-text">
                        <span className="bidi-ltr">{node.ip}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold text-tg-hint">پروتکل</dt>
                      <dd className="mt-0.5 truncate text-[12px] text-tg-text">{node.protocol}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold text-tg-hint">پلن متصل</dt>
                      <dd className="mt-0.5 truncate text-[12px] text-tg-text">
                        {formatCount(plans.filter((plan) => plan.nodeId === node.id).length)} پلن
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-tg-separator p-3">
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-tg-text">
                        فعال / غیرفعال (مخفی از مینی‌اپ)
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-tg-hint">
                        {node.enabled
                          ? 'این نود در فروشگاه مینی‌اپ نمایش داده می‌شود.'
                          : 'این نود در فروشگاه مینی‌اپ دیده نمی‌شود.'}
                      </p>
                    </div>
                    <Switch
                      checked={node.enabled}
                      disabled={togglingId === node.id}
                      onCheckedChange={() => void handleToggle(node)}
                      label={`فعال یا غیرفعال کردن ${node.name}`}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-tg-separator pt-3">
                    <p className="flex items-center gap-1.5 text-[11.5px] text-tg-hint">
                      <CalendarDays className="size-3.5" aria-hidden />
                      افزوده‌شده {formatDate(node.createdAt)}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Pencil className="size-3.5" />}
                      onClick={() => openEdit(node)}
                    >
                      ویرایش
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <Sheet
        open={sheetOpen}
        onClose={closeSheet}
        title={editing ? 'ویرایش نود' : 'نود جدید'}
        description="نام، آی‌پی، قیمت و وضعیت نود در فروشگاه مینی‌اپ اعمال می‌شود."
        className="max-h-[92dvh] overflow-y-auto"
        footer={
          <div className="space-y-2">
            {formError ? (
              <p role="alert" className="rounded-xl border border-tg-destructive/25 bg-tg-destructive/10 px-3 py-2 text-[12px] font-medium leading-relaxed text-tg-destructive">
                {formError}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled={saving} onClick={closeSheet}>
                {fa.common.cancel}
              </Button>
              <Button loading={saving} onClick={() => void handleSave()}>
                ذخیره نود
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label="نام نود"
            value={form.name}
            onChange={(event) => patchForm({ name: event.target.value })}
            placeholder="آی‌پی ثابت اختصاصی · آلمان"
            maxLength={80}
          />
          <Input
            label="نشانی IPv4"
            value={form.ip}
            onChange={(event) => patchForm({ ip: event.target.value })}
            placeholder="45.83.104.21"
            dir="ltr"
            inputMode="decimal"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="کشور"
              value={form.country}
              onChange={(event) => patchForm({ country: event.target.value })}
              placeholder="آلمان"
              maxLength={60}
            />
            <Input
              label="کد کشور"
              value={form.countryCode}
              onChange={(event) => patchForm({ countryCode: event.target.value.toUpperCase() })}
              placeholder="DE"
              dir="ltr"
              maxLength={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="قیمت (تومان)"
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={form.price}
              onChange={(event) => patchForm({ price: event.target.value })}
            />
            <Input
              label="مدت (روز)"
              type="number"
              inputMode="numeric"
              min={1}
              max={3650}
              value={form.durationDays}
              onChange={(event) => patchForm({ durationDays: event.target.value })}
            />
          </div>
          <Input
            label="حجم سرویس (گیگابایت)"
            type="number"
            inputMode="numeric"
            min={1}
            value={form.dataCapGb}
            onChange={(event) => patchForm({ dataCapGb: event.target.value })}
          />

          <div className="space-y-1.5">
            <label htmlFor="node-availability" className="block text-[13px] font-medium text-tg-hint">
              وضعیت موجودی
            </label>
            <select
              id="node-availability"
              value={form.availability}
              onChange={(event) =>
                patchForm({ availability: event.target.value as StaticIpNodeAvailability })
              }
              className="h-11 w-full rounded-xl border border-tg-separator bg-tg-bg px-3 text-[15px] text-tg-text outline-none transition-colors focus:border-brand-500"
            >
              {AVAILABILITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {AVAILABILITY_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-tg-separator p-3">
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-tg-text">نمایش در مینی‌اپ</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-tg-hint">
                در صورت غیرفعال بودن، نود از فروشگاه مینی‌اپ مخفی می‌شود.
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(checked) => patchForm({ enabled: checked })}
              label="نمایش نود در مینی‌اپ"
            />
          </div>
        </div>
      </Sheet>

      <Sheet
        open={planSheetOpen}
        onClose={closePlanSheet}
        title={planEditing ? 'ویرایش پلن فروش' : 'پلن فروش جدید'}
        description="حجم، مدت، قیمت و نود این پلن همان چیزی است که مشتری در مینی‌اپ می‌بیند و می‌خرد."
        className="max-h-[92dvh] overflow-y-auto"
        footer={
          <div className="space-y-2">
            {planFormError ? (
              <p role="alert" className="rounded-xl border border-tg-destructive/25 bg-tg-destructive/10 px-3 py-2 text-[12px] font-medium leading-relaxed text-tg-destructive">
                {planFormError}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled={planSaving} onClick={closePlanSheet}>
                {fa.common.cancel}
              </Button>
              <Button loading={planSaving} onClick={() => void handlePlanSave()}>
                ذخیره پلن
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="plan-node" className="block text-[13px] font-medium text-tg-hint">
              نود متصل
            </label>
            <select
              id="plan-node"
              value={planForm.nodeId}
              onChange={(event) => patchPlanForm({ nodeId: event.target.value })}
              className="h-11 w-full rounded-xl border border-tg-separator bg-tg-bg px-3 text-[15px] text-tg-text outline-none transition-colors focus:border-brand-500"
            >
              {nodes.length === 0 ? <option value="">نودی ثبت نشده است</option> : null}
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name} · {node.ip}
                </option>
              ))}
            </select>
            {nodes.length === 0 ? (
              <p className="text-[11px] text-tg-hint">
                برای ساخت پلن ابتدا از بخش «نود جدید» یک نود بسازید.
              </p>
            ) : null}
          </div>

          <Input
            label="نام پلن"
            value={planForm.name}
            onChange={(event) => patchPlanForm({ name: event.target.value })}
            placeholder="پلن ۵۰ گیگابایت · ۱ ماهه"
            maxLength={80}
          />

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="حجم (گیگابایت)"
              type="number"
              inputMode="numeric"
              min={1}
              value={planForm.dataCapGb}
              onChange={(event) => patchPlanForm({ dataCapGb: event.target.value })}
            />
            <Input
              label="مدت (روز)"
              type="number"
              inputMode="numeric"
              min={1}
              max={3650}
              value={planForm.durationDays}
              onChange={(event) => patchPlanForm({ durationDays: event.target.value })}
            />
          </div>

          <Input
            label="قیمت (تومان)"
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={planForm.price}
            onChange={(event) => patchPlanForm({ price: event.target.value })}
          />

          <div className="flex items-center justify-between gap-3 rounded-xl border border-tg-separator p-3">
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-tg-text">قابل فروش در مینی‌اپ</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-tg-hint">
                در صورت غیرفعال بودن، این پلن از فروشگاه مینی‌اپ مخفی می‌شود.
              </p>
            </div>
            <Switch
              checked={planForm.enabled}
              onCheckedChange={(checked) => patchPlanForm({ enabled: checked })}
              label="فروش پلن در مینی‌اپ"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-tg-separator p-3">
            <input
              type="checkbox"
              checked={planForm.isFeatured}
              disabled={planSaving}
              onChange={(event) => patchPlanForm({ isFeatured: event.target.checked })}
              className="mt-0.5 size-4 shrink-0 accent-brand-500"
            />
            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold text-tg-text">
                نمایش در پیشنهادهای ویژه صفحه اصلی
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-tg-hint">
                این پلن در ردیف «پیشنهادهای ویژه» صفحه اصلی مینی‌اپ، کنار محصولات ویژه بازارچه
                نمایش داده می‌شود (نیازمند فعال بودن پلن).
              </span>
            </span>
          </label>
        </div>
      </Sheet>

      <Sheet
        open={planDeleting !== null}
        onClose={() => {
          if (!planDeleteBusy) setPlanDeleting(null)
        }}
        title="حذف پلن فروش"
        description={planDeleting ? `${planDeleting.name} · ${planDeleting.nodeName}` : undefined}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              disabled={planDeleteBusy}
              onClick={() => setPlanDeleting(null)}
            >
              {fa.common.cancel}
            </Button>
            <Button
              variant="destructive"
              loading={planDeleteBusy}
              onClick={() => void handlePlanDelete()}
            >
              حذف پلن
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-tg-text">
          این پلن از فروشگاه مینی‌اپ حذف می‌شود. سفارش‌های ثبت‌شده قبلی با عنوان پلن حفظ می‌شوند
          و سرویس مشتریان تغییری نمی‌کند.
        </p>
      </Sheet>
    </div>
  )
}
