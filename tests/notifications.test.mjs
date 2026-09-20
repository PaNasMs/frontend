import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTypeScript } from './helpers/typescript.mjs'

// The loader's browser scope has no crypto, as required for HTTP-safe toast IDs.
const { createLocalAlert } = loadTypeScript(new URL('../src/app/notifications.tsx', import.meta.url))
test('local notifications work without secure-context crypto and have distinct IDs', () => {
  const alerts = Array.from({ length: 20 }, () => createLocalAlert('Settings saved'))
  assert.equal(new Set(alerts.map((alert) => alert.id)).size, 20)
  for (const alert of alerts) {
    assert.match(alert.id, /^local:/)
    assert.equal(alert.message, 'Settings saved')
    assert.equal(alert.active, false)
    assert.equal(alert.created, alert.updated)
    assert.ok(Number.isFinite(Date.parse(alert.created)))
  }
})
