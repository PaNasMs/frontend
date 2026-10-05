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
test('delete-array share blocker and removal details are localized as whole messages', async () => {
  registerServerMessages('core', json('../src/i18n/server-messages.json'))
  const shares = 'c05share (/srv/md127/c05share)'
  const blocked =
    'Operation on /dev/md127 has not started. Shared folders on this volume: ' +
    shares +
    '. Select “Also stop sharing folders on this array” in the delete dialog, or remove their shares in Shared folders first.'
  for (const lang of ['ru', 'uk']) {
    const dictionary = json('../src/i18n/locales/' + lang + '.json')
    await i18n.changeLanguage(lang)
    const text = serverText(blocked)
    assert.doesNotMatch(text, /[A-Za-z]{4,} [a-z]{4,}/, lang)
    assert.ok(text.includes('/dev/md127') && text.includes(shares), lang)
    assert.ok(text.includes('«' + dictionary['storage.removeShares'] + '»'), lang)
    assert.equal(
      localizeResponse({ details: ['Sharing will be removed: ' + shares] }).details[0],
      dictionary['server_f419b0e0b2c1'].replace('{{v0}}', shares),
    )
  }
  await i18n.changeLanguage('en')
  assert.equal(serverText(blocked), blocked)
})
test('group review details and the former-array reason are localized', async () => {
  registerServerMessages('core', json('../src/i18n/server-messages.json'))
  const details = [
    'Members to add: bob, carol',
    'Members to remove: alice',
    'Group membership will not change',
    'A new group without members will be created',
  ]
  const reason =
    'The disk holds the metadata of a former array. Wipe it in Partitions and mounts before reuse.'
  for (const lang of ['ru', 'uk']) {
    await i18n.changeLanguage(lang)
    const translated = localizeResponse({ details, raidReason: reason })
    for (const text of [...translated.details, translated.raidReason])
      assert.doesNotMatch(text, /[A-Za-z]{4,} [a-z]{3,}/, lang + ': ' + text)
    assert.ok(translated.details[0].endsWith(': bob, carol'), lang)
    assert.ok(translated.details[1].endsWith(': alice'), lang)
  }
  await i18n.changeLanguage('en')
  assert.deepEqual(localizeResponse({ details }).details, details)
})

test('a complete message nested in a prefixed message is translated, names are not', async () => {
  registerServerMessages('core', json('../src/i18n/server-messages.json'))
  await i18n.changeLanguage('ru')
  const busy =
    "Volume “/srv/md127” is busy: dockerd (PID 1, user root). Close the files or stop the relevant service; if this is a terminal, leave the volume's directory."
  const text = serverText('Operation on /dev/md127 has not started. ' + busy)
  assert.match(text, /^Операция с \/dev\/md127 не начата\. /)
  assert.doesNotMatch(text, /is busy|Close the files/)
  assert.match(text, /dockerd \(PID 1, user root\)/)
  assert.match(text, /\/srv\/md127/)
  await i18n.changeLanguage('en')
})
