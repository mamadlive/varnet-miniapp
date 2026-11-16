import { create } from 'zustand'
import {
  applyAdaptiveTheme,
  applyExplicitTheme,
  getSystemTheme,
  readStoredAdminTheme,
  readStoredMiniAppTheme,
  writeStoredAdminTheme,
  writeStoredMiniAppTheme,
  type AppTheme,
} from '@/lib/theme'
import {
  getTelegramColorScheme,
  isInsideTelegram,
  onTelegramThemeChange,
} from '@/services/telegram'

type ThemeSource = 'telegram' | 'miniapp' | 'admin' | 'system'

interface ThemeState {
  theme: AppTheme
  source: ThemeSource
  initialized: boolean
  /** Boot: Telegram colorScheme inside the client, stored/system preference otherwise. */
  initTheme: () => void
  /** Mini App mount: an explicit Mini App choice wins, then Telegram, then the OS. */
  syncMiniApp: () => void
  /** Admin mount: the admin's saved choice wins, then the OS. */
  syncAdmin: () => void
  setAdminTheme: (theme: AppTheme) => void
  toggleAdminTheme: () => void
  setMiniAppTheme: (theme: AppTheme) => void
  toggleMiniAppTheme: () => void
}

let unsubscribeTelegramTheme: (() => void) | null = null

const initialTheme: AppTheme =
  typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
    ? 'dark'
    : 'light'

/**
 * Single source of truth for the active palette.
 *
 * Every theme change lands on `<html data-theme>`, which the CSS tokens in
 * index.css read. Telegram clients also inject `--tg-theme-*` themselves, so
 * inside the Mini App the attribute mainly keeps `dark:` utilities and
 * `color-scheme` in step with the client.
 */
export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  source: 'system',
  initialized: false,

  initTheme: () => {
    if (get().initialized) return

    if (isInsideTelegram()) {
      const theme = getTelegramColorScheme()
      applyAdaptiveTheme(theme)
      set({ theme, source: 'telegram', initialized: true })

      unsubscribeTelegramTheme?.()
      unsubscribeTelegramTheme = onTelegramThemeChange((scheme) => {
        // An explicit Mini App choice outranks the client: keep its class and
        // inline `!important` tokens authoritative even after the event.
        if (get().source === 'miniapp') {
          applyExplicitTheme(get().theme)
          return
        }
        applyAdaptiveTheme(scheme)
        set({ theme: scheme, source: 'telegram' })
      })
      return
    }

    const stored = readStoredAdminTheme()
    const theme = stored ?? getSystemTheme()
    if (stored) applyExplicitTheme(stored)
    else applyAdaptiveTheme(theme)
    set({ theme, source: stored ? 'admin' : 'system', initialized: true })
  },

  syncMiniApp: () => {
    const stored = readStoredMiniAppTheme()
    if (stored) {
      applyExplicitTheme(stored)
      set({ theme: stored, source: 'miniapp' })
      return
    }
    if (isInsideTelegram()) {
      const theme = getTelegramColorScheme()
      applyAdaptiveTheme(theme)
      set({ theme, source: 'telegram' })
      return
    }
    const theme = getSystemTheme()
    applyAdaptiveTheme(theme)
    set({ theme, source: 'system' })
  },

  syncAdmin: () => {
    const stored = readStoredAdminTheme()
    const theme = stored ?? getSystemTheme()
    if (stored) applyExplicitTheme(stored)
    else applyAdaptiveTheme(theme)
    set({ theme, source: stored ? 'admin' : 'system' })
  },

  setAdminTheme: (theme) => {
    writeStoredAdminTheme(theme)
    applyExplicitTheme(theme)
    set({ theme, source: 'admin' })
  },

  toggleAdminTheme: () => {
    get().setAdminTheme(get().theme === 'dark' ? 'light' : 'dark')
  },

  setMiniAppTheme: (theme) => {
    writeStoredMiniAppTheme(theme)
    applyExplicitTheme(theme)
    set({ theme, source: 'miniapp' })
  },

  toggleMiniAppTheme: () => {
    get().setMiniAppTheme(get().theme === 'dark' ? 'light' : 'dark')
  },
}))
