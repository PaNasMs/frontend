// Builds the translations that the core reuses for delivered notifications
// (Telegram, email, push): task names from the operations table and localized
// server messages. The core reads the result from the installed UI assets.
import { readFileSync } from 'node:fs'

const languages = ['en', 'ru', 'uk']
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

export function notificationCatalog() {
  const locales = Object.fromEntries(
    languages.map((lang) => [lang, JSON.parse(read(`../src/i18n/locales/${lang}.json`))]),
  )
  const translate = (key) => {
    const names = {}
    for (const lang of languages) {
      const text = locales[lang][key] ?? locales.en[key]
      if (typeof text !== 'string') throw Error(`Missing translation for ${key}`)
      names[lang] = text
    }
    return names
  }
  const source = read('../src/app/operations.tsx')
  const start = source.indexOf('export const operations')
  const table = source.slice(start, source.indexOf('\n}\n', start))
  const actions = {}
  for (const [, action, key] of table.matchAll(/^ {2}'([a-z0-9.-]+)': \{\s*label: tr\('([^']+)'\)/gm))
    actions[action] = translate(key)
  // The task list names some jobs differently from their forms; notifications follow the task list.
  const overrides = source.slice(source.lastIndexOf('{', source.indexOf("'module.install': tr(")))
  for (const [, action, key] of overrides
    .slice(0, overrides.indexOf('}'))
    .matchAll(/'([a-z0-9.-]+)': tr\('([^']+)'\)/g))
    actions[action] = translate(key)
  const messages = JSON.parse(read('../src/i18n/server-messages.json')).map((message) => {
    // Server text is matched against the catalog source (English, or Russian in old history).
    const entry = { source: [message.en, message.ru].filter(Boolean) }
    for (const lang of languages) entry[lang] = locales[lang][message.key] ?? message[lang] ?? message.en
    return entry
  })
  return { actions, messages }
}
