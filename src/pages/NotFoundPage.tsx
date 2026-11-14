import { useLocation, useNavigate } from 'react-router-dom'
import { Compass, Home, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/Button'

/** صفحه ۴۰۴ مشترک؛ مقصد «بازگشت» را از پیشوند مسیر تشخیص می‌دهد. */
export default function NotFoundPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isAdminRoute = pathname.startsWith('/admin')

  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-tg-separator bg-tg-bg p-8 text-center shadow-sm">
        <span className="mx-auto mb-5 flex size-16 items-center justify-center rounded-3xl bg-brand-500/10 text-brand-500">
          <Compass className="size-8" aria-hidden />
        </span>
        <p className="text-[11px] font-semibold text-tg-hint">خطای ۴۰۴</p>
        <h1 className="mt-2 text-xl font-semibold text-tg-text">صفحه پیدا نشد</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-tg-hint">
          این مسیر هنوز در اسکلت پروژه وجود ندارد و ممکن است در نسخه‌های بعدی اضافه شود.
        </p>
        <p className="bidi-ltr mt-3 truncate rounded-lg bg-tg-secondary-bg px-3 py-2 font-mono text-[11px] text-tg-hint">
          {pathname}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Button variant="secondary" fullWidth onClick={() => navigate(-1)}>
            بازگشت
          </Button>
          <Button
            fullWidth
            leftIcon={
              isAdminRoute ? (
                <LayoutDashboard className="size-4" aria-hidden />
              ) : (
                <Home className="size-4" aria-hidden />
              )
            }
            onClick={() => navigate(isAdminRoute ? '/admin' : '/app')}
          >
            {isAdminRoute ? 'بازگشت به داشبورد' : 'بازگشت به بازارچه'}
          </Button>
        </div>
      </div>
    </div>
  )
}
