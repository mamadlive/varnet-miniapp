import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  Server,
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
import { listAdminNodes, saveAdminNode, toggleAdminNode } from '@/services/admin.service'
import type { StaticIpNode, StaticIpNodeAvailability } from '@/types'

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
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const refresh = useCallback(() => {
    setError(null)
    setLoading(true)
    void load()
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

  const isLoading = loading && nodes.length === 0

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="کاتالوگ"
        title="نودهای آی‌پی ثابت"
        description="نودهای فروشگاه آی‌پی ثابت را مدیریت کنید. نود غیرفعال در مینی‌اپ نمایش داده نمی‌شود."
        meta={
          <Badge tone="brand" size="sm">
            {formatCount(nodes.length)} نود
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
            <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={openCreate}>
              نود جدید
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
                      <dt className="text-[11px] font-semibold text-tg-hint">قیمت</dt>
                      <dd className="mt-0.5 truncate text-[12px] font-medium text-tg-text">
                        {formatCurrency(node.price, node.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold text-tg-hint">مدت</dt>
                      <dd className="mt-0.5 truncate text-[12px] text-tg-text">
                        {formatCount(node.durationDays)} روز
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold text-tg-hint">حجم</dt>
                      <dd className="mt-0.5 truncate text-[12px] text-tg-text">
                        {formatCount(node.dataCapGb)} گیگابایت
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
    </div>
  )
}
