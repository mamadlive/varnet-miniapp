import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const path = resolve(root, 'src/lib/providerMapper.ts')
let mapper

before(async () => {
  const source = `${readFileSync(path, 'utf8')}\nexport { tokenIndex, replacePhrases, BRAND_ALIASES, PHRASE_RULES, WORD_RULES };\n`
  const result = await build({ stdin: { contents: source, resolveDir: dirname(path), sourcefile: 'providerMapper.ts', loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' })
  mapper = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
})

function referenceIndex(text, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).exec(text)?.index ?? -1
}

function referenceReplace(raw) {
  let result = raw
  const rules = [
    ...mapper.BRAND_ALIASES.map(({ alias, brand }) => [alias, brand.name]),
    ...mapper.PHRASE_RULES,
    ...mapper.WORD_RULES,
  ]
  for (const [source, target] of rules) {
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const prefix = /^[a-z0-9]/i.test(source) ? '(^|[^a-z0-9])' : ''
    const suffix = /[a-z0-9]$/i.test(source) ? '(?=$|[^a-z0-9])' : ''
    result = result.replace(new RegExp(`${prefix}${escaped}${suffix}`, 'gi'), prefix ? `$1${target}` : target)
  }
  return result.replace(/\s*[,|]\s*/g, ' · ').replace(/^\s*·\s*/, '').replace(/\s*·\s*$/, '').replace(/\s+/g, ' ').trim().replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)])
}

test('literal token search preserves regular-expression boundaries and match indexes', () => {
  const tokens = [...new Set(['', 'pro', 'prem', 'disney+', 'character.ai', ...mapper.BRAND_ALIASES.map(item => item.alias)])]
  const boundaries = ['', 'a', '0', 'A', '_', '-', ' ', 'ا', 'İ', '😀']
  for (const token of tokens) {
    for (const before of boundaries) for (const after of boundaries) {
      const text = `${before}${token}${after}`
      assert.equal(mapper.tokenIndex(text, token), referenceIndex(text, token), JSON.stringify({ text, token }))
    }
  }
  for (const text of ['apro pro', 'x pro plus', 'propro pro', 'x--disney+', 'netflix netflix']) {
    for (const token of ['pro', 'plus', 'netflix', 'disney+']) {
      assert.equal(mapper.tokenIndex(text, token), referenceIndex(text, token), JSON.stringify({ text, token }))
    }
  }
})

test('replacement shortcuts preserve ordered multilingual phrase substitutions', () => {
  const sources = [...mapper.BRAND_ALIASES.map(item => item.alias), ...mapper.PHRASE_RULES.map(item => item[0]), ...mapper.WORD_RULES.map(item => item[0])]
  const texts = [
    '4K ULTRA HD, ultra hd | high quality; no ads ad-free',
    'youtube music youtube premium youtube; adobe photoshop adobe',
    'پروفایل plus پرو premium İ K ſ 😀 Netflix Netflix',
    'P RO premiumPRO PRO premium-plus pro_plus pro/pro',
    'İnstant activation and OFFLINE DOWNLOAD; with warranty, 12 months',
    '', '  , | ', 'İ̇ AΣ ΣA',
  ]
  for (let i = 0; i < sources.length; i += 7) {
    const source = sources[i]
    texts.push(`_${source}_ ${source.toUpperCase()}, ${sources[(i + 37) % sources.length]} 12`)
  }
  for (const text of texts) assert.equal(mapper.replacePhrases(text), referenceReplace(text), JSON.stringify(text))
})
