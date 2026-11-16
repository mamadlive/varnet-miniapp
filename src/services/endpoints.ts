/**
 * Route map for the Linux RADIUS backend (`https://api-var.popserver.shop`).
 *
 * The VPN service is the only live REST backend: plans, provisioning, usage and
 * RADIUS account actions all live under `/v1`. Digital accounts come from a
 * third-party provider through our own Cloudflare Pages Function, so the
 * provider key never reaches the browser.
 */
export const endpoints = {
  /** Same-origin Cloudflare Pages Functions (never the RADIUS host). */
  provider: {
    products: '/api/provider/products',
    /** Persisting sync: fetches the upstream catalogue and upserts it into D1. */
    sync: '/api/sync',
    /** Mini App catalogue read back from D1 (already dictionary-mapped). */
    catalogue: '/api/products',
  },

  admin: {
    users: '/api/admin/users',
    /** Manual wallet top-up / deduction (admin only). */
    walletAdjust: '/api/admin/wallet/adjust',
    /** Read/save the automatic margin ladder (admin only). */
    margins: '/api/admin/settings/margins',
  },

  vpn: {
    root: '/',
    health: '/health',

    status: '/v1/status',
    dbHealth: '/v1/db-health',
    plans: '/v1/plans',

    /** Customer lookup by the Mini App's external ref (telegram_id). */
    customer: (externalRef: string) => `/v1/customers/${encodeURIComponent(externalRef)}`,
    customerDelete: '/v1/customer/delete',

    /** Idempotent provisioning — `order_id` is the idempotency key. */
    provision: '/v1/provision',
    usage: '/v1/usage',

    radius: {
      suspend: '/v1/radius/suspend',
      resume: '/v1/radius/resume',
      delete: '/v1/radius/delete',
    },

    syncPlan: '/v1/sync_plan',
  },
} as const

export type ApiEndpoints = typeof endpoints
