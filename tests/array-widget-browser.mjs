import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox'],
})
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/api/v1/**', (route) => route.fulfill({ status: 503, json: { error: 'offline' } }))
  await page.goto((process.env.ARRAY_TEST_URL ?? 'http://127.0.0.1:5173') + '/tests/array-widget.html')
  const members = page.locator('.widget-array-members > span')
  await members.first().waitFor()
  const read = () =>
    members.evaluateAll((nodes) =>
      nodes.map((n) => ({ tone: n.className, value: n.querySelector('b').textContent, note: n.title })),
    )
  let m = await read()
  // A live reading keeps its tone; stale and asleep readings are muted and say why; no reading is a dash.
  assert.deepEqual(
    m.map((x) => [x.tone, x.value]),
    [
      ['tone-good', '35°'],
      ['tone-muted', '52°'],
      ['tone-muted', '38°'],
      ['tone-muted', '—'],
    ],
  )
  assert.equal(m[0].note, '')
  assert.ok(m[1].note.length > 0 && m[2].note.length > 0 && m[1].note !== m[2].note)
  assert.equal(await page.locator('.widget-array-note').count(), 1)
  await page.getByRole('button', { name: 'Telemetry unavailable' }).click()
  m = await read()
  // When telemetry is unavailable no cached value may look current.
  assert.ok(m.every((x) => x.tone === 'tone-muted'))
  assert.ok(m.slice(0, 3).every((x) => x.note.length > 0))
  assert.deepEqual(errors, [])
  console.log('PASS array widget: live, stale, asleep, missing and unavailable telemetry')
} finally {
  await browser.close()
}
