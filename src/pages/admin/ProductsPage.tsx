import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  CloudDownload,
  Package,
  Pencil,
  RefreshCw,
  Search,
  SlidersHorizontal,
  StickyNote,
  Trash2,
} from 'lucide-react'
import { AdminErrorState } from '@/components/admin/AdminStates'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { DataTable } from '@/components/admin/AdminTable'
import type { DataTableColumn } from '@/components/admin/AdminTable'
import { FilterChips } from '@/components/admin/FilterChips'
import type { FilterChipOption } from '@/components/admin/FilterChips'
import { CategoryBadge } from '@/components/admin/StatusBadges'
import { BrandLogo } from '@/components/marketplace'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { Switch } from '@/components/ui/Switch'
import {
  applyProfitMargin,
  autoMarginForUsd,
  autoMarginPercentForUsd,
  hasMargin,
  type ProfitMargin,
} from '@/lib/pricing'
import { PRODUCT_CATEGORIES, CATEGORY_LABELS } from '@/lib/productCategories'
import { cn } from '@/lib/utils'
import { formatCount, formatCurrency, toPersianDigits } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { isApiError } from '@/services/apiClient'
import { listAccountProducts, syncAccountProducts } from '@/services/accounts.service'
import { deleteAdminProducts, saveProductOverride } from '@/services/admin.service'
import { TEST_PRODUCT_IDS } from '@/services/mocks'
import { useAdminStore } from '@/store/adminStore'
import type { AccountProduct, DiscountType, ProductCategory } from '@/types'

const MAX_FIXED_MARGIN = 50_000_000

function errorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback
  return isApiError(error) && error.code ? `${message} (${error.code})` : message
}

type CategoryFilter = ProductCategory | 'all'

const CATEGORY_FILTER_OPTIONS: FilterChipOption<CategoryFilter>[] = [
  { value: 'all', label: 'همه محصولات' },
  ...PRODUCT_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })),
]

export default function ProductsPage() {
  const [products, setProducts] = useState<AccountProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [syncing, setSyncing] = useState(false)
  const [syncNotice, setSyncNotice] = useState<{
    tone: 'success'
    message: string
  } | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deletingRef = useRef(false)

  const margins = useAdminStore((state) => state.margins)
  const setMargin = useAdminStore((state) => state.setMargin)
  const hiddenProductIds = useAdminStore((state) => state.hiddenProductIds)
  const toggleProductHidden = useAdminStore((state) => state.toggleProductHidden)
  const deleteProduct = useAdminStore((state) => state.deleteProduct)
  const productNotes = useAdminStore((state) => state.productNotes)
  const setProductNote = useAdminStore((state) => state.setProductNote)
  const usdtRateToman = useAdminStore((state) =>
    state.usdtRateToman > 0 ? state.usdtRateToman : state.serverUsdtRateToman,
  )
  const marginTiers = useAdminStore((state) => state.marginTiers)

  const [marginProduct, setMarginProduct] = useState<AccountProduct | null>(null)
  const [marginType, setMarginType] = useState<DiscountType>('percent')
  const [marginValue, setMarginValue] = useState('')
  const [marginError, setMarginError] = useState<string | null>(null)
  const [noteProduct, setNoteProduct] = useState<AccountProduct | null>(null)
  const [noteValue, setNoteValue] = useState('')
  const [editProduct, setEditProduct] = useState<AccountProduct | null>(null)
  const [faDescription, setFaDescription] = useState('')
  const [customCategory, setCustomCategory] = useState<ProductCategory | ''>('')
  const [isFeatured, setIsFeatured] = useState(false)
  const [isBestseller, setIsBestseller] = useState(false)
  const [savingProduct, setSavingProduct] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editNotice, setEditNotice] = useState<string | null>(null)
  const editDialogRef = useRef<HTMLDivElement>(null)
  const editTriggerRef = useRef<HTMLElement | null>(null)

  const testProductCount = products.filter((product) =>
    TEST_PRODUCT_IDS.includes(product.id),
  ).length

  const basePriceOf = (product: AccountProduct): number => product.basePrice ?? product.price
  const usdPriceOf = (product: AccountProduct): number =>
    product.usdPrice ?? (usdtRateToman > 0 ? basePriceOf(product) / usdtRateToman : 0)
  const marginFor = (product: AccountProduct): ProfitMargin =>
    hasMargin(margins[product.id])
      ? margins[product.id]!
      : autoMarginForUsd(usdPriceOf(product), marginTiers)
  const finalPriceOf = (product: AccountProduct): number =>
    applyProfitMargin(basePriceOf(product), marginFor(product))

  const openProductEditor = (product: AccountProduct) => {
    editTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setEditProduct(product)
    setFaDescription(product.faDescription ?? '')
    setCustomCategory(product.customCategory ?? '')
    setIsFeatured(product.isFeatured ?? false)
    setIsBestseller(product.isBestseller ?? false)
    setEditError(null)
    setEditNotice(null)
  }

  const closeProductEditor = () => {
    if (savingProduct) return
    setEditProduct(null)
    editTriggerRef.current?.focus()
  }

  useEffect(() => {
    if (!editProduct) return
    const dialog = editDialogRef.current?.closest<HTMLElement>('[role="dialog"]')
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), select:not([disabled]), input:not([disabled])',
    ) ?? [])
    editDialogRef.current?.querySelector<HTMLElement>('textarea')?.focus()
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (!elements.length) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', trapFocus)
    return () => document.removeEventListener('keydown', trapFocus)
  }, [editProduct])

  const openMarginEditor = (product: AccountProduct) => {
    const rule = margins[product.id]
    setMarginProduct(product)
    setMarginType(rule?.type ?? 'percent')
    setMarginValue(rule ? String(rule.value) : '')
    setMarginError(null)
  }

  const closeMarginEditor = () => {
    setMarginProduct(null)
    setMarginValue('')
    setMarginError(null)
  }

  const openNoteEditor = (product: AccountProduct) => {
    setNoteProduct(product)
    setNoteValue(productNotes[product.id] ?? '')
  }

  const closeNoteEditor = () => {
    setNoteProduct(null)
    setNoteValue('')
  }

  const handleSaveNote = () => {
    if (!noteProduct) return
    setProductNote(noteProduct.id, noteValue)
    closeNoteEditor()
  }

  const handleSaveMargin = () => {
    if (!marginProduct) return
    const value = Number(marginValue)
    if (!Number.isFinite(value) || value < 0) {
      setMarginError('یک مقدار معتبر وارد کنید.')
      return
    }
    if (marginType === 'percent' && value > 200) {
      setMarginError('درصد حاشیه سود نمی‌تواند بیشتر از ۲۰۰ باشد.')
      return
    }
    if (marginType === 'fixed' && value > MAX_FIXED_MARGIN) {
      setMarginError(`حاشیه ثابت نمی‌تواند بیشتر از ${formatCurrency(MAX_FIXED_MARGIN)} باشد.`)
      return
    }
    setMargin(
      marginProduct.id,
      value > 0 ? { type: marginType, value: Math.round(value) } : null,
    )
    closeMarginEditor()
  }

  const deleteProducts = async (ids: string[]) => {
    if (deletingRef.current) return
    deletingRef.current = true
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteAdminProducts(ids)
      ids.forEach(deleteProduct)
      const deleted = new Set(ids)
      setProducts((current) => current.filter((product) => !deleted.has(product.id)))
    } catch (err) {
      setDeleteError(errorMessage(err, 'حذف محصولات انجام نشد.'))
    } finally {
      deletingRef.current = false
      setDeleting(false)
    }
  }

  const handleDeleteProduct = (product: AccountProduct) => {
    if (deletingRef.current) return
    const confirmed = window.confirm(
      `محصول «${product.title}» برای همیشه حذف شود؟\nاین عمل قابل بازگشت نیست و با همگام‌سازی مجدد هم برنمی‌گردد.`,
    )
    if (confirmed) void deleteProducts([product.id])
  }

  const handleDeleteTestProducts = () => {
    if (deletingRef.current || testProductCount === 0) return
    const ids = products.filter((product) => TEST_PRODUCT_IDS.includes(product.id)).map((product) => product.id)
    const confirmed = window.confirm(
      `${formatCount(ids.length)} محصول نمونه (داده‌های آزمایشی) حذف شود؟\nاین عمل قابل بازگشت نیست.`,
    )
    if (confirmed) void deleteProducts(ids)
  }

  const marginPreviewBase = marginProduct ? basePriceOf(marginProduct) : 0
  const marginPreviewValue = Number(marginValue)
  const marginAutoPercent = marginProduct
    ? autoMarginPercentForUsd(usdPriceOf(marginProduct), marginTiers)
    : 0
  const marginPreviewRule: ProfitMargin | undefined = marginProduct
    ? Number.isFinite(marginPreviewValue) && marginPreviewValue > 0
      ? { type: marginType, value: Math.round(marginPreviewValue) }
      : autoMarginForUsd(usdPriceOf(marginProduct), marginTiers)
    : undefined
  const marginPreview = applyProfitMargin(marginPreviewBase, marginPreviewRule)

  const load = useCallback(async () => {
    try {
      setProducts(await listAccountProducts({ includeHidden: true }))
    } catch (err) {
      setError(errorMessage(err, 'بارگیری محصولات ممکن نشد.'))
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSaveProduct = async () => {
    if (!editProduct || savingProduct) return
    setSavingProduct(true)
    setEditError(null)
    try {
      await saveProductOverride({
        productId: editProduct.id,
        faDescription: faDescription.trim() || null,
        customCategory: customCategory || null,
        isFeatured,
        isBestseller,
      })
    } catch (err) {
      setEditError(errorMessage(err, 'ذخیره تغییرات محصول انجام نشد.'))
      setSavingProduct(false)
      return
    }

    setEditProduct(null)
    editTriggerRef.current?.focus()
    try {
      setProducts(await listAccountProducts({ includeHidden: true }))
      setError(null)
      setEditNotice('تغییرات محصول ذخیره شد.')
    } catch (err) {
      setError(`تغییرات ذخیره شد، اما بارگیری مجدد کاتالوگ ممکن نشد: ${errorMessage(err, 'خطای بارگیری محصولات')}`)
    } finally {
      setSavingProduct(false)
    }
  }

  const refresh = useCallback(() => {
    setError(null)
    setLoading(true)
    void load()
  }, [load])

  useEffect(() => {
    if (!syncNotice) return
    const timer = window.setTimeout(() => setSyncNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [syncNotice])

  const handleSync = async () => {
    setSyncing(true)
    setError(null)
    setSyncNotice(null)
    setSyncError(null)

    try {
      const result = await syncAccountProducts()
      setProducts(await listAccountProducts({ includeHidden: true }))

      const skippedNote =
        result.skipped > 0
          ? ` (${formatCount(result.skipped)} رکورد نامعتبر نادیده گرفته شد)`
          : ''
      setSyncNotice({
        tone: 'success',
        message: `${formatCount(result.products.length)} محصول از ارائه‌دهنده همگام‌سازی شد${skippedNote}.`,
      })
    } catch (err) {
      setSyncError(errorMessage(err, 'همگام‌سازی محصولات ممکن نشد.'))
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const data = await listAccountProducts({ includeHidden: true })
        if (!cancelled) setProducts(data)
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'بارگیری محصولات ممکن نشد.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const categoryOptions = useMemo(
    () =>
      CATEGORY_FILTER_OPTIONS.map((option) => ({
        ...option,
        count:
          option.value === 'all'
            ? products.length
            : products.filter((product) => product.category === option.value).length,
      })),
    [products],
  )

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return products.filter((product) => {
      if (category !== 'all' && product.category !== category) return false
      if (!needle) return true
      return `${product.title} ${product.subtitle ?? ''}`.toLowerCase().includes(needle)
    })
  }, [category, products, query])

  const isVisible = (product: AccountProduct): boolean =>
    !hiddenProductIds.includes(product.id)

  const visibleCount = products.filter((product) => isVisible(product)).length
  const overrideCount = products.filter((product) => hasMargin(margins[product.id])).length
  const noteCount = products.filter((product) => Boolean(productNotes[product.id])).length
  const hasFilters = category !== 'all' || query.trim().length > 0

  const columns: DataTableColumn<AccountProduct>[] = [
    {
      key: 'product',
      header: 'محصول',
      render: (product) => (
        <div className="flex items-center gap-3">
          <BrandLogo
            product={product}
            className={cn(
              'bg-gradient-to-br shadow-sm ring-1 ring-black/5',
              product.gradient ?? 'from-brand-500 to-brand-700',
            )}
          />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-tg-text">{product.title}</p>
            <p className="truncate text-[11.5px] text-tg-hint">
              {product.subtitle ?? <span className="bidi-ltr">{product.id}</span>}
            </p>
            {productNotes[product.id] ? (
              <p className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] font-medium text-brand-600">
                <StickyNote className="size-3" aria-hidden />
                توضیح ادمین
              </p>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'دسته‌بندی',
      render: (product) => <CategoryBadge category={product.category} />,
    },
    {
      key: 'price',
      header: 'قیمت نهایی',
      align: 'right',
      render: (product) => {
        const basePrice = basePriceOf(product)
        const finalPrice = finalPriceOf(product)
        return (
          <div>
            <p className="text-[13px] font-semibold tabular-nums text-tg-text">
              {formatCurrency(finalPrice, product.currency)}
            </p>
            {finalPrice !== basePrice ? (
              <p className="text-[11px] tabular-nums text-tg-hint">
                پایه {formatCurrency(basePrice, product.currency)}
              </p>
            ) : null}
          </div>
        )
      },
    },
    {
      key: 'margin',
      header: 'حاشیه سود',
      render: (product) => {
        const rule = margins[product.id]
        return (
          <div className="flex items-center gap-2">
            {hasMargin(rule) ? (
              <Badge tone="success" size="sm">
                دستی {rule.type === 'percent'
                  ? `+${formatCount(rule.value)}٪`
                  : `+${formatCurrency(rule.value)}`}
              </Badge>
            ) : (
              <Badge tone="brand" size="sm">
                خودکار {formatCount(autoMarginPercentForUsd(usdPriceOf(product), marginTiers))}٪
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-lg"
              aria-label={`تعیین حاشیه سود ${product.title}`}
              title="ویرایش حاشیه سود"
              onClick={() => openMarginEditor(product)}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden />
            </Button>
          </div>
        )
      },
    },
    {
      key: 'stock',
      header: 'موجودی',
      render: (product) => (
        <div>
          <p
            className={cn(
              'text-[12.5px] font-semibold tabular-nums',
              product.stock === 0
                ? 'text-rose-600'
                : product.stock <= 10
                  ? 'text-amber-600'
                  : 'text-tg-text',
            )}
          >
            {formatCount(product.stock)}
          </p>
          <p className="text-[11px] text-tg-hint">
            {product.stock === 0 ? 'ناموجود' : 'موجود'}
          </p>
        </div>
      ),
    },
    {
      key: 'visibility',
      header: 'ویترین',
      render: (product) => {
        const visible = isVisible(product)
        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={visible}
              label={`${visible ? 'حذف' : 'نمایش'} ${product.title} در ویترین`}
              onCheckedChange={() => toggleProductHidden(product.id)}
            />
            <span
              className={cn(
                'text-[12px] font-medium',
                visible ? 'text-tg-text' : 'text-tg-hint',
              )}
            >
              {visible ? 'نمایش' : 'پنهان'}
            </span>
          </div>
        )
      },
    },
    {
      key: 'actions',
      header: 'اقدامات',
      align: 'right',
      render: (product) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="secondary"
            size="sm"
            aria-label={`ویرایش محصول ${product.title}`}
            disabled={savingProduct || syncing || loading || deleting}
            onClick={() => openProductEditor(product)}
          >
            ویرایش
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg"
            aria-label={`ویرایش حاشیه سود ${product.title}`}
            onClick={() => openMarginEditor(product)}
          >
            <Pencil className="size-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'size-8 rounded-lg',
              productNotes[product.id] ? 'text-brand-600' : undefined,
            )}
            aria-label={`توضیحات تکمیلی ${product.title}`}
            title={
              productNotes[product.id] ? 'ویرایش توضیحات تکمیلی' : 'افزودن توضیحات تکمیلی'
            }
            onClick={() => openNoteEditor(product)}
          >
            <StickyNote className="size-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg text-tg-destructive hover:bg-rose-500/10"
            aria-label={`حذف ${product.title}`}
            title="حذف محصول"
            disabled={deleting || syncing || loading || savingProduct}
            onClick={() => handleDeleteProduct(product)}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      ),
    },
  ]

  const clearFilters = () => {
    setQuery('')
    setCategory('all')
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="کاتالوگ"
        title="محصولات اکانت"
        description="اکانت‌ها و اشتراک‌های دیجیتال قابل فروش در مینی‌اپ. قیمت پایه از طریق پروکسی امن کلادفلر از ارائه‌دهنده خوانده می‌شود (کلید API فقط سمت سرور است) و سود پلکانی خودکار یا حاشیه دستی روی آن اعمال می‌شود."
        meta={
          <Badge tone="brand" size="sm">
            {formatCount(products.length)} محصول
          </Badge>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              leftIcon={<CloudDownload className="size-4" />}
              loading={syncing}
              disabled={savingProduct || loading || deleting}
              onClick={() => void handleSync()}
            >
              همگام‌سازی محصولات
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw className="size-4" />}
              loading={loading}
              disabled={savingProduct || syncing || deleting}
              onClick={refresh}
            >
              {fa.common.refresh}
            </Button>
            {testProductCount > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                className="text-tg-destructive hover:bg-rose-500/10"
                leftIcon={<Trash2 className="size-4" />}
                disabled={deleting || syncing || loading || savingProduct}
                onClick={handleDeleteTestProducts}
              >
                حذف محصولات نمونه ({formatCount(testProductCount)})
              </Button>
            ) : null}
          </div>
        }
      />

      {editNotice ? (
        <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[12.5px] text-emerald-700">
          {editNotice}
        </div>
      ) : null}

      {syncNotice ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[12.5px] leading-relaxed text-emerald-700"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{syncNotice.message}</p>
        </div>
      ) : null}

      {deleteError ? (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[12.5px] text-rose-700">
          {deleteError}
        </div>
      ) : null}

      {syncError ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[12.5px] leading-relaxed text-rose-700"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{syncError}</p>
        </div>
      ) : null}

      {error ? (
        <AdminErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-tg-hint">
            <span>{formatCount(visibleCount)} در ویترین</span>
            <span className="text-tg-hint/50">·</span>
            <span>{formatCount(products.length - visibleCount)} پنهان</span>
            <span className="text-tg-hint/50">·</span>
            <span>{formatCount(overrideCount)} حاشیه دستی</span>
            <span className="text-tg-hint/50">·</span>
            <span>{formatCount(noteCount)} با توضیح ادمین</span>
            <span className="text-tg-hint/50">·</span>
            <span>{formatCount(filteredProducts.length)} نمایش</span>
          </div>

          <DataTable<AccountProduct>
            columns={columns}
            rows={filteredProducts}
            rowKey={(product) => product.id}
            loading={loading && products.length === 0}
            skeletonRows={6}
            minWidthClassName="min-w-[900px]"
            header={
              <div className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-[15px] font-semibold text-tg-text">کاتالوگ محصولات</h2>
                    <p className="mt-0.5 text-[12px] text-tg-hint">
                      نمایش {formatCount(filteredProducts.length)} از {formatCount(products.length)}{' '}
                      محصول
                    </p>
                  </div>
                  <div className="w-full sm:w-72">
                    <Input
                      icon={Search}
                      placeholder="جستجوی محصولات…"
                      aria-label="جستجوی محصولات"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                </div>
                <FilterChips
                  options={categoryOptions}
                  value={category}
                  onChange={setCategory}
                  label="فیلتر محصولات بر اساس دسته‌بندی"
                />
              </div>
            }
            empty={
              <EmptyState
                icon={Package}
                title={hasFilters ? 'محصولی با این فیلترها پیدا نشد' : 'هنوز محصولی ثبت نشده'}
                description={
                  hasFilters
                    ? 'دسته‌بندی یا عبارت جستجوی دیگری را امتحان کنید یا فیلترها را پاک کنید تا کل کاتالوگ نمایش داده شود.'
                    : 'اولین محصول اکانت را اضافه کنید تا فروش در مینی‌اپ آغاز شود.'
                }
                action={
                  hasFilters ? (
                    <Button variant="secondary" size="sm" onClick={clearFilters}>
                      پاک کردن فیلترها
                    </Button>
                  ) : undefined
                }
                className="py-8"
              />
            }
          />
        </>
      )}

      <Sheet
        open={editProduct !== null}
        onClose={closeProductEditor}
        title="ویرایش محصول"
        description={editProduct ? `ویرایش تنظیمات «${editProduct.title}»` : undefined}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        footer={
          <div className="flex gap-2">
            <Button className="flex-1" loading={savingProduct} onClick={() => void handleSaveProduct()}>
              ذخیره تغییرات
            </Button>
            <Button variant="secondary" disabled={savingProduct} onClick={closeProductEditor}>
              انصراف
            </Button>
          </div>
        }
      >
        <div ref={editDialogRef} className="space-y-4" aria-busy={savingProduct}>
          <div>
            <label htmlFor="product-fa-description" className="mb-1.5 block text-[13px] font-medium text-tg-text">
              توضیحات فارسی
            </label>
            <textarea
              id="product-fa-description"
              value={faDescription}
              onChange={(event) => setFaDescription(event.target.value)}
              disabled={savingProduct}
              rows={5}
              dir="auto"
              aria-describedby="product-fa-description-help"
              className="w-full resize-y rounded-xl border border-tg-separator bg-tg-bg px-3.5 py-2.5 text-[13px] leading-relaxed text-tg-text focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
            <p id="product-fa-description-help" className="mt-1 text-[11.5px] text-tg-hint">
              برای حذف توضیحات سفارشی، این فیلد را خالی بگذارید.
            </p>
          </div>
          <div>
            <label htmlFor="product-custom-category" className="mb-1.5 block text-[13px] font-medium text-tg-text">
              دسته‌بندی
            </label>
            <select
              id="product-custom-category"
              value={customCategory}
              onChange={(event) => setCustomCategory(event.target.value as ProductCategory | '')}
              disabled={savingProduct}
              className="w-full rounded-xl border border-tg-separator bg-tg-bg px-3.5 py-2.5 text-[13px] text-tg-text focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">خودکار (حذف دسته‌بندی سفارشی)</option>
              {PRODUCT_CATEGORIES.map((item: ProductCategory) => (
                <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-tg-text">
            <input type="checkbox" checked={isFeatured} disabled={savingProduct} onChange={(event) => setIsFeatured(event.target.checked)} />
            محصول ویژه
          </label>
          <label className="flex items-center gap-2 text-[13px] text-tg-text">
            <input type="checkbox" checked={isBestseller} disabled={savingProduct} onChange={(event) => setIsBestseller(event.target.checked)} />
            محصول پرفروش
          </label>
          {editError ? <p role="alert" className="text-[12.5px] text-tg-destructive">{editError}</p> : null}
        </div>
      </Sheet>

      <Sheet
        open={marginProduct !== null}
        onClose={closeMarginEditor}
        title="حاشیه سود"
        description={
          marginProduct
            ? `قیمت پایه «${marginProduct.title}» از ارائه‌دهنده خوانده می‌شود. تا وقتی حاشیه دستی تعیین نکنید، سود خودکار ${formatCount(marginAutoPercent)}٪ پلکانی اعمال می‌شود.`
            : undefined
        }
        className="sm:max-w-md"
        footer={
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleSaveMargin}>
                ذخیره حاشیه
              </Button>
              <Button variant="secondary" onClick={closeMarginEditor}>
                انصراف
              </Button>
            </div>
            {marginProduct && hasMargin(margins[marginProduct.id]) ? (
              <Button
                variant="ghost"
                fullWidth
                className="text-tg-destructive"
                onClick={() => {
                  setMargin(marginProduct.id, null)
                  closeMarginEditor()
                }}
              >
                حذف حاشیه دستی و بازگشت به سود خودکار
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-tg-hint">نوع حاشیه</p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="نوع حاشیه سود">
              {(
                [
                  { value: 'percent', label: 'درصدی (٪)' },
                  { value: 'fixed', label: 'مبلغ ثابت (تومان)' },
                ] as const
              ).map((option) => {
                const active = marginType === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setMarginType(option.value)
                      setMarginError(null)
                    }}
                    className={cn(
                      'h-10 rounded-xl border text-[12.5px] font-medium transition-colors',
                      active
                        ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                        : 'border-tg-separator bg-tg-bg text-tg-text hover:bg-tg-secondary-bg',
                    )}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <Input
            label={marginType === 'percent' ? 'درصد سود' : 'مبلغ سود'}
            type="number"
            inputMode="numeric"
            min={0}
            max={marginType === 'percent' ? 200 : MAX_FIXED_MARGIN}
            value={marginValue}
            onChange={(event) => {
              setMarginValue(event.target.value)
              setMarginError(null)
            }}
            placeholder={marginType === 'percent' ? 'مثلاً ۲۰' : 'مثلاً ۵۰۰۰۰'}
            trailing={
              <span className="shrink-0 text-[12px] font-medium text-tg-hint">
                {marginType === 'percent' ? '٪' : 'تومان'}
              </span>
            }
            error={marginError ?? undefined}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-500/25 bg-brand-500/5 px-3 py-2 text-[12px]">
            <span className="text-tg-hint">سود خودکار این محصول</span>
            <span className="font-semibold text-brand-600">
              {formatCount(marginAutoPercent)}٪ · پایه{' '}
              <span className="bidi-ltr tabular-nums">
                {marginProduct ? toPersianDigits(usdPriceOf(marginProduct).toFixed(2)) : '۰'}
              </span>{' '}
              دلار
            </span>
          </div>

          <div className="space-y-1.5 rounded-xl border border-tg-separator bg-tg-secondary-bg/60 p-3 text-[12.5px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-tg-hint">قیمت پایه ارائه‌دهنده</span>
              <span className="tabular-nums text-tg-text">
                {formatCurrency(marginPreviewBase, marginProduct?.currency ?? 'IRT')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-tg-text">قیمت نهایی در مینی‌اپ</span>
              <span className="font-bold tabular-nums text-tg-text">
                {formatCurrency(marginPreview, marginProduct?.currency ?? 'IRT')}
              </span>
            </div>
            {marginPreview > marginPreviewBase ? (
              <div className="flex items-center justify-between gap-3 text-emerald-600">
                <span>سود هر فروش</span>
                <span className="font-medium tabular-nums">
                  +{formatCurrency(marginPreview - marginPreviewBase, marginProduct?.currency ?? 'IRT')}
                </span>
              </div>
            ) : null}
          </div>

          <p className="text-[11.5px] leading-relaxed text-tg-hint">
            با ذخیره ۰ حاشیه دستی حذف می‌شود و محصول به سود خودکار پلکانی برمی‌گردد. قیمت
            نمایش‌داده‌شده به نزدیک‌ترین هزار تومان گرد می‌شود.
          </p>
        </div>
      </Sheet>

      <Sheet
        open={noteProduct !== null}
        onClose={closeNoteEditor}
        title="توضیحات تکمیلی ادمین"
        description={
          noteProduct
            ? `این متن در صفحه جزئیات «${noteProduct.title}» در مینی‌اپ، کنار توضیحات ارائه‌دهنده نمایش داده می‌شود.`
            : undefined
        }
        className="sm:max-w-lg"
        footer={
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleSaveNote}>
              ذخیره توضیحات
            </Button>
            <Button variant="secondary" onClick={closeNoteEditor}>
              انصراف
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <textarea
            value={noteValue}
            onChange={(event) => setNoteValue(event.target.value)}
            rows={6}
            dir="auto"
            aria-label="توضیحات تکمیلی ادمین"
            placeholder="مثلاً: تحویل حداکثر تا ۳۰ دقیقه پس از پرداخت؛ نیاز به ایمیل شخصی دارد."
            className="w-full resize-y rounded-xl border border-tg-separator bg-tg-bg px-3.5 py-2.5 text-[13px] leading-relaxed text-tg-text placeholder:text-tg-hint/70 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <p className="text-[11.5px] leading-relaxed text-tg-hint">
            با خالی گذاشتن این فیلد، توضیحات تکمیلی حذف می‌شود. توضیحات اصلی ارائه‌دهنده
            دست‌نخورده باقی می‌ماند.
          </p>
        </div>
      </Sheet>
    </div>
  )
}
