import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notificationCatalog } from '../scripts/notification-catalog.mjs'

test('notification catalog names every task in all interface languages', () => {
  const { actions, messages } = notificationCatalog()
  assert.ok(Object.keys(actions).length >= 100)
  assert.deepEqual(actions['file.copy'], { en: 'Copy', ru: 'Копировать', uk: 'Копіювати' })
  // The task list wording wins over the form label.
  assert.equal(actions['module.install'].ru, 'Установка модуля')
  for (const [action, names] of Object.entries(actions))
    for (const lang of ['en', 'ru', 'uk']) assert.ok(names[lang], `${action} ${lang}`)
  assert.ok(messages.length > 500)
  for (const message of messages) {
    assert.ok(message.source.length && message.en && message.ru && message.uk, JSON.stringify(message))
    for (const lang of ['ru', 'uk'])
      assert.deepEqual(
        [...message[lang].matchAll(/\{\{v\d+\}\}/g)].map((m) => m[0]).sort(),
        [...message.source[0].matchAll(/\{\{v\d+\}\}/g)].map((m) => m[0]).sort(),
        message.source[0],
      )
  }
})
