import type { Currency } from '../types'
import { LOCALE } from './i18n'

const CURRENCY_UNITS: Record<Currency, string> = {
  IRT: 'تومان',
  IRR: 'ریال',
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const

/**
 * Locale-aware formatting for the Persian (fa-IR) UI.
 *
 * Prices, balances and counts use Persian digits with comma thousands
 * separators (`۱۲۰,۰۰۰ تومان`); dates and relative times use `Intl`.
 */

/** Convert ASCII digits to Persian digits (leaves other characters intact). */
export function toPersianDigits(value: string): string {
  return value.replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]!)
}

/** Group a number with standard commas, then render it in Persian digits. */
export function formatAmount(value: number, maximumFractionDigits = 0): string {
  const safe = Number.isFinite(value) ? value : 0
  const grouped = new Intl.NumberFormat('en-US', {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(safe)
  return toPersianDigits(grouped)
}

/** Persian unit label for a currency code (`IRT` → «تومان»). */
export function currencyLabel(currency: Currency = 'IRT'): string {
  return CURRENCY_UNITS[currency] ?? CURRENCY_UNITS.IRT
}

/** Format an amount in Toman/Rial, e.g. `۱۲۰,۰۰۰ تومان`. */
export function formatCurrency(amount: number, currency: Currency = 'IRT'): string {
  return `${formatAmount(amount)} ${currencyLabel(currency)}`
}

/** Persian-digit number, compact by default for dashboards (`۱۲٫۵ هزار`). */
export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(LOCALE, {
    notation: 'compact',
    maximumFractionDigits: 1,
    ...options,
  }).format(value)
}

/** Plain number with comma separators — for counts, stock, table cells. */
export function formatCount(value: number): string {
  return formatAmount(value)
}

/** Persian decimal without grouping — e.g. `۸٫۵` for usage meters. */
export function formatDecimal(value: number, maximumFractionDigits = 1): string {
  const safe = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(safe)
}

/** Data allowance label, e.g. `۸٫۵ گیگابایت`. */
export function formatDataSize(gigabytes: number): string {
  return `${formatDecimal(gigabytes)} گیگابایت`
}

/** Card numbers are shown in Persian digits, grouped 4-4-4-4 for readability. */
export function formatCardNumber(value: string): string {
  const digits = normalizeCardNumber(value)
  return toPersianDigits(digits.replace(/(\d{4})(?=\d)/g, '$1 '))
}

/** Normalize Persian/Arabic digits typed into a form back to ASCII. */
export function toEnglishDigits(value: string): string {
  const persian = '۰۱۲۳۴۵۶۷۸۹'
  const arabic = '٠١٢٣٤٥٦٧٨٩'
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const index = persian.indexOf(digit)
    return index >= 0 ? String(index) : String(arabic.indexOf(digit))
  })
}

/** Strip separators and keep the first 16 digits of a bank card number. */
export function normalizeCardNumber(value: string): string {
  return toEnglishDigits(value).replace(/\D/g, '').slice(0, 16)
}

/** Jalali date, e.g. `۲۳ آبان ۱۴۰۵`. */
export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/** Jalali date + time, e.g. `۲۳ آبان، ۱۴:۳۰`. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** Persian relative time, e.g. `۲ ساعت پیش`, `همین حالا`. */
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000)
  const divisions: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.34524, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' },
  ]

  let duration = diffSeconds
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' }).format(
        Math.round(duration),
        division.unit,
      )
    }
    duration /= division.amount
  }
  return formatDate(iso)
}

/** Mask a secret/account credential before showing it in the UI. */
export function maskSecret(value: string, visible = 4): string {
  if (value.length <= visible) return '•'.repeat(value.length)
  return `${'•'.repeat(Math.max(value.length - visible, 4))}${value.slice(-visible)}`
}
