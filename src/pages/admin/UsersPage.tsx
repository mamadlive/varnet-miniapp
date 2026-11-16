import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, RefreshCw, Search, UserRound, Wallet } from 'lucide-react'
import { AdminErrorState } from '@/components/admin/AdminStates'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { DataTable } from '@/components/admin/AdminTable'
import type { DataTableColumn } from '@/components/admin/AdminTable'
import { RoleBadge } from '@/components/admin/StatusBadges'
import { UserAvatar } from '@/components/admin/UserAvatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { formatCount, formatCurrency, formatDate } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { adjustUserWallet, isAdminDemoPreview, listUsers } from '@/services/admin.service'
import type { User } from '@/types'

type AdjustDirection = 'credit' | 'debit'

function fullName(user: User): string {
  return `${user.firstName} ${user.lastName ?? ''}`.trim()
}

function toEnglishDigits(value: string): string {
  return value.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
}

function buildUserColumns(onAdjust: (user: User) => void): DataTableColumn<User>[] {
  return [
    {
      key: 'user',
      header: 'کاربر',
      render: (user) => (
        <div className="flex items-center gap-3">
          <UserAvatar name={fullName(user)} photoUrl={user.photoUrl} size="md" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-tg-text">{fullName(user)}</p>
            <p className="truncate text-[11.5px] text-tg-hint">
              {user.username ? (
                <span className="bidi-ltr">@{user.username}</span>
              ) : (
                <>
                  شناسه تلگرام <span className="bidi-ltr">{formatCount(user.telegramId)}</span>
                </>
              )}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'نقش',
      render: (user) => <RoleBadge role={user.role} />,
    },
    {
      key: 'verified',
      header: 'احراز هویت',
      render: (user) => (
        <div className="flex items-center gap-2">
          <Badge tone={user.verified ? 'success' : 'warning'} size="sm">
            {user.verified ? 'تأیید شده' : 'تأیید نشده'}
          </Badge>
          {user.phoneNumber ? (
            <span className="bidi-ltr text-[11px] tabular-nums text-tg-hint">{user.phoneNumber}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'balance',
      header: 'موجودی',
      align: 'right',
      render: (user) => (
        <span className="text-[13px] font-medium tabular-nums text-tg-text">
          {formatCurrency(user.balance, user.currency)}
        </span>
      ),
    },
    {
      key: 'joined',
      header: 'تاریخ عضویت',
      render: (user) => (
        <span className="text-[12.5px] text-tg-hint">{formatDate(user.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'اقدامات',
      align: 'right',
      render: (user) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-[12px]"
            leftIcon={<Wallet className="size-3.5" />}
            onClick={() => onAdjust(user)}
          >
            افزایش / کاهش
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg"
            aria-label={`مشاهده ${fullName(user)}`}
          >
            <Eye className="size-4" aria-hidden />
          </Button>
        </div>
      ),
    },
  ]
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const [adjustTarget, setAdjustTarget] = useState<User | null>(null)
  const [direction, setDirection] = useState<AdjustDirection>('credit')
  const [amountInput, setAmountInput] = useState('')
  const [note, setNote] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [adjustError, setAdjustError] = useState<string | null>(null)
  const [adjustedBalance, setAdjustedBalance] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setUsers(await listUsers())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'بارگیری کاربران ممکن نشد.')
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(() => {
    setError(null)
    setLoading(true)
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const data = await listUsers()
        if (!cancelled) setUsers(data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'بارگیری کاربران ممکن نشد.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const openAdjust = useCallback((user: User) => {
    setAdjustTarget(user)
    setDirection('credit')
    setAmountInput('')
    setNote('')
    setAdjustError(null)
    setAdjustedBalance(null)
  }, [])

  const columns = useMemo(() => buildUserColumns(openAdjust), [openAdjust])

  const closeAdjust = useCallback(() => {
    if (adjusting) return
    setAdjustTarget(null)
  }, [adjusting])

  const parsedAmount = Number(toEnglishDigits(amountInput).replace(/[,\u066C\s]/g, ''))
  const hasValidAmount = Number.isInteger(parsedAmount) && parsedAmount > 0
  const signedAmount = hasValidAmount
    ? direction === 'credit'
      ? parsedAmount
      : -parsedAmount
    : 0
  const projectedBalance = adjustTarget ? adjustTarget.balance + signedAmount : 0

  const submitAdjustment = async () => {
    if (!adjustTarget) return
    if (!hasValidAmount) {
      setAdjustError('مبلغ باید یک عدد صحیح بزرگ‌تر از صفر (تومان) باشد.')
      return
    }
    if (direction === 'debit' && projectedBalance < 0) {
      setAdjustError('مبلغ کسر بیش از موجودی کاربر است.')
      return
    }

    setAdjusting(true)
    setAdjustError(null)
    try {
      const nextBalance = isAdminDemoPreview()
        ? projectedBalance
        : (await adjustUserWallet({
            userId: adjustTarget.id,
            amount: signedAmount,
            note: note.trim() || undefined,
          })).balance

      setUsers((previous) =>
        previous.map((user) =>
          user.id === adjustTarget.id ? { ...user, balance: nextBalance } : user,
        ),
      )
      setAdjustedBalance(nextBalance)
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : 'تعدیل موجودی انجام نشد.')
    } finally {
      setAdjusting(false)
    }
  }

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return users
    return users.filter((user) =>
      `${fullName(user)} ${user.username ?? ''}`.toLowerCase().includes(needle),
    )
  }, [query, users])

  const admins = users.filter((user) => user.role === 'admin').length
  const isSearching = query.trim().length > 0

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="کاربران"
        title="کاربران"
        description="همه حساب‌های تلگرامی ثبت‌شده در ورنت، همراه با موجودی و نقش."
        meta={
          <Badge tone="brand" size="sm">
            {formatCount(users.length)} حساب
          </Badge>
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className="size-4" />}
            loading={loading}
            onClick={refresh}
          >
            {fa.common.refresh}
          </Button>
        }
      />

      {error ? (
        <AdminErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-tg-hint">
            <span>{formatCount(admins)} حساب مدیر</span>
            <span className="text-tg-hint/50">·</span>
            <span>{formatCount(users.length - admins)} کاربر عادی</span>
          </div>

          <DataTable<User>
            columns={columns}
            rows={filteredUsers}
            rowKey={(user) => user.id}
            loading={loading && users.length === 0}
            skeletonRows={6}
            minWidthClassName="min-w-[760px]"
            header={
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-[15px] font-semibold text-tg-text">همه کاربران</h2>
                  <p className="mt-0.5 text-[12px] text-tg-hint">
                    نمایش {formatCount(filteredUsers.length)} از {formatCount(users.length)} حساب
                  </p>
                </div>
                <div className="w-full sm:w-72">
                  <Input
                    icon={Search}
                    placeholder="جستجو بر اساس نام یا نام کاربری…"
                    aria-label="جستجوی کاربران"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              </div>
            }
            empty={
              <EmptyState
                icon={UserRound}
                title={isSearching ? 'کاربری با این جستجو پیدا نشد' : 'هنوز کاربری ثبت نشده'}
                description={
                  isSearching
                    ? 'نام یا نام کاربری دیگری را امتحان کنید یا جستجو را پاک کنید تا همه نمایش داده شوند.'
                    : 'حساب‌ها پس از اولین ورود از تلگرام اینجا نمایش داده می‌شوند.'
                }
                action={
                  isSearching ? (
                    <Button variant="secondary" size="sm" onClick={() => setQuery('')}>
                      پاک کردن جستجو
                    </Button>
                  ) : undefined
                }
                className="py-8"
              />
            }
            footer={
              <p className="text-[11.5px] text-tg-hint">
                {filteredUsers.length === users.length
                  ? `${formatCount(users.length)} حساب فهرست شده`
                  : `نمایش ${formatCount(filteredUsers.length)} از ${formatCount(users.length)} حساب`}
              </p>
            }
          />
        </>
      )}

      <Sheet
        open={adjustTarget !== null}
        onClose={closeAdjust}
        title="افزایش / کاهش موجودی"
        description={
          adjustTarget
            ? `تعدیل موجودی کیف پول «${fullName(adjustTarget)}».`
            : undefined
        }
        footer={
          adjustedBalance !== null ? (
            <Button fullWidth onClick={() => setAdjustTarget(null)}>
              بستن
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button className="flex-1" loading={adjusting} onClick={submitAdjustment}>
                ثبت تغییر
              </Button>
              <Button variant="secondary" onClick={closeAdjust} disabled={adjusting}>
                انصراف
              </Button>
            </div>
          )
        }
      >
        {adjustTarget ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-tg-secondary-bg px-3 py-2 text-[12.5px]">
              <span className="text-tg-hint">موجودی فعلی</span>
              <span className="font-semibold tabular-nums text-tg-text">
                {formatCurrency(adjustTarget.balance, adjustTarget.currency)}
              </span>
            </div>

            {adjustedBalance !== null ? (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-3 text-[12.5px] text-emerald-700">
                <p className="font-semibold">تعدیل با موفقیت ثبت شد و در تاریخچه کیف پول ذخیره شد.</p>
                <p className="mt-1">
                  موجودی جدید:{' '}
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(adjustedBalance, adjustTarget.currency)}
                  </span>
                </p>
              </div>
            ) : (
              <>
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-tg-hint">نوع تغییر</p>
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label="نوع تغییر موجودی">
                    {(
                      [
                        { value: 'credit', label: 'افزایش موجودی' },
                        { value: 'debit', label: 'کاهش موجودی' },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setDirection(option.value)
                          setAdjustError(null)
                        }}
                        aria-pressed={direction === option.value}
                        className={`rounded-xl border px-3 py-2 text-[12.5px] font-medium transition-colors ${
                          direction === option.value
                            ? 'border-brand-500/40 bg-brand-500/10 text-brand-600'
                            : 'border-tg-separator bg-tg-secondary-bg text-tg-hint hover:text-tg-text'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Input
                  label="مبلغ (تومان)"
                  inputMode="numeric"
                  value={amountInput}
                  onChange={(event) => {
                    setAmountInput(event.target.value)
                    setAdjustError(null)
                  }}
                  placeholder="مثلاً 500000"
                  className="tabular-nums"
                  error={adjustError ?? undefined}
                  hint={
                    hasValidAmount
                      ? `موجودی پس از ثبت: ${formatCurrency(projectedBalance, adjustTarget.currency)}`
                      : 'مبلغ را به تومان و بدون اعشار وارد کنید.'
                  }
                  autoComplete="off"
                />

                <Input
                  label="توضیح (اختیاری)"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="مثلاً جبران اختلال خرید"
                  maxLength={200}
                  autoComplete="off"
                  hint="این توضیح در تاریخچه کیف پول کاربر نمایش داده می‌شود."
                />
              </>
            )}
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}
