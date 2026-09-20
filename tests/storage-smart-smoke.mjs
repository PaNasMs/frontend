import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const directory = process.env.OSTOJAOS_SMOKE_DIR
const { url, token } = JSON.parse(await readFile(`${directory}/connection.json`, 'utf8'))
const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox'],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
await context.addCookies([{ name: 'ostojaos_session', value: token, url, httpOnly: true, sameSite: 'Strict' }])
const original = await (await context.request.get(`${url}/api/v1/preferences`)).json()
try {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${url}/storage`)
  await page.locator('.raid .disk-card').first().waitFor()
  assert.equal(await page.locator('.raid .disk-card').count(), 4)
  assert.equal(await page.getByRole('heading', { name: 'Отдельные накопители' }).count(), 0)
  const single = page.locator('.storage-items>.disk-card')
  assert.equal(await single.count(), 1)
  assert.ok((await single.boundingBox()).width <= 280)
  assert.ok(
    (await page.locator('.raid .disk-card').first().boundingBox()).width < (await single.boundingBox()).width,
  )
  await page.screenshot({ path: `${directory}/storage-compact.png`, fullPage: true })
  const target = page.getByRole('button', { name: 'SMART WD-WXN1A58EJUUC', exact: true })
  await target.click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  assert.equal(await page.locator('.disk-card details').count(), 0)
  await dialog.getByRole('button', { name: 'Принять текущий счётчик CRC', exact: true }).click()
  await page.getByText('SMART: CRC принято', { exact: true }).waitFor()
  await page.reload()
  await page.getByText('SMART: CRC принято', { exact: true }).waitFor()
  await target.click()
  await dialog.getByText(/Новых ошибок: 0/).waitFor()
  await page.screenshot({ path: `${directory}/smart-dialog.png`, fullPage: true })
  const accepted = await (await context.request.get(`${url}/api/v1/preferences`)).json()
  const key = Object.keys(accepted.smartCrcBaselines).find((k) => k.endsWith(':WD-WXN1A58EJUUC'))
  assert.ok(accepted.smartCrcBaselines[key] > 0)
  accepted.smartCrcBaselines[key] -= 1
  const changed = await context.request.put(`${url}/api/v1/preferences`, {
    headers: { Origin: url, 'X-OstojaOS-Request': '1' },
    data: accepted,
  })
  assert.equal(changed.status(), 200)
  await page.reload()
  await page.getByText('SMART: предупреждение', { exact: true }).waitFor()
  await target.click()
  await dialog.getByText(/Новых ошибок: 1/).waitFor()
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  await target.click()
  await dialog.getByRole('button', { name: 'Отменить принятие', exact: true }).click()
  await page.getByText('SMART: предупреждение', { exact: true }).waitFor()
  await dialog.getByRole('button', { name: 'Закрыть SMART' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await target.click()
  await dialog.waitFor()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  const box = await dialog.boundingBox()
  assert.ok(box.x >= 0 && box.x + box.width <= 390)
  await page.screenshot({ path: `${directory}/smart-mobile.png`, fullPage: true })
  assert.deepEqual(errors, [])
  console.log(
    'PASS unified storage, fixed standalone width, compact RAID cards, SMART modal, CRC accept/reload/increase/revoke, mobile',
  )
} finally {
  const restored = await context.request.put(`${url}/api/v1/preferences`, {
    headers: { Origin: url, 'X-OstojaOS-Request': '1' },
    data: original,
  })
  assert.equal(restored.status(), 200)
  await context.request.post(`${url}/api/v1/logout`, { headers: { Origin: url, 'X-OstojaOS-Request': '1' } })
  await browser.close()
}
