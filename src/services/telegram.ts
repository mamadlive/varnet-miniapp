import type { TelegramUser } from '@/types'

/**
 * Defensive wrapper around `window.Telegram.WebApp`.
 *
 * The official `telegram-web-app.js` (loaded in `index.html`) defines the
 * object before the bundle runs; outside Telegram a minimal shim does. We read
 * it straight from `window` instead of importing `@twa-dev/sdk`, because the
 * SDK's CJS default export arrives wrapped (`{ default: WebApp }`) under
 * Vite's dev interop — leaving `initData` undefined and silently forcing the
 * demo session. Every method call goes through `invoke()` so the UI never
 * crashes on older clients or the browser shim.
 */

type UnknownRecord = Record<string, unknown>

interface TelegramWebAppUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
  photo_url?: string
}

export interface TelegramWebAppLike {
  initData: string
  initDataUnsafe?: { user?: TelegramWebAppUser }
  colorScheme?: string
  [key: string]: unknown
}

function resolveWebApp(): TelegramWebAppLike | null {
  if (typeof window === 'undefined') return null
  const telegram = (window as unknown as { Telegram?: { WebApp?: unknown } }).Telegram
  return (telegram?.WebApp as TelegramWebAppLike | undefined) ?? null
}

function invoke(target: unknown, method: string, ...args: unknown[]): void {
  const candidate = (target as UnknownRecord | null | undefined)?.[method]
  if (typeof candidate === 'function') {
    try {
      ;(candidate as (...callArgs: unknown[]) => unknown).apply(target, args)
    } catch {
      // Method exists but the current Telegram client does not support it.
    }
  }
}

/** The live Telegram WebApp object (`null` outside a browser). */
export const webApp = resolveWebApp()

/** Is the Telegram Web App script present at all? */
export function isTelegramWebApp(): boolean {
  if (typeof window === 'undefined') return false
  const telegram = (window as unknown as { Telegram?: { WebApp?: unknown } }).Telegram
  return Boolean(telegram?.WebApp)
}

/** Are we actually running *inside* a Telegram client (not a browser preview)? */
export function isInsideTelegram(): boolean {
  if (!isTelegramWebApp()) return false
  return Boolean(webApp?.initData) || Boolean(webApp?.initDataUnsafe?.user)
}

/** Raw `initData` string — send it to the backend to authenticate the user. */
export function getTelegramInitData(): string {
  return webApp?.initData ?? ''
}

/** Normalised Telegram user (null in a browser preview). */
export function getTelegramUser(): TelegramUser | null {
  const user = webApp?.initDataUnsafe?.user
  if (!user || typeof user.id !== 'number') return null
  return {
    id: user.id,
    first_name: user.first_name || 'کاربر تلگرام',
    last_name: user.last_name,
    username: user.username,
    language_code: user.language_code,
    is_premium: user.is_premium,
    photo_url: user.photo_url,
  }
}

export function getTelegramColorScheme(): 'light' | 'dark' {
  return webApp?.colorScheme === 'dark' ? 'dark' : 'light'
}

/**
 * Subscribe to the user switching their Telegram theme while the Mini App is
 * open. Returns an unsubscribe function; a no-op outside Telegram.
 */
export function onTelegramThemeChange(handler: (scheme: 'light' | 'dark') => void): () => void {
  const app = webApp as unknown as {
    onEvent?: (event: string, callback: () => void) => void
    offEvent?: (event: string, callback: () => void) => void
  }
  if (typeof app?.onEvent !== 'function') return () => {}

  const listener = () => handler(getTelegramColorScheme())
  try {
    app.onEvent('themeChanged', listener)
  } catch {
    return () => {}
  }

  return () => {
    try {
      app.offEvent?.('themeChanged', listener)
    } catch {
      // Older clients have no offEvent — the listener is harmless.
    }
  }
}

export interface ContactRequestResult {
  status: 'sent' | 'cancelled' | 'unsupported'
  phoneNumber?: string
}

/**
 * Ask the user to share their phone number through Telegram's native contact
 * dialog (`WebApp.requestContact`, Bot API 6.9+). Resolves `unsupported`
 * outside Telegram or on old clients; never throws.
 */
export function requestPhoneNumber(timeoutMs = 120_000): Promise<ContactRequestResult> {
  return new Promise((resolve) => {
    const app = webApp as unknown as {
      requestContact?: (
        callback: (shared: boolean, data?: { contact?: { phone_number?: string } }) => void,
      ) => void
    }

    if (typeof app?.requestContact !== 'function') {
      resolve({ status: 'unsupported' })
      return
    }

    let settled = false
    let timer: number | undefined
    const finish = (result: ContactRequestResult) => {
      if (settled) return
      settled = true
      if (timer !== undefined) window.clearTimeout(timer)
      resolve(result)
    }

    timer = window.setTimeout(() => finish({ status: 'cancelled' }), timeoutMs)

    try {
      app.requestContact((shared, data) => {
        if (!shared) {
          finish({ status: 'cancelled' })
          return
        }
        const phoneNumber = data?.contact?.phone_number?.replace(/\s+/g, ' ').trim()
        finish({ status: 'sent', phoneNumber: phoneNumber || undefined })
      })
    } catch {
      finish({ status: 'unsupported' })
    }
  })
}

/**
 * Boot the Mini App: tell Telegram the UI is ready, force full height, theme
 * the native header and stop vertical swipe-to-close on inner scroll areas.
 */
export function initTelegram(): void {
  if (!isTelegramWebApp()) return

  invoke(webApp, 'ready')
  invoke(webApp, 'expand')
  invoke(webApp, 'disableVerticalSwipes')
  invoke(webApp, 'setHeaderColor', 'secondary_bg_color')
  invoke(webApp, 'setBackgroundColor', 'secondary_bg_color')

  try {
    const scheme = getTelegramColorScheme()
    document.documentElement.style.colorScheme = scheme
    document.documentElement.dataset.tgColorScheme = scheme
  } catch {
    // Non-fatal: theme CSS still works through the --tg-theme-* variables.
  }
}

export function closeMiniApp(): void {
  invoke(webApp, 'close')
}

export function openTelegramLink(url: string): void {
  const app = webApp as unknown as { openTelegramLink?: (href: string) => void }
  if (typeof app.openTelegramLink === 'function') {
    invoke(app, 'openTelegramLink', url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'

export function hapticImpact(style: HapticStyle = 'light'): void {
  const feedback = (webApp as unknown as { HapticFeedback?: { impactOccurred?: unknown } })?.HapticFeedback
  invoke(feedback, 'impactOccurred', style)
}

export function hapticNotification(type: 'error' | 'success' | 'warning'): void {
  const feedback = (webApp as unknown as { HapticFeedback?: { notificationOccurred?: unknown } })?.HapticFeedback
  invoke(feedback, 'notificationOccurred', type)
}

export function hapticSelectionChanged(): void {
  const feedback = (webApp as unknown as { HapticFeedback?: { selectionChanged?: unknown } })?.HapticFeedback
  invoke(feedback, 'selectionChanged')
}
