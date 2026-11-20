/**
 * Route map for the Linux RADIUS backend (`https://api-var.popserver.shop`).
 *
 * The VPN service is the only live REST backend: plans, provisioning, usage and
 * RADIUS account actions all live under `/v1`. Digital accounts come from a
 * third-party provider through our own Cloudflare Pages Function, so the
 * provider key never reaches the browser.
 */
export const endpoints = {
  auth: {
    /** Exchange Telegram `initData` for a verified D1 user + session token. */
    telegram: '/api/auth/telegram',
    /** Resolve the current session from a Bearer token or `initData`. */
    session: '/api/auth/session',
  },

  /** Same-origin Cloudflare Pages Functions (never the RADIUS host). */
  provider: {
    products: '/api/provider/products',
    /** Persisting sync: fetches the upstream catalogue and upserts it into D1. */
    sync: '/api/sync',
    /** Mini App catalogue read back from D1 (already dictionary-mapped). */
    catalogue: '/api/products',
  },

  /** Customer-side order history (real D1 rows). */
  orders: '/api/orders',
  /** Customer-side support inbox (real D1 tickets + messages). */
  support: '/api/support',
  /** Public card-to-card destination configured by the admin. */
  bank: '/api/bank',

  /** Static-IP storefront backed by D1 `static_ip_nodes` / `orders`. */
  staticIp: {
    /** Enabled nodes only (public). */
    nodes: '/api/static-ip/nodes',
    /** Enabled selling plans joined to enabled nodes (public). */
    plans: '/api/static-ip/plans',
    /** Pending / paid / completed `vpn` orders of the signed-in customer. */
    services: '/api/static-ip/services',
    download: '/api/static-ip/download',
    resend: '/api/static-ip/resend',
  },

  admin: {
    users: '/api/admin/users',
    /** Manual wallet top-up / deduction (admin only). */
    walletAdjust: '/api/admin/wallet/adjust',
    /** Read/save the automatic margin ladder (admin only). */
    margins: '/api/admin/settings/margins',
    /** All D1 orders plus complete/refund actions. */
    orders: '/api/admin/orders',
    orderAction: '/api/admin/orders/action',
    /** Card-to-card claims awaiting review. */
    receipts: '/api/admin/receipts',
    receiptAction: '/api/admin/receipts/action',
    /** Card destination persisted in D1 `settings`. */
    bank: '/api/admin/settings/bank',
    /** Static-IP node catalogue management. */
    staticIpNodes: '/api/admin/static-ip/nodes',
    staticIpNodeAction: '/api/admin/static-ip/nodes/action',
    /** Static-IP selling plan management (full CRUD). */
    staticIpPlans: '/api/admin/static-ip/plans',
    staticIpPlanAction: '/api/admin/static-ip/plans/action',
    /** Suspend / reactivate a completed static-IP service (access, not billing). */
    staticIpServiceAccess: '/api/admin/static-ip/services/access',
    /** Digital-account provider account: wallet balance + purchase history. */
    providerOverview: '/api/admin/provider/overview',
    /** Support inbox shared with the Mini App (real D1 tickets). */
    support: '/api/admin/support',
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
