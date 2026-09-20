import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { translations, loadTypeScript } from './helpers/typescript.mjs'
const { i18n, initializeLanguage, registerTranslations, translator, locale } = translations
const { registerServerMessages, serverText, localizeResponse } = loadTypeScript(
  new URL('../src/i18n/server.ts', import.meta.url),
)
const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const dictionaries = ['../src/i18n/', '../../modules/files/frontend/', '../../modules/terminal/frontend/']
test('default, unsupported language, English fallback and independent namespaces', async () => {
  await initializeLanguage('de')
  assert.equal(i18n.language, 'en')
  assert.equal(locale(), 'en-US')
  registerTranslations('test-module', {
    en: { title: 'Files', missing: 'English fallback', empty: 'Not empty' },
    ru: { title: 'Файлы', empty: '' },
  })
  registerTranslations('other-module', { en: { title: 'Other module' } })
  await i18n.changeLanguage('ru')
  assert.equal(locale(), 'ru-RU')
  assert.equal(translator('test-module')('title'), 'Файлы')
  assert.equal(translator('test-module')('missing'), 'English fallback')
  assert.equal(translator('test-module')('empty'), 'Not empty')
  assert.equal(translator('other-module')('title'), 'Other module')
  await i18n.changeLanguage('uk')
  assert.equal(locale(), 'uk-UA')
  assert.equal(translator('test-module')('title'), 'Files')
  assert.throws(() => registerTranslations('core', { en: {} }), /Invalid/)
})
test('all shipped dictionaries preserve keys and interpolation variables', () => {
  const vars = (value) => [...value.matchAll(/\{\{\s*([^}]+)\s*\}\}/g)].map((m) => m[1]).sort()
  for (const path of dictionaries) {
    const english = json(path + 'locales/en.json')
    for (const [key, value] of Object.entries(english))
      assert.doesNotMatch(value, /[А-Яа-яЁёІіЇїЄє]/u, path + key)
    for (const lang of ['ru', 'uk']) {
      const translated = json(path + 'locales/' + lang + '.json')
      assert.deepEqual(Object.keys(translated).sort(), Object.keys(english).sort(), path + lang)
      for (const key of Object.keys(english)) {
        assert.ok(translated[key].trim(), path + lang + key)
        assert.deepEqual(vars(translated[key]), vars(english[key]), path + lang + key)
      }
    }
    for (const { key } of json(path + 'server-messages.json')) assert.ok(english[key], key)
  }
})
test('server messages and legacy history translate without changing paths, filenames or params', async () => {
  const messages = json('../src/i18n/server-messages.json')
  registerServerMessages('core', messages)
  const source = messages.find((m) => m.en === 'Unsupported interface language')
  assert.ok(source)
  await i18n.changeLanguage('ru')
  assert.equal(serverText(source.en), json('../src/i18n/locales/ru.json')[source.key])
  await i18n.changeLanguage('en')
  assert.equal(serverText(source.ru), source.en)
  registerTranslations('fixture-module', {
    en: { blocked: 'Cannot open {{v0}}' },
    uk: { blocked: 'Не вдалося відкрити {{v0}}' },
  })
  registerServerMessages('fixture-module', [
    { key: 'blocked', en: 'Cannot open {{v0}}', ru: 'Нельзя открыть {{v0}}' },
  ])
  await i18n.changeLanguage('uk')
  const path = '/home/pasha/Отчёт {{name}} <test>.pdf'
  const input = {
    error: `Cannot open ${path}`,
    name: source.en,
    protectedReason: source.en,
    path,
    params: { error: source.en },
    entries: [{ name: source.en }],
    details: [source.en],
  }
  const result = localizeResponse(input)
  assert.equal(result.error, `Не вдалося відкрити ${path}`)
  assert.equal(result.name, source.en)
  assert.equal(result.protectedReason, json('../src/i18n/locales/uk.json')[source.key])
  assert.equal(result.path, path)
  assert.equal(result.params, input.params)
  assert.equal(result.entries, input.entries)
  assert.equal(result.details[0], json('../src/i18n/locales/uk.json')[source.key])
  assert.equal(serverText('Unknown English server message'), 'Unknown English server message')
  assert.equal(input.error, `Cannot open ${path}`)
})
