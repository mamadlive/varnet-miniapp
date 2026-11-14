/**
 * Typed, validated access to Vite environment variables.
 *
 * Never read `import.meta.env` directly from a component — import `env` from
 * this module instead, so defaults and parsing live in one place.
 */

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export const env = {
  /** Allow the UI to be explored in a desktop browser without Telegram. */
  demoMode: readBoolean(import.meta.env.VITE_DEMO_MODE, true),
  /** Request timeout for the axios instance (ms). */
  apiTimeoutMs: 20_000,
  appName: 'ورنت',
  appTagline: 'اکانت‌های دیجیتال و آی‌پی ثابت',
} as const

export type AppEnv = typeof env
