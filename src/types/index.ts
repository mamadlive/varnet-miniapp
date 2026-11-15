/**
 * Domain model — the single source of truth for the API contract.
 *
 * These types intentionally mirror the FastAPI (pydantic) schemas that the
 * backend exposes at `VITE_API_BASE_URL`. When the backend changes, update
 * this file first; every service, store and page is typed against it.
 */

/* -------------------------------------------------------------------------- */
/* Shared primitives                                                          */
/* -------------------------------------------------------------------------- */

export type Currency = 'IRT' | 'IRR'

export type UserRole = 'user' | 'admin'

/** Raw Telegram user payload (`WebApp.initDataUnsafe.user`). */
export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
  photo_url?: string
}

export interface User {
  id: string
  telegramId: number
  username?: string
  firstName: string
  lastName?: string
  photoUrl?: string
  role: UserRole
  balance: number
  currency: Currency
  /** Phone-based KYC completed through Telegram's native contact dialog. */
  verified: boolean
  phoneNumber?: string
  verifiedAt?: string
  createdAt: string
}

/* -------------------------------------------------------------------------- */
/* Account marketplace                                                        */
/* -------------------------------------------------------------------------- */

export type ProductCategory = 'streaming' | 'ai' | 'gaming' | 'design' | 'social' | 'other'

export interface AccountProduct {
  id: string
  title: string
  subtitle?: string
  category: ProductCategory
  /** Final customer price (provider base price + profit margin). */
  price: number
  oldPrice?: number
  /** Provider base price before the admin profit margin, when a margin is set. */
  basePrice?: number
  /** Raw price reported by the provider, in `providerCurrency` (USDT on Dantehub). */
  providerPrice?: number
  /** Raw compare-at price reported by the provider. */
  providerOldPrice?: number
  providerCurrency?: string
  /** Base provider price expressed in USDT (derived by the pricing layer). */
  usdPrice?: number
  currency: Currency
  stock: number
  rating?: number
  reviewCount?: number
  badge?: string
  deliveryTime?: string
  description?: string
  /** Upstream description kept verbatim alongside the localized copy. */
  providerDescription?: string
  /** Admin-authored note shown next to the description in the Mini App. */
  adminNote?: string
  features?: string[]
  /** Tailwind gradient classes used by the placeholder artwork. */
  gradient?: string
  /** Emoji used by the placeholder artwork (backend sends image URLs later). */
  emoji?: string
  /** Stable brand identifier resolved by the provider mapper (`netflix`, `chatgpt`, …). */
  brandKey?: string
}

/* -------------------------------------------------------------------------- */
/* Static IP VPN                                                              */
/* -------------------------------------------------------------------------- */

export type VpnServerStatus = 'online' | 'offline' | 'maintenance' | 'degraded' | 'coming_soon'

export interface VpnServer {
  id: string
  name: string
  hostname: string
  ip: string
  country: string
  countryCode: string
  /** e.g. "OpenVPN (UDP)" — provisioned by daloRADIUS/Linux. */
  protocol: string
  status: VpnServerStatus
  /** 0–100 percentage of used capacity. */
  load: number
  activeClients: number
  maxClients: number
  createdAt: string
}

/** Storefront state of a location: purchasable, waiting for capacity, or sold out. */
export type VpnPlanAvailability = 'in_stock' | 'coming_soon' | 'sold_out'

export interface VpnPlan {
  id: string
  name: string
  serverId: string
  location: string
  countryCode: string
  price: number
  currency: Currency
  durationDays: number
  bandwidthMbps?: number
  /** Monthly traffic allowance of the plan, in gigabytes. */
  dataCapGb?: number
  /** Static public IP is the core product — always true for this catalogue. */
  staticIp: boolean
  stock: number
  isActive: boolean
  availability: VpnPlanAvailability
  features: string[]
  pingMs?: number
}

/** A provisioned static-IP subscription shown in «سرویس‌های من». */
export interface ActiveService {
  id: string
  orderId: string
  planName: string
  location: string
  countryCode: string
  ipAddress: string
  protocol: string
  username: string
  /** RADIUS password; revealed on demand for manual OpenVPN clients. */
  password: string
  dataCapGb: number
  usedGb: number
  startedAt: string
  expiresAt: string
  autoRenew: boolean
}

/* -------------------------------------------------------------------------- */
/* Discounts & pricing                                                        */
/* -------------------------------------------------------------------------- */

export type DiscountType = 'percent' | 'fixed'

export interface Coupon {
  id: string
  /** Customer-facing code; stored and matched in uppercase. */
  code: string
  type: DiscountType
  /** Percent (1–100) or a fixed Toman amount. */
  value: number
  minSubtotal?: number
  /** Cap for percent coupons, in Toman. */
  maxDiscount?: number
  active: boolean
  usageLimit?: number
  usedCount: number
  expiresAt?: string
  description?: string
}

/* -------------------------------------------------------------------------- */
/* Orders & wallet                                                            */
/* -------------------------------------------------------------------------- */

export type OrderKind = 'account' | 'vpn'

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'provisioning'
  | 'completed'
  | 'cancelled'
  | 'refunded'

export interface OrderItem {
  productId: string
  title: string
  kind: OrderKind
  quantity: number
  unitPrice: number
}

export interface Order {
  id: string
  userId: string
  userName?: string
  items: OrderItem[]
  total: number
  currency: Currency
  status: OrderStatus
  kind: OrderKind
  createdAt: string
  updatedAt: string
}

export type TransactionType = 'deposit' | 'purchase' | 'refund' | 'withdrawal' | 'bonus'

export type TransactionStatus = 'pending' | 'completed' | 'failed'

export interface Transaction {
  id: string
  type: TransactionType
  amount: number
  currency: Currency
  status: TransactionStatus
  description: string
  createdAt: string
  reference?: string
}

export interface Wallet {
  balance: number
  currency: Currency
  pending: number
  lifetimeSpent: number
}

/** Manual bank-transfer destination configured from the admin settings. */
export interface BankAccountDetails {
  cardNumber: string
  accountHolder: string
  bankName?: string
  updatedAt: string | null
}

/* -------------------------------------------------------------------------- */
/* Support tickets                                                            */
/* -------------------------------------------------------------------------- */

export type SupportTicketCategory = 'technical' | 'billing' | 'order' | 'other'

export type SupportTicketStatus = 'open' | 'answered' | 'closed'

export type TicketAuthor = 'user' | 'support'

export interface TicketMessage {
  id: string
  author: TicketAuthor
  body: string
  createdAt: string
}

export interface SupportTicket {
  id: string
  userId: string
  userName: string
  subject: string
  category: SupportTicketCategory
  status: SupportTicketStatus
  createdAt: string
  updatedAt: string
  messages: TicketMessage[]
}

/* -------------------------------------------------------------------------- */
/* Broadcasts                                                                 */
/* -------------------------------------------------------------------------- */

export type BroadcastAudience = 'all_users' | 'channel'

export interface Broadcast {
  id: string
  message: string
  audience: BroadcastAudience
  recipients: number
  sentAt: string
}

/* -------------------------------------------------------------------------- */
/* Admin analytics                                                            */
/* -------------------------------------------------------------------------- */

export interface AdminStats {
  totalRevenue: number
  revenueChange: number
  activeUsers: number
  usersChange: number
  ordersToday: number
  ordersChange: number
  vpnNodesOnline: number
  vpnNodesTotal: number
}

export interface RevenuePoint {
  label: string
  revenue: number
  orders: number
}

/* -------------------------------------------------------------------------- */
/* HTTP transport helpers                                                     */
/* -------------------------------------------------------------------------- */

export interface ApiEnvelope<T> {
  data: T
  message?: string
  success: boolean
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface PaginationQuery {
  page?: number
  pageSize?: number
  search?: string
}
