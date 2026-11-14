import { useNavigate } from 'react-router-dom'
import { BadgeCheck, ChevronRight, FileText, RefreshCcw, ShieldAlert } from 'lucide-react'

import { Card } from '@/components/ui/Card'
import { useTelegram } from '@/hooks/useTelegram'

/** Verbatim customer-facing disclaimer — double space after «تکنولوژی» is intentional. */
export const TERMS_TEXT =
  'کاربر گرامی؛ به استثنای سرویس‌های آی‌پی ثابت اختصاصی، سایر محصولات دیجیتال از نوع خاکستری بوده و ما به عنوان نماینده فروش (Reseller) روی زیرساخت آن‌ها تسلط کامل نداریم. این محصولات با قیمت‌های بسیار مناسب و ریالی، صرفاً برای دوست‌داران تکنولوژی  که از پرداخت‌های دلاری محروم هستند و مجبورند با پذیرش ریسک از این اکانت‌ها استفاده کنند، فراهم شده است. هدف من ارائه این خدمات با کمترین قیمت ممکن به شماست.'

const SECTIONS = [
  {
    icon: ShieldAlert,
    title: 'ماهیت اکانت‌های دیجیتال',
    items: [
      'اکانت‌های دیجیتال توسط ارائه‌دهنده ثالث عرضه می‌شوند و ورنت فقط نقش نماینده فروش را دارد.',
      'در صورت تغییر سیاست ارائه‌دهنده، ممکن است دسترسی به اکانت محدود شود؛ در این حالت از طریق پشتیبانی پیگیری می‌کنیم.',
      'سرویس‌های آی‌پی ثابت اختصاصی روی زیرساخت خودمان اجرا می‌شوند و از این قاعده مستثنا هستند.',
    ],
  },
  {
    icon: BadgeCheck,
    title: 'تحویل و فعال‌سازی',
    items: [
      'اکانت‌های دیجیتال بلافاصله پس از تایید پرداخت تحویل داده می‌شوند.',
      'سرویس آی‌پی ثابت با تونل امن OpenVPN (UDP) به‌صورت تقریباً فوری فعال می‌شود.',
      'نام کاربری و رمز عبور OpenVPN به‌صورت خودکار داخل پروفایل تزریق می‌شود.',
    ],
  },
  {
    icon: RefreshCcw,
    title: 'پرداخت و بازگشت وجه',
    items: [
      'تمام قیمت‌ها به تومان و از کیف پول ریالی کسر می‌شوند.',
      'برای اکانت‌های دیجیتال، بازگشت وجه تنها در صورت عدم تحویل یا ایراد فنی تاییدشده انجام می‌شود.',
      'تمدید سرویس آی‌پی ثابت پیش از پایان حجم یا زمان امکان‌پذیر است.',
    ],
  },
] as const

/** Dedicated Terms & Conditions screen linked from the profile and checkout. */
export default function TermsPage() {
  const navigate = useNavigate()
  const { haptic } = useTelegram()

  return (
    <div className="tg-page animate-fade-in space-y-4 pt-5">
      <header className="flex items-start gap-2">
        <button
          type="button"
          aria-label="بازگشت"
          onClick={() => {
            haptic()
            navigate(-1)
          }}
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border border-tg-separator bg-tg-bg text-tg-hint transition-colors hover:text-tg-text"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
        <div className="min-w-0">
          <h1 className="text-[21px] font-bold leading-tight text-tg-text">قوانین و شرایط</h1>
          <p className="mt-0.5 text-[12px] leading-snug text-tg-hint">
            پیش از خرید، لطفاً این شرایط را مطالعه کنید.
          </p>
        </div>
      </header>

      <Card variant="surface" className="space-y-2 border-brand-500/25">
        <div className="flex items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600">
            <FileText className="size-4" aria-hidden />
          </span>
          <p className="text-[13.5px] font-semibold text-tg-text">اطلاعیه مهم</p>
        </div>
        <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-tg-text">
          {TERMS_TEXT}
        </p>
      </Card>

      {SECTIONS.map((section) => {
        const Icon = section.icon
        return (
          <Card key={section.title} variant="surface" className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tg-secondary-bg text-tg-hint">
                <Icon className="size-4" aria-hidden />
              </span>
              <h2 className="text-[13.5px] font-semibold text-tg-text">{section.title}</h2>
            </div>
            <ul className="space-y-1.5 ps-1">
              {section.items.map((item) => (
                <li key={item} className="flex gap-2 text-[12px] leading-relaxed text-tg-hint">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>
        )
      })}

      <p className="px-1 pb-2 text-center text-[11px] leading-relaxed text-tg-hint">
        با تایید پرداخت در مینی‌اپ، این شرایط را می‌پذیرید. نسخه ۱.۰
      </p>
    </div>
  )
}
