import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ReceiptText, RefreshCw, XCircle } from 'lucide-react'
import { AdminErrorState } from '@/components/admin/AdminStates'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { DataTable } from '@/components/admin/AdminTable'
import type { DataTableColumn } from '@/components/admin/AdminTable'
import { FilterChips } from '@/components/admin/FilterChips'
import type { FilterChipOption } from '@/components/admin/FilterChips'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCount, formatCurrency, formatDateTime } from '@/lib/format'
import { actOnReceipt, listAdminReceipts } from '@/services/admin.service'
import type { ReceiptAction } from '@/services/admin.service'
import type { PaymentReceipt, PaymentReceiptStatus } from '@/types'

type ReceiptFilter = PaymentReceiptStatus | 'all'

const STATUS_LABELS: Record<PaymentReceiptStatus, string> = {
  PENDING: 'در انتظار تایید',
  APPROVED: 'تایید شده',
  REJECTED: 'رد شده',
}

function PurposeBadge({ receipt }: { receipt: PaymentReceipt }) {
  if (receipt.purpose === 'wallet_topup') {
    return (
      <Badge tone="brand" size="sm">
        شارژ کیف پول
      </Badge>
    )
  }
  return (
    <div className="min-w-0">
      <Badge tone="success" size="sm">
        خرید محصول
      </Badge>
      {receipt.productTitle ? (
        <p className="mt-1 max-w-[220px] truncate text-[11px] text-tg-hint" title={receipt.productTitle}>
          {receipt.productTitle}
        </p>
      ) : null}
    </div>
  )
}

/** «تایید واریزی‌های کارت به کارت» — pending card claims awaiting a decision. */
export default function PaymentReceiptsPage() {
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([])
  const [filter, setFilter] = useState<ReceiptFilter>('PENDING')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async (status: ReceiptFilter) => {
    try {
      setReceipts(await listAdminReceipts(status))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'بارگیری فیش‌های واریز انجام نشد.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    void load(filter)
  }, [filter, load])

  const refresh = () => {
    setLoading(true)
    setError(null)
    void load(filter)
  }

  const handleAction = async (receipt: PaymentReceipt, action: ReceiptAction) => {
    if (busyId) return
    setBusyId(receipt.id)
    setActionError(null)
    setFeedback(null)
    try {
      await actOnReceipt(receipt.id, action)
      setFeedback(
        action === 'approve'
          ? receipt.purpose === 'wallet_topup'
            ? 'فیش تایید شد و موجودی کیف پول کاربر شارژ گردید.'
            : 'فیش تایید شد و سفارش محصول به وضعیت پرداخت‌شده تغییر کرد.'
          : 'فیش رد شد و در صورت وجود سفارش در انتظار، لغو گردید.',
      )
      await load(filter)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'اقدام روی فیش انجام نشد.')
    } finally {
      setBusyId(null)
    }
  }

  const columns: DataTableColumn<PaymentReceipt>[] = useMemo(
    () => [
      {
        key: 'receipt',
        header: 'فیش',
        render: (receipt) => (
          <span className="bidi-ltr font-mono text-[11.5px] text-tg-text">{receipt.id}</span>
        ),
      },
      {
        key: 'customer',
        header: 'مشتری',
        render: (receipt) => (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-tg-text">
              {receipt.userName ?? 'کاربر ناشناس'}
            </p>
            <p className="truncate text-[11px] text-tg-hint bidi-ltr">{receipt.userId}</p>
          </div>
        ),
      },
      {
        key: 'purpose',
        header: 'بابت',
        render: (receipt) => <PurposeBadge receipt={receipt} />,
      },
      {
        key: 'amount',
        header: 'مبلغ',
        align: 'right',
        render: (receipt) => (
          <span className="text-[13px] font-semibold tabular-nums text-tg-text">
            {formatCurrency(receipt.amount, receipt.currency)}
          </span>
        ),
      },
      {
        key: 'reference',
        header: 'شماره پیگیری',
        render: (receipt) => (
          <span className="bidi-ltr font-mono text-[12px] text-tg-text">{receipt.reference}</span>
        ),
      },
      {
        key: 'created',
        header: 'تاریخ ثبت',
        render: (receipt) => (
          <span className="whitespace-nowrap text-[12px] text-tg-hint">
            {formatDateTime(receipt.createdAt)}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'وضعیت',
        render: (receipt) => (
          <Badge
            tone={
              receipt.status === 'PENDING'
                ? 'warning'
                : receipt.status === 'APPROVED'
                  ? 'success'
                  : 'danger'
            }
            size="sm"
          >
            {STATUS_LABELS[receipt.status]}
          </Badge>
        ),
      },
      {
        key: 'actions',
        header: 'اقدامات',
        align: 'right',
        render: (receipt) =>
          receipt.status === 'PENDING' ? (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-[11.5px] text-emerald-600 hover:bg-emerald-500/10"
                loading={busyId === receipt.id}
                leftIcon={<CheckCircle2 className="size-3.5" />}
                onClick={() => void handleAction(receipt, 'approve')}
              >
                تایید فیش
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-[11.5px] text-red-600 hover:bg-red-500/10"
                disabled={busyId === receipt.id}
                leftIcon={<XCircle className="size-3.5" />}
                onClick={() => void handleAction(receipt, 'reject')}
              >
                رد فیش
              </Button>
            </div>
          ) : (
            <span className="text-[11px] text-tg-hint">
              {receipt.reviewedAt ? formatDateTime(receipt.reviewedAt) : '—'}
            </span>
          ),
      },
    ],
    [busyId],
  )

  const filterOptions: FilterChipOption<ReceiptFilter>[] = [
    { value: 'PENDING', label: 'در انتظار تایید' },
    { value: 'APPROVED', label: 'تایید شده' },
    { value: 'REJECTED', label: 'رد شده' },
    { value: 'all', label: 'همه' },
  ]

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="عملیات"
        title="تایید واریزی‌های کارت به کارت"
        description="فیش‌های ثبت‌شده توسط کاربران برای شارژ کیف پول یا خرید مستقیم محصول. با تایید فیش، موجودی کاربر شارژ یا سفارشش پرداخت‌شده می‌شود."
        meta={
          <Badge tone="brand" size="sm">
            {formatCount(receipts.length)} فیش
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
            به‌روزرسانی
          </Button>
        }
      />

      {feedback ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
          {feedback}
        </div>
      ) : null}
      {actionError ? (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-600 dark:text-red-400">
          {actionError}
        </div>
      ) : null}

      {error ? (
        <AdminErrorState message={error} onRetry={refresh} />
      ) : (
        <DataTable<PaymentReceipt>
          columns={columns}
          rows={receipts}
          rowKey={(receipt) => receipt.id}
          loading={loading}
          skeletonRows={6}
          minWidthClassName="min-w-[1050px]"
          header={
            <div className="space-y-3">
              <div>
                <h2 className="text-[15px] font-semibold text-tg-text">فیش‌های واریز</h2>
                <p className="mt-0.5 text-[12px] text-tg-hint">
                  تایید فیش کیف پول را شارژ می‌کند؛ تایید فیش محصول، سفارش در انتظار را پرداخت‌شده می‌کند.
                </p>
              </div>
              <FilterChips
                options={filterOptions}
                value={filter}
                onChange={setFilter}
                label="فیلتر فیش‌های واریز"
              />
            </div>
          }
          empty={
            <EmptyState
              icon={ReceiptText}
              title="فیشی در این وضعیت وجود ندارد"
              description="به‌محض ثبت فیش کارت به کارت توسط کاربران، اینجا برای تایید نمایش داده می‌شود."
              className="py-8"
            />
          }
        />
      )}
    </div>
  )
}
