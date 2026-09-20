import { i18n, translator } from './index'
export type ServerMessage = { key: string; en: string; ru?: string }
type Pattern = { namespace: string; key: string; pattern: RegExp; variables: string[] }
const exact = new Map<string, { namespace: string; key: string }>()
const patterns: Pattern[] = []
const cache = new Map<string, string>()
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function registerServerMessages(namespace: string, messages: ServerMessage[]) {
  for (const message of messages) {
    for (const source of new Set([message.en, message.ru].filter((value): value is string => !!value))) {
      const variables = [...source.matchAll(/\{\{(v\d+)\}\}/g)].map((match) => match[1])
      if (!variables.length) exact.set(source, { namespace, key: message.key })
      else {
        const chunks = source.split(/\{\{v\d+\}\}/g)
        if (chunks.every((chunk) => !chunk.trim())) continue
        patterns.push({
          namespace,
          key: message.key,
          variables,
          pattern: new RegExp('^' + chunks.map(escape).join('([\\s\\S]*?)') + '$'),
        })
      }
    }
  }
  patterns.sort((a, b) => b.pattern.source.length - a.pattern.source.length)
  cache.clear()
}
// API messages are English. Russian aliases also cover history saved before localization.
// Only message fields use this adapter; filenames, paths, IDs and command output remain untouched.
export function serverText(value: string): string {
  const cacheKey = i18n.language + ':' + value
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached
  const item = exact.get(value)
  let translated = item ? translator(item.namespace)(item.key) : value
  if (!item && value.length <= 8192) {
    for (const entry of patterns) {
      const match = value.match(entry.pattern)
      if (!match) continue
      translated = translator(entry.namespace)(
        entry.key,
        Object.fromEntries(entry.variables.map((key, index) => [key, match[index + 1]])),
      )
      break
    }
  }
  if (cache.size >= 1024) cache.clear()
  cache.set(cacheKey, translated)
  return translated
}
const messageFields = new Set([
  'error',
  'message',
  'stage',
  'reason',
  'protectedReason',
  'busyReason',
  'raidReason',
  'warnings',
])
const untouched = new Set(['entries', 'translations', 'params', 'files', 'keys'])
export function localizeResponse<T>(value: T): T {
  function visit(item: unknown, field = ''): unknown {
    if (typeof item === 'string')
      return messageFields.has(field) || field === 'details' ? serverText(item) : item
    if (Array.isArray(item)) return item.map((child) => visit(child, field))
    if (!item || typeof item !== 'object') return item
    return Object.fromEntries(
      Object.entries(item).map(([key, child]) => [key, untouched.has(key) ? child : visit(child, key)]),
    )
  }
  return visit(value) as T
}
