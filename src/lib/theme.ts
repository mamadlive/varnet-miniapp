/** Theme primitives shared by the Telegram bridge, the Mini App toggle and the admin toggle. */

export type AppTheme = 'light' | 'dark'

export const ADMIN_THEME_STORAGE_KEY = 'varnet.admin.theme'
export const MINIAPP_THEME_STORAGE_KEY = 'varnet.miniapp.theme'

const THEME_COLORS: Record<AppTheme, string> = {
  light: '#f1f1f4',
  dark: '#17212b',
}

/**
 * Full Telegram token palette per explicit choice. Written inline with
 * `!important` so a client that rewrites `--tg-theme-*` on <html> after the
 * user's click still cannot override the manual selection.
 */
const THEME_TOKENS: Record<AppTheme, Record<string, string>> = {
  light: {
    '--tg-theme-bg-color': '#ffffff',
    '--tg-theme-secondary-bg-color': '#f1f1f4',
    '--tg-theme-text-color': '#0f0f0f',
    '--tg-theme-hint-color': '#707579',
    '--tg-theme-link-color': '#2481cc',
    '--tg-theme-button-color': '#2481cc',
    '--tg-theme-button-text-color': '#ffffff',
    '--tg-theme-header-bg-color': '#ffffff',
    '--tg-theme-accent-text-color': '#2481cc',
    '--tg-theme-destructive-text-color': '#e53935',
    '--tg-theme-section-bg-color': '#ffffff',
    '--tg-theme-section-header-text-color': '#2481cc',
    '--tg-theme-subtitle-text-color': '#707579',
    '--tg-theme-section-separator-color': 'rgba(15, 15, 15, 0.08)',
  },
  dark: {
    '--tg-theme-bg-color': '#17212b',
    '--tg-theme-secondary-bg-color': '#232e3c',
    '--tg-theme-text-color': '#f5f5f5',
    '--tg-theme-hint-color': '#708499',
    '--tg-theme-link-color': '#6ab3f3',
    '--tg-theme-button-color': '#5288c1',
    '--tg-theme-button-text-color': '#ffffff',
    '--tg-theme-header-bg-color': '#17212b',
    '--tg-theme-accent-text-color': '#6ab3f3',
    '--tg-theme-destructive-text-color': '#ff453a',
    '--tg-theme-section-bg-color': '#17212b',
    '--tg-theme-section-header-text-color': '#6ab3f3',
    '--tg-theme-subtitle-text-color': '#708499',
    '--tg-theme-section-separator-color': 'rgba(255, 255, 255, 0.08)',
  },
}

const TOKEN_NAMES = new Set([
  ...Object.keys(THEME_TOKENS.light),
  ...Object.keys(THEME_TOKENS.dark),
])

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
let savedClientTokens: Map<string, { value: string; priority: string }> | null = null

export function applyExplicitTheme(theme: AppTheme): void {
  if (typeof document === 'undefined') return
  applyTheme(theme)
  const root = document.documentElement
  root.classList.add('theme-explicit')

  if (!savedClientTokens) {
    savedClientTokens = new Map()
    for (const token of TOKEN_NAMES) {
      savedClientTokens.set(token, {
        value: root.style.getPropertyValue(token),
        priority: root.style.getPropertyPriority(token),
      })
    }
  }

  for (const [token, value] of Object.entries(THEME_TOKENS[theme])) {
    root.style.setProperty(token, value, 'important')
  }
}

/** Apply the client/system palette and hand color authority back to Telegram. */
export function applyAdaptiveTheme(theme: AppTheme): void {
  if (typeof document === 'undefined') return
  applyTheme(theme)
  const root = document.documentElement
  root.classList.remove('theme-explicit')

  if (savedClientTokens) {
    for (const [token, saved] of savedClientTokens) {
      if (saved.value) root.style.setProperty(token, saved.value, saved.priority)
      else root.style.removeProperty(token)
    }
    savedClientTokens = null
  }
}
