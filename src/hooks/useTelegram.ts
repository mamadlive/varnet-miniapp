import { useCallback, useMemo } from 'react'
import {
  getTelegramColorScheme,
  getTelegramUser,
  hapticImpact,
  hapticNotification,
  hapticSelectionChanged,
  isInsideTelegram,
  isTelegramWebApp,
  openTelegramLink,
  webApp,
  type HapticStyle,
} from '@/services/telegram'

/**
 * React-friendly facade over the Telegram WebApp SDK.
 *
 * Usage:
 *   const { isTelegram, user, haptic, openLink } = useTelegram()
 */
export function useTelegram() {
  const isTelegram = useMemo(() => isInsideTelegram(), [])
  const hasWebApp = useMemo(() => isTelegramWebApp(), [])
  const user = useMemo(() => getTelegramUser(), [])
  const colorScheme = useMemo(() => getTelegramColorScheme(), [])

  const haptic = useCallback((style: HapticStyle = 'light') => hapticImpact(style), [])
  const notify = useCallback(
    (type: 'error' | 'success' | 'warning') => hapticNotification(type),
    [],
  )
  const select = useCallback(() => hapticSelectionChanged(), [])
  const openLink = useCallback((url: string) => openTelegramLink(url), [])

  return { webApp, isTelegram, hasWebApp, user, colorScheme, haptic, notify, select, openLink }
}
