/** Theme primitives shared by the Telegram bridge and the admin toggle. */

export type AppTheme = 'light' | 'dark'

export const ADMIN_THEME_STORAGE_KEY = 'varnet.admin.theme'

const THEME_COLORS: Record<AppTheme, string> = {
  light: '#f1f1f4',
  dark: '#17212b',
}

export function getSystemTheme(): AppTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function readStoredAdminTheme(): AppTheme | null {
  try {
    const value = window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export function writeStoredAdminTheme(theme: AppTheme): void {
  try {
    window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, theme)
  } catch {
    // Private mode / storage disabled — the current session still works.
  }
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
