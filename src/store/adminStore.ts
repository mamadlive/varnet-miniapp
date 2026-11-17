import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProfitMargin } from '@/lib/pricing'
import { AUTO_MARGIN_TIERS, type AutoMarginTier } from '@/lib/pricing'
import {
  mockAccountProducts,
  mockBroadcasts,
  mockCoupons,
  mockProfitMargins,
  mockSupportTickets,
  TEST_PRODUCT_IDS,
} from '@/services/mocks'
import type {
  AccountProduct,
  BankAccountDetails,
  Broadcast,
  BroadcastAudience,
  Coupon,
  SupportTicket,
  SupportTicketCategory,
  SupportTicketStatus,
  TicketAuthor,
} from '@/types'

export type ProviderKeyId = 'accounts' | 'wallet' | 'vpn'

export interface ProviderCredential {
  value: string
  updatedAt: string | null
}

interface CreateTicketInput {
  subject: string
  category: SupportTicketCategory
  body: string
  userId: string
  userName: string
}

interface BroadcastInput {
  message: string
  audience: BroadcastAudience
  recipients: number
}

interface AdminState {
  coupons: Coupon[]
  /** Catalogue last synced from the provider (seeded with fixtures until then). */
  products: AccountProduct[]
  /** Provider base price → customer price markups, keyed by product id. */
  margins: Record<string, ProfitMargin>
  /** Automatic ladder loaded from D1 `settings`; edits are saved server-side. */
  marginTiers: AutoMarginTier[]
  /** Admin USDT→Toman rate; `0` keeps the server-side `USDT_RATE_TOMAN`. */
  usdtRateToman: number
  /** Rate last reported by the proxy, used when no admin override is set. */
  serverUsdtRateToman: number
  /** Free-form admin notes per product, shown beside the provider copy. */
  productNotes: Record<string, string>
  /** Products removed from the Mini App storefront (still visible to admin). */
  hiddenProductIds: string[]
  /** Ids purged by the admin; a provider re-sync must not resurrect them. */
  deletedProductIds: string[]
  /** Manual bank-transfer destination shown to customers in «افزایش موجودی». */
  bankDetails: BankAccountDetails
  /** Shared inbox — the Mini App opens tickets, the admin panel answers them. */
  tickets: SupportTicket[]
  broadcasts: Broadcast[]
  /**
   * Mock-only credential vault. Real provider keys must live server-side
   * behind the Cloudflare proxy — these never leave the browser.
   */
  providerKeys: Record<ProviderKeyId, ProviderCredential>
  saveCoupon: (coupon: Coupon) => void
  toggleCoupon: (id: string) => void
  removeCoupon: (id: string) => void
  setProducts: (products: AccountProduct[]) => void
  setMargin: (productId: string, margin: ProfitMargin | null) => void
  /** Replaces the automatic ladder (already persisted via the admin API). */
  setMarginTiers: (tiers: AutoMarginTier[]) => void
  /** `0` clears the override so the server-side `USDT_RATE_TOMAN` is used again. */
  setUsdtRateToman: (rate: number) => void
  setServerUsdtRateToman: (rate: number) => void
  setProductNote: (productId: string, note: string) => void
  toggleProductHidden: (productId: string) => void
  /** Removes a product and its margin/note/visibility overrides for good. */
  deleteProduct: (productId: string) => void
  /** Purges every built-in fixture product at once. */
  deleteTestProducts: () => void
  saveBankDetails: (details: Omit<BankAccountDetails, 'updatedAt'>) => void
  createTicket: (input: CreateTicketInput) => SupportTicket
  replyToTicket: (id: string, body: string, author: TicketAuthor) => void
  setTicketStatus: (id: string, status: SupportTicketStatus) => void
  sendBroadcast: (input: BroadcastInput) => Broadcast
  saveProviderKey: (id: ProviderKeyId, value: string) => void
  clearProviderKey: (id: ProviderKeyId) => void
}

const EMPTY_CREDENTIAL: ProviderCredential = { value: '', updatedAt: null }

/** Keeps the tier ladder working before the first sync reports the live rate. */
const DEFAULT_SERVER_USDT_RATE_TOMAN = 70_000

type PurgeableState = Pick<
  AdminState,
  'products' | 'margins' | 'productNotes' | 'hiddenProductIds' | 'deletedProductIds'
>

function purgeProducts(state: PurgeableState, ids: string[]): Partial<AdminState> {
  if (ids.length === 0) return {}
  const removing = new Set(ids)
  const without = <T,>(record: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(record).filter(([id]) => !removing.has(id)))
  return {
    products: state.products.filter((product) => !removing.has(product.id)),
    margins: without(state.margins),
    productNotes: without(state.productNotes),
    hiddenProductIds: state.hiddenProductIds.filter((id) => !removing.has(id)),
    deletedProductIds: [
      ...state.deletedProductIds,
      ...ids.filter((id) => !state.deletedProductIds.includes(id)),
    ],
  }
}

export const useAdminStore = create<AdminState>()(
  persist(
    (set) => ({
      coupons: mockCoupons,
      products: mockAccountProducts,
      margins: mockProfitMargins,
      marginTiers: AUTO_MARGIN_TIERS,
      usdtRateToman: 0,
      serverUsdtRateToman: DEFAULT_SERVER_USDT_RATE_TOMAN,
      productNotes: {},
      hiddenProductIds: [],
      deletedProductIds: [],
      bankDetails: { cardNumber: '', accountHolder: '', bankName: '', updatedAt: null },
      tickets: mockSupportTickets,
      broadcasts: mockBroadcasts,
      providerKeys: {
        accounts: EMPTY_CREDENTIAL,
        wallet: EMPTY_CREDENTIAL,
        vpn: EMPTY_CREDENTIAL,
      },

      saveCoupon: (coupon) => {
        const normalized: Coupon = { ...coupon, code: coupon.code.trim().toUpperCase() }
        set((state) => {
          const exists = state.coupons.some((item) => item.id === normalized.id)
          return {
            coupons: exists
              ? state.coupons.map((item) => (item.id === normalized.id ? normalized : item))
              : [normalized, ...state.coupons],
          }
        })
      },

      toggleCoupon: (id) => {
        set((state) => ({
          coupons: state.coupons.map((coupon) =>
            coupon.id === id ? { ...coupon, active: !coupon.active } : coupon,
          ),
        }))
      },

      removeCoupon: (id) => {
        set((state) => ({ coupons: state.coupons.filter((coupon) => coupon.id !== id) }))
      },

      setProducts: (products) => {
        set({ products })
      },

      setMargin: (productId, margin) => {
        set((state) => {
          const margins = { ...state.margins }
          if (margin && margin.value > 0) margins[productId] = margin
          else delete margins[productId]
          return { margins }
        })
      },

      setMarginTiers: (tiers) => {
        if (tiers.length === 0) return
        set({ marginTiers: tiers })
      },

      setUsdtRateToman: (rate) => {
        set({ usdtRateToman: Number.isFinite(rate) && rate > 0 ? Math.round(rate) : 0 })
      },

      setServerUsdtRateToman: (rate) => {
        if (!Number.isFinite(rate) || rate <= 0) return
        set({ serverUsdtRateToman: Math.round(rate) })
      },

      setProductNote: (productId, note) => {
        const trimmed = note.trim()
        set((state) => {
          const productNotes = { ...state.productNotes }
          if (trimmed) productNotes[productId] = trimmed
          else delete productNotes[productId]
          return { productNotes }
        })
      },

      toggleProductHidden: (productId) => {
        set((state) => ({
          hiddenProductIds: state.hiddenProductIds.includes(productId)
            ? state.hiddenProductIds.filter((id) => id !== productId)
            : [...state.hiddenProductIds, productId],
        }))
      },

      deleteProduct: (productId) => {
        set((state) => purgeProducts(state, [productId]))
      },

      deleteTestProducts: () => {
        set((state) => purgeProducts(state, TEST_PRODUCT_IDS))
      },

      saveBankDetails: (details) => {
        set({ bankDetails: { ...details, updatedAt: new Date().toISOString() } })
      },

      createTicket: (input) => {
        const now = new Date().toISOString()
        const ticket: SupportTicket = {
          id: `tkt_${Date.now().toString(36)}`,
          userId: input.userId,
          userName: input.userName,
          subject: input.subject.trim(),
          category: input.category,
          status: 'open',
          createdAt: now,
          updatedAt: now,
          messages: [
            {
              id: `msg_${Date.now().toString(36)}`,
              author: 'user',
              body: input.body.trim(),
              createdAt: now,
            },
          ],
        }
        set((state) => ({ tickets: [ticket, ...state.tickets] }))
        return ticket
      },

      replyToTicket: (id, body, author) => {
        const trimmed = body.trim()
        if (!trimmed) return
        const now = new Date().toISOString()
        set((state) => ({
          tickets: state.tickets.map((ticket) =>
            ticket.id === id
              ? {
                  ...ticket,
                  status: author === 'support' ? 'answered' : 'open',
                  updatedAt: now,
                  messages: [
                    ...ticket.messages,
                    {
                      id: `msg_${Date.now().toString(36)}_${ticket.messages.length}`,
                      author,
                      body: trimmed,
                      createdAt: now,
                    },
                  ],
                }
              : ticket,
          ),
        }))
      },

      setTicketStatus: (id, status) => {
        set((state) => ({
          tickets: state.tickets.map((ticket) =>
            ticket.id === id
              ? { ...ticket, status, updatedAt: new Date().toISOString() }
              : ticket,
          ),
        }))
      },

      sendBroadcast: (input) => {
        const broadcast: Broadcast = {
          id: `bcast_${Date.now().toString(36)}`,
          message: input.message.trim(),
          audience: input.audience,
          recipients: input.recipients,
          sentAt: new Date().toISOString(),
        }
        set((state) => ({ broadcasts: [broadcast, ...state.broadcasts] }))
        return broadcast
      },

      saveProviderKey: (id, value) => {
        set((state) => ({
          providerKeys: {
            ...state.providerKeys,
            [id]: { value: value.trim(), updatedAt: new Date().toISOString() },
          },
        }))
      },

      clearProviderKey: (id) => {
        set((state) => ({
          providerKeys: { ...state.providerKeys, [id]: EMPTY_CREDENTIAL },
        }))
      },
    }),
    {
      name: 'varnet.admin.state',
      version: 1,
      // Credentials stay out of localStorage on purpose; coupons, pricing,
      // bank details and support state survive a refresh so the demo feels
      // like a real admin panel.
      partialize: (state) => ({
        coupons: state.coupons,
        products: state.products,
        margins: state.margins,
        marginTiers: state.marginTiers,
        usdtRateToman: state.usdtRateToman,
        serverUsdtRateToman: state.serverUsdtRateToman,
        productNotes: state.productNotes,
        hiddenProductIds: state.hiddenProductIds,
        deletedProductIds: state.deletedProductIds,
        bankDetails: state.bankDetails,
        tickets: state.tickets,
        broadcasts: state.broadcasts,
      }),
    },
  ),
)
