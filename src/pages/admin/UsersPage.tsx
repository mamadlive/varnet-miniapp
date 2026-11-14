import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, MoreHorizontal, RefreshCw, Search, UserRound } from 'lucide-react'
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
import { formatCount, formatCurrency, formatDate } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { listUsers } from '@/services/admin.service'
import type { User } from '@/types'

function fullName(user: User): string {
  return `${user.firstName} ${user.lastName ?? ''}`.trim()
}

const USER_COLUMNS: DataTableColumn<User>[] = [
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
          leftIcon={<Eye className="size-3.5" />}
        >
          مشاهده
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-lg"
          aria-label={`اقدامات بیشتر برای ${fullName(user)}`}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </div>
    ),
  },
]

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

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
            columns={USER_COLUMNS}
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
    </div>
  )
}
