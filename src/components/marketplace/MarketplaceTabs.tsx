import type { LucideIcon } from 'lucide-react'
import { ShieldCheck, Sparkles } from 'lucide-react'
import { formatCount } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { MarketplaceTab } from '@/components/marketplace/types'

interface TabDefinition {
  id: MarketplaceTab
  label: string
  icon: LucideIcon
}

const TABS: TabDefinition[] = [
  { id: 'accounts', label: fa.marketplace.premiumAccounts, icon: Sparkles },
  { id: 'vpn', label: fa.marketplace.staticIpVpns, icon: ShieldCheck },
]

export interface MarketplaceTabsProps {
  value: MarketplaceTab
  counts: Record<MarketplaceTab, number>
  onChange: (tab: MarketplaceTab) => void
  className?: string
}

/**
 * Segmented control that switches the marketplace between digital accounts and
 * Static IP VPN offers. Uses ARIA tabs semantics so screen readers announce the
 * active panel.
 */
export function MarketplaceTabs({ value, counts, onChange, className }: MarketplaceTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="دسته‌بندی‌های بازارچه"
      className={cn(
        'grid grid-cols-2 gap-1 rounded-2xl border border-tg-separator bg-tg-secondary-bg p-1',
        className,
      )}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon
        const active = tab.id === value

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`marketplace-tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`marketplace-panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex min-h-11 items-center justify-center gap-1 rounded-xl px-1.5 text-[11.5px] font-semibold transition-all duration-200',
              active
                ? 'bg-tg-bg text-tg-text shadow-sm'
                : 'text-tg-hint hover:bg-tg-bg/50 hover:text-tg-text',
            )}
          >
            <Icon
              className={cn('size-3.5 shrink-0', active ? 'text-tg-button' : 'text-tg-hint')}
              aria-hidden
            />
            <span className="whitespace-nowrap">{tab.label}</span>
            <span
              className={cn(
                'inline-flex min-w-4 items-center justify-center rounded-full px-1 py-0.5 text-[9.5px] font-bold tabular-nums',
                active ? 'bg-tg-button/12 text-tg-button' : 'bg-black/[0.05] text-tg-hint',
              )}
            >
              {formatCount(counts[tab.id])}
            </span>
          </button>
        )
      })}
    </div>
  )
}
