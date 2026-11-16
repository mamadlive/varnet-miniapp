import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, RefreshCw, Search, SearchX, X } from 'lucide-react'
import { CategoryChips } from '@/components/miniapp/CategoryChips'
import { ProductCard, ProductCardSkeleton } from '@/components/miniapp/ProductCard'
import { ProductQuickView } from '@/components/miniapp/ProductQuickView'
import { PurchaseConfirmSheet } from '@/components/marketplace'
import type { PurchaseTarget } from '@/components/marketplace'
import { Badge, Button, Card, EmptyState, Input } from '@/components/ui'
import { useTelegram } from '@/hooks/useTelegram'
import { formatCount } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { listAccountProducts } from '@/services/accounts.service'
import type { AccountProduct, Currency, ProductCategory } from '@/types'

const PRODUCT_CATEGORIES: ProductCategory[] = [
  'streaming',
  'ai',
  'gaming',
  'design',
  'social',
  'other',
]

/** Everything the purchase confirmation sheet needs about the tapped product. */
interface PendingPurchase {
  target: PurchaseTarget
  price: number
  currency: Currency
  description?: string
  /** Account product whose real logo heads the confirmation summary. */
  logo?: AccountProduct
  kind: 'account' | 'vpn'
}

function parseCategory(value: string | null): ProductCategory | 'all' {
  if (!value) return 'all'
  return PRODUCT_CATEGORIES.includes(value as ProductCategory) ? (value as ProductCategory) : 'all'
}

/** Full account catalogue with instant client-side search + category filters. */
export default function MarketplacePage() {
  const { haptic } = useTelegram()
  const [searchParams, setSearchParams] = useSearchParams()

  const [category, setCategory] = useState<ProductCategory | 'all'>(() =>
    parseCategory(searchParams.get('category')),
  )
  const [query, setQuery] = useState(() => searchParams.get('search') ?? '')

  const [products, setProducts] = useState<AccountProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedProduct, setSelectedProduct] = useState<AccountProduct | null>(null)
  const [pendingPurchase, setPendingPurchase] = useState<PendingPurchase | null>(null)
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
          setLoadFailed(true)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
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

  const syncParams = (nextCategory: ProductCategory | 'all', nextQuery: string) => {
    const params = new URLSearchParams()
    if (nextCategory !== 'all') params.set('category', nextCategory)
    const trimmed = nextQuery.trim()
    if (trimmed) params.set('search', trimmed)
    setSearchParams(params, { replace: true })
  }

  const handleCategory = (nextCategory: ProductCategory | 'all') => {
    setCategory(nextCategory)
    syncParams(nextCategory, query)
  }

  const handleQuery = (nextQuery: string) => {
    setQuery(nextQuery)
    syncParams(category, nextQuery)
  }

  const clearFilters = () => {
    haptic('light')
    setCategory('all')
    setQuery('')
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  const retryLoad = () => {
    setLoading(true)
    setLoadFailed(false)
    setReloadKey((key) => key + 1)
  }

  const handleQuickViewPurchase = useCallback((product: AccountProduct) => {
    setPendingPurchase({
      target: { id: product.id, title: product.title },
      price: product.price,
      currency: product.currency,
      description: product.subtitle,
      logo: product,
      kind: 'account',
    })
    setSelectedProduct(null)
  }, [])

  const handlePurchaseConfirm = useCallback((target: PurchaseTarget) => {
    setPendingPurchase(null)
    setToast(target)
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3000)
  }, [])

  const handlePurchaseCancel = useCallback(() => {
    setPendingPurchase(null)
  }, [])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return products.filter((product) => {
      if (category !== 'all' && product.category !== category) return false
      if (!term) return true
      const haystack =
        `${product.title} ${product.subtitle ?? ''} ${product.category}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [products, category, query])

  const hasFilters = category !== 'all' || query.trim().length > 0

  return (
    <div className="tg-page animate-fade-in pt-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-tg-hint">کاتالوگ</p>
          <h1 className="text-[22px] font-bold leading-tight text-tg-text">
            {fa.marketplace.title}
          </h1>
          <p className="mt-1 text-[12.5px] leading-snug text-tg-hint">
            اکانت‌ها، اشتراک‌ها و گیفت‌کارت‌ها — تحویل در چند دقیقه.
          </p>
        </div>
        <Badge tone="brand" size="md" className="mt-1 shrink-0">
          {loading ? '…' : `${formatCount(products.length)} ${fa.common.items}`}
        </Badge>
      </header>

      <div className="mt-4">
        <Input
          icon={Search}
          value={query}
          onChange={(event) => handleQuery(event.target.value)}
          placeholder="جستجو در بازارچه…"
          aria-label="جستجوی بازارچه"
          enterKeyHint="search"
          type="search"
          trailing={
            query ? (
              <button
                type="button"
                aria-label="پاک کردن جستجو"
                onClick={() => handleQuery('')}
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-tg-secondary-bg text-tg-hint transition-colors hover:text-tg-text"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : undefined
          }
        />
      </div>

      <div className="mt-4">
        <CategoryChips value={category} onChange={handleCategory} />
      </div>

      <div className="mb-2.5 mt-2 flex min-h-6 items-center justify-between gap-2 px-1">
        <p className="text-[12px] text-tg-hint" aria-live="polite">
          {loading ? fa.common.loading : `${formatCount(filtered.length)} نتیجه`}
        </p>
        {hasFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="-my-2 flex min-h-11 items-center text-[12px] font-medium text-tg-link transition-opacity hover:opacity-80"
          >
            پاک کردن فیلترها
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        </div>
      ) : loadFailed ? (
        <Card variant="surface" padded={false}>
          <EmptyState
            icon={RefreshCw}
            title="بارگذاری کاتالوگ ناموفق بود"
            description="سرویس بازارچه در دسترس نیست. اتصال خود را بررسی کنید و دوباره تلاش کنید."
            action={
              <Button size="sm" variant="secondary" onClick={retryLoad}>
                {fa.common.retry}
              </Button>
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card variant="surface" padded={false}>
          <EmptyState
            icon={SearchX}
            title="محصولی مطابق جستجو نیست"
            description={
              hasFilters
                ? 'کلیدواژه دیگری را امتحان کنید یا فیلترها را پاک کنید تا کل کاتالوگ را ببینید.'
                : 'کاتالوگ در حال حاضر خالی است. موجودی جدید هر روز اضافه می‌شود.'
            }
            action={
              hasFilters ? (
                <Button size="sm" variant="secondary" onClick={clearFilters}>
                  پاک کردن فیلترها
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={retryLoad}>
                  بازآوری کاتالوگ
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onSelect={(selected) => {
                haptic('light')
                setSelectedProduct(selected)
              }}
            />
          ))}
        </div>
      )}

      {selectedProduct ? (
        <ProductQuickView
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onPurchase={handleQuickViewPurchase}
        />
      ) : null}

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
        logo={pendingPurchase?.logo}
        kind={pendingPurchase?.kind}
        onConfirm={handlePurchaseConfirm}
        onCancel={handlePurchaseCancel}
      />
    </div>
  )
}
