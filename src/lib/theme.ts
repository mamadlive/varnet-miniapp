/** Theme primitives shared by the Telegram bridge, the Mini App toggle and the admin toggle. */

export type AppTheme = 'light' | 'dark'

export const ADMIN_THEME_STORAGE_KEY = 'varnet.admin.theme'
export const MINIAPP_THEME_STORAGE_KEY = 'varnet.miniapp.theme'

const THEME_COLORS: Record<AppTheme, string> = {
  light: '#f1f1f4',
  dark: '#17212b',
}

export function getSystemTheme(): AppTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStoredTheme(key: string): AppTheme | null {
  try {
    const value = window.localStorage.getItem(key)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function writeStoredTheme(key: string, theme: AppTheme): void {
  try {
    window.localStorage.setItem(key, theme)
  } catch {
    // Private mode / storage disabled — the current session still works.
  }
}

export function readStoredAdminTheme(): AppTheme | null {
  return readStoredTheme(ADMIN_THEME_STORAGE_KEY)
}

export function writeStoredAdminTheme(theme: AppTheme): void {
  writeStoredTheme(ADMIN_THEME_STORAGE_KEY, theme)
}

/** Explicit Mini App choice; it outranks the Telegram client's color scheme. */
export function readStoredMiniAppTheme(): AppTheme | null {
  return readStoredTheme(MINIAPP_THEME_STORAGE_KEY)
}

export function writeStoredMiniAppTheme(theme: AppTheme): void {
  writeStoredTheme(MINIAPP_THEME_STORAGE_KEY, theme)
}

/** Apply a palette to <html>; every `tg-*` token and `dark:` utility follows. */
export function applyTheme(theme: AppTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[theme])
}

/**
 * Apply a palette the user picked by hand. The `theme-explicit` class makes the
 * stylesheet tokens `!important`, so the Telegram client's inline
 * `--tg-theme-*` values can no longer overwrite the choice.
 */
export function applyExplicitTheme(theme: AppTheme): void {
  if (typeof document === 'undefined') return
  applyTheme(theme)
  document.documentElement.classList.add('theme-explicit')
}

/** Apply the client/system palette and hand color authority back to Telegram. */
export function applyAdaptiveTheme(theme: AppTheme): void {
  if (typeof document === 'undefined') return
  applyTheme(theme)
  document.documentElement.classList.remove('theme-explicit')
}
