import { create } from 'zustand'
import {
  applyTheme,
  getSystemTheme,
  readStoredAdminTheme,
  writeStoredAdminTheme,
  type AppTheme,
} from '@/lib/theme'
import {
  getTelegramColorScheme,
  isInsideTelegram,
  onTelegramThemeChange,
} from '@/services/telegram'

type ThemeSource = 'telegram' | 'admin' | 'system'

interface ThemeState {
  theme: AppTheme
  source: ThemeSource
  initialized: boolean
  /** Boot: Telegram colorScheme inside the client, stored/system preference otherwise. */
  initTheme: () => void
  /** Mini App mount: Telegram is authoritative, browser preview follows the OS. */
  syncMiniApp: () => void
  /** Admin mount: the admin's saved choice wins, then the OS. */
  syncAdmin: () => void
  setAdminTheme: (theme: AppTheme) => void
  toggleAdminTheme: () => void
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
      applyTheme(theme)
      set({ theme, source: 'telegram', initialized: true })

      unsubscribeTelegramTheme?.()
      unsubscribeTelegramTheme = onTelegramThemeChange((scheme) => {
        applyTheme(scheme)
        set({ theme: scheme, source: 'telegram' })
      })
      return
    }

    const stored = readStoredAdminTheme()
    const theme = stored ?? getSystemTheme()
    applyTheme(theme)
    set({ theme, source: stored ? 'admin' : 'system', initialized: true })
  },

  syncMiniApp: () => {
    if (isInsideTelegram()) {
      const theme = getTelegramColorScheme()
      applyTheme(theme)
      set({ theme, source: 'telegram' })
      return
    }
    const theme = getSystemTheme()
    applyTheme(theme)
    set({ theme, source: 'system' })
  },

  syncAdmin: () => {
    const stored = readStoredAdminTheme()
    const theme = stored ?? getSystemTheme()
    applyTheme(theme)
    set({ theme, source: stored ? 'admin' : 'system' })
  },

  setAdminTheme: (theme) => {
    writeStoredAdminTheme(theme)
    applyTheme(theme)
    set({ theme, source: 'admin' })
  },

  toggleAdminTheme: () => {
    get().setAdminTheme(get().theme === 'dark' ? 'light' : 'dark')
  },
}))
