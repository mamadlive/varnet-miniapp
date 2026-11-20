import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  ChevronLeft,
  Info,
  KeyRound,
  Languages,
  LayoutDashboard,
  LifeBuoy,
  Moon,
  ReceiptText,
  ScrollText,
  Send,
  ShieldCheck,
  Star,
  Sun,
  Wallet,
} from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Sheet } from '@/components/ui/Sheet'
import { Switch } from '@/components/ui/Switch'
import { env } from '@/config/env'
import { useTelegram } from '@/hooks/useTelegram'
import { formatCurrency } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { initials } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { useWalletStore } from '@/store/walletStore'

type ProfileSheet = 'language' | 'about'

/** App language shown in the profile menu — the Mini App is Persian-only for now. */
const INTERFACE_LANGUAGE = 'فارسی'
const APP_VERSION = 'v0.1.0'

const MENU_ROW_CLASS =
  'flex min-h-12 w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-tg-secondary-bg active:bg-tg-secondary-bg'

interface MenuRowProps {
  icon: LucideIcon
  label: string
  hint?: string
  to?: string
  onClick?: () => void
}

function MenuRow({ icon: Icon, label, hint, to, onClick }: MenuRowProps) {
  const content = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="flex-1 text-[14.5px] font-medium text-tg-text">{label}</span>
      {hint ? <span className="text-[12px] text-tg-hint">{hint}</span> : null}
      <ChevronLeft className="size-4 shrink-0 text-tg-hint/70" aria-hidden />
    </>
  )

  if (to) {
    return (
      <Link to={to} onClick={onClick} className={MENU_ROW_CLASS}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={MENU_ROW_CLASS}>
      {content}
    </button>
  )
}

function LanguagePanel({ language }: { language: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-tg-separator bg-tg-bg px-3.5 py-3">
        <span className="text-[14px] font-medium text-tg-text">زبان فعلی</span>
        <Badge tone="brand">{language}</Badge>
      </div>
      <p className="text-[12.5px] leading-relaxed text-tg-hint">
        رابط کاربری ورنت در حال حاضر فقط فارسی است. انتخاب دستی زبان — فارسی، English، Русский،
        العربية — در نسخه چندزبانه اضافه می‌شود.
      </p>
    </div>
  )
}

function AboutPanel() {
  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-2 rounded-xl bg-tg-secondary-bg px-4 py-5 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-[20px] font-bold text-white shadow-md shadow-brand-500/25">
          V
        </span>
        <div>
          <p className="text-[16px] font-semibold text-tg-text">{env.appName}</p>
          <p className="text-[12px] text-tg-hint">{env.appTagline}</p>
        </div>
        <p className="text-[11px] font-medium text-tg-hint">
          <span className="bidi-ltr">{APP_VERSION}</span> · نسخه اولیه
        </p>
      </div>
      <p className="text-[12.5px] leading-relaxed text-tg-hint">
        یک مینی‌اپ تلگرام برای خرید اکانت‌های دیجیتال و اجاره آی‌پی ثابت، همراه با پنل مدیریت
        دسکتاپ برای عملیات. حساب کاربری از طریق تلگرام تأیید و در پایگاه‌داده D1 ذخیره می‌شود؛
        پیش‌نمایش مرورگر خارج از تلگرام محدود و نمایشی است.
      </p>
    </div>
  )
}

/** Mini App account screen: Telegram profile, wallet shortcut and app menu. */
export default function ProfilePage() {
  const user = useAuthStore((state) => state.user)
  const isAdmin = useAuthStore((state) => state.isAdmin || state.user?.role === 'admin')
  const balance = useWalletStore((state) => state.balance)
  const currency = useWalletStore((state) => state.currency)
  const loadWallet = useWalletStore((state) => state.loadWallet)

  const { isTelegram, user: telegramUser, haptic } = useTelegram()
  const theme = useThemeStore((state) => state.theme)
  const toggleMiniAppTheme = useThemeStore((state) => state.toggleMiniAppTheme)
  const isDark = theme === 'dark'

  const [sheet, setSheet] = useState<ProfileSheet | null>(null)
  const [avatarFailed, setAvatarFailed] = useState(false)

  useEffect(() => {
    void loadWallet()
  }, [loadWallet])

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'کاربر تلگرام'
  const username = user?.username
  const isPremium = telegramUser?.is_premium === true

  const openSheet = (next: ProfileSheet) => {
    haptic()
    setSheet(next)
  }

  const sheetTitles: Record<ProfileSheet, { title: string; description?: string }> = {
    language: { title: 'زبان', description: 'تنظیمات زبان رابط کاربری.' },
    about: { title: `درباره ${env.appName}`, description: env.appTagline },
  }
  const activeSheet = sheet ? sheetTitles[sheet] : null

  return (
    <div className="tg-page animate-fade-in space-y-4 pt-5">
      <Card variant="surface" className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -end-12 -top-14 size-40 rounded-full bg-brand-500/10 blur-2xl"
        />

        <div className="relative flex items-center gap-4">
          {user?.photoUrl && !avatarFailed ? (
            <img
              src={user.photoUrl}
              alt={fullName}
              onError={() => setAvatarFailed(true)}
              className="size-16 shrink-0 rounded-2xl object-cover"
            />
          ) : (
            <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-[20px] font-bold text-white shadow-md shadow-brand-500/20">
              {initials(fullName)}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[19px] font-semibold text-tg-text">{fullName}</h1>
            <p className="truncate text-[13px] text-tg-hint">
              {username ? (
                <span className="bidi-ltr">@{username}</span>
              ) : (
                'نام کاربری تلگرام ندارید'
              )}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {isAdmin ? (
                <Badge tone="brand" size="sm">
                  <ShieldCheck className="size-3" aria-hidden />
                  {fa.roles.admin}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        {isPremium ? (
          <p className="relative mt-4 flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[12px] font-medium text-amber-600">
            <Star className="size-3.5 shrink-0" aria-hidden />
            عضو تلگرام پریمیوم هستید — ورنت برای شما با بیشترین سرعت اجرا می‌شود.
          </p>
        ) : null}

        {!isTelegram ? (
          <p className="relative mt-3 flex items-center gap-2 text-[11.5px] text-tg-hint">
            <Info className="size-3.5 shrink-0" aria-hidden />
            پیش‌نمایش مرورگر — لرزش لمسی و هماهنگی تم در اینجا محدود است.
          </p>
        ) : null}
      </Card>

      <Link to="/app/wallet" onClick={() => haptic()} className="block">
        <Card variant="surface" interactive className="flex items-center gap-3 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600">
            <Wallet className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold text-tg-hint">موجودی کیف پول</p>
            <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-tg-text">
              {formatCurrency(balance, currency)}
            </p>
          </div>
          <span className="text-[12px] font-medium text-brand-600">{fa.wallet.topUp}</span>
          <ChevronLeft className="size-4 shrink-0 text-tg-hint" aria-hidden />
        </Card>
      </Link>

      <div>
        <p className="tg-section-title">حساب</p>
        <Card variant="surface" padded={false} className="divide-y divide-tg-separator overflow-hidden">
          <MenuRow
            icon={ReceiptText}
            label="سفارش‌های من"
            to="/app/orders"
            onClick={() => haptic()}
          />
          <MenuRow icon={Wallet} label="کیف پول" to="/app/wallet" onClick={() => haptic()} />
          <MenuRow
            icon={KeyRound}
            label="کد تایید ۲۴ (2FA)"
            to="/app/2fa"
            onClick={() => haptic()}
          />
        </Card>
      </div>

      {isAdmin ? (
        <div>
          <p className="tg-section-title">مدیریت</p>
          <Link to="/admin" onClick={() => haptic()} className="block">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-4 text-white shadow-md shadow-brand-500/25 transition-transform active:scale-[0.99]">
              <div
                aria-hidden
                className="pointer-events-none absolute -end-8 -top-10 size-28 rounded-full bg-white/15 blur-xl"
              />
              <div className="relative flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
                  <LayoutDashboard className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold">ورود به پنل مدیریت</p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-white/80">
                    مدیریت کاربران، شارژ کیف پول و تنظیم سود پلکانی
                  </p>
                </div>
                <ChevronLeft className="size-5 shrink-0 text-white/80" aria-hidden />
              </div>
            </div>
          </Link>
        </div>
      ) : null}

      <div>
        <p className="tg-section-title">بیشتر</p>
        <Card variant="surface" padded={false} className="divide-y divide-tg-separator overflow-hidden">
          <MenuRow
            icon={LifeBuoy}
            label="پشتیبانی و تیکت‌ها"
            to="/app/support"
            onClick={() => haptic()}
          />
          <MenuRow
            icon={ScrollText}
            label="قوانین و شرایط"
            to="/app/terms"
            onClick={() => haptic()}
          />
          <MenuRow
            icon={Languages}
            label="زبان"
            hint={INTERFACE_LANGUAGE}
            onClick={() => openSheet('language')}
          />
          <div className={MENU_ROW_CLASS}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
              {isDark ? (
                <Moon className="size-[18px]" aria-hidden />
              ) : (
                <Sun className="size-[18px]" aria-hidden />
              )}
            </span>
            <span className="flex-1 text-[14.5px] font-medium text-tg-text">حالت نمایش</span>
            <span className="text-[12px] text-tg-hint">{isDark ? 'تاریک' : 'روشن'}</span>
            <Switch
              checked={isDark}
              label={isDark ? 'تغییر به حالت روشن' : 'تغییر به حالت تاریک'}
              onCheckedChange={() => {
                haptic()
                toggleMiniAppTheme()
              }}
            />
          </div>
          <MenuRow icon={Info} label="درباره" hint={APP_VERSION} onClick={() => openSheet('about')} />
        </Card>
      </div>

      {!isTelegram ? (
        <Card variant="muted" className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-500">
            <Send className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-tg-text">داخل تلگرام باز کنید</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-tg-hint">
              شما در حال پیش‌نمایش ورنت در مرورگر هستید. برای تجربه کامل — لرزش لمسی، هماهنگی تم و
              جریان پرداخت بومی — مینی‌اپ را داخل تلگرام باز کنید.
            </p>
          </div>
        </Card>
      ) : null}

      <footer className="pb-2 pt-1 text-center">
        <p className="text-[11px] text-tg-hint">
          {env.appName} · <span className="bidi-ltr">{APP_VERSION}</span> · نسخه اولیه
        </p>
      </footer>

      <Sheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={activeSheet?.title}
        description={activeSheet?.description}
        footer={
          <Button variant="secondary" fullWidth onClick={() => setSheet(null)}>
            بستن
          </Button>
        }
      >
        {sheet === 'language' ? <LanguagePanel language={INTERFACE_LANGUAGE} /> : null}
        {sheet === 'about' ? <AboutPanel /> : null}
      </Sheet>
    </div>
  )
}
