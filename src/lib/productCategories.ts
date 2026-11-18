import type { ProductCategory } from '../types'

export const PRODUCT_CATEGORIES: readonly ProductCategory[] = [
  'ai', 'design', 'os', 'office', 'security', 'streaming', 'dev', 'social', 'gaming', 'other',
]

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  ai: 'هوش مصنوعی',
  design: 'طراحی',
  os: 'سیستم‌عامل',
  office: 'آفیس و بهره‌وری',
  security: 'امنیت و VPN',
  streaming: 'استریم',
  dev: 'توسعه و برنامه‌نویسی',
  social: 'شبکه‌های اجتماعی',
  gaming: 'گیمینگ',
  other: 'سایر',
}

const CATEGORY_KEYWORDS: ReadonlyArray<readonly [ProductCategory, readonly string[]]> = [
  ['ai', ['claude', 'chatgpt', 'gpt', 'gemini', 'grok', 'perplexity', 'elevenlabs', 'muse ai', 'openart', 'leonardo', 'suno', 'ripple', 'cursor', 'krea ai', 'gamma', 'midjourney', 'copilot', 'wispr flow', 'manus', 'minimax', 'antigravity', 'higgsfield', 'pangram', 'chatprd', 'lovable', 'magic patterns']],
  ['design', ['adobe', 'photoshop', 'illustrator', 'acrobat', 'canva', 'figma', 'framer', 'corel', 'coreldraw', 'capcut', 'alight motion', 'meitu', 'wink', 'xingtu', 'mobbin', 'autodesk']],
  ['os', ['windows', 'win 10', 'win 11', 'windows server']],
  ['office', ['office', 'microsoft 365', 'ms365', 'notion', 'zoom', 'grammarly', 'quizlet', 'coursera', 'udemy', 'granola', 'intercom', 'dropbox', 'google drive']],
  ['security', ['kaspersky', 'nordvpn', 'expressvpn', 'surfshark', 'purevpn', 'proton', 'vpn', 'antivirus']],
  ['streaming', ['netflix', 'spotify', 'youtube', 'amazon prime', 'hbo', 'crunchyroll', 'apple music', 'apple tv', 'tv360', 'brain.fm']],
  ['dev', ['visual studio', 'jetbrains', 'posthog', 'railway', 'resend', 'warp', 'n8n', 'linear', 'api', 'sql']],
  ['social', ['facebook', 'linkedin', 'x premium', 'twitter', 'discord nitro']],
  ['gaming', ['xbox', 'exitlag', 'game', 'steam']],
]

export function classifyProduct(title: string): ProductCategory {
  const name = title.trim().toLowerCase()
  return CATEGORY_KEYWORDS.find(([, keywords]) => keywords.some((keyword) => name.includes(keyword)))?.[0] ?? 'other'
}
