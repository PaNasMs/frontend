import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/api/v1/notifications', (route) => route.fulfill({ json: [] }))
  await page.goto((process.env.DIALOG_TEST_URL ?? 'http://127.0.0.1:5173') + '/tests/dialogs.html')
  await page.getByRole('button', { name: 'Open form', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Example settings' })
  await dialog.waitFor()
  assert.equal(await dialog.locator('.close-icon').count(), 1)
  await page.getByRole('textbox', { name: 'Name' }).fill('Changed')
  const before = await dialog.locator('.modal-header').boundingBox()
  await dialog.locator('.modal-body').evaluate((e) => (e.scrollTop = e.scrollHeight))
  assert.equal((await dialog.locator('.modal-header').boundingBox()).y, before.y)
  await dialog.locator('.close-icon').click()
  await page.getByRole('button', { name: 'Keep editing' }).click()
  assert.equal(await page.getByRole('textbox', { name: 'Name' }).inputValue(), 'Changed')
  await dialog.locator('.modal-body').evaluate((e) => (e.scrollTop = 0))
  await dialog.getByRole('button', { name: 'Choose folder', exact: true }).click()
  await page.getByRole('dialog', { name: 'Choose folder' }).waitFor()
  assert.equal(await page.locator('.dialog-overlay:visible').count(), 1)
  assert.equal(await page.locator('[role=dialog]:visible').count(), 1)
  await page.getByRole('dialog', { name: 'Choose folder' }).locator('.close-icon').click()
  await dialog.waitFor()
  assert.equal(await page.getByRole('textbox', { name: 'Name' }).inputValue(), 'Changed')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await page.locator('.waiting-overlay').waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await dialog.isVisible(), true)
  await page.locator('.waiting-overlay').waitFor({ state: 'hidden' })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await expect(page.getByRole('button', { name: 'Open form', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Delete example', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.mouse.click(10, 10)
  assert.equal(await page.getByRole('dialog').count(), 1)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Notify', exact: true }).click()
  const toast = page.locator('.notification-toast'),
    close = toast.locator('.close-icon svg')
  const t = await toast.boundingBox(),
    c = await close.boundingBox()
  assert.ok(Math.abs(c.x + c.width / 2 - (t.x + t.width)) < 2)
  assert.ok(Math.abs(c.y + c.height / 2 - t.y) < 2)
  await toast.locator('.close-icon').click()
  assert.equal(await toast.count(), 0)
  await page.getByRole('button', { name: 'Open manually', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Open manually', exact: true })).toBeFocused()
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 650 })
    await page.getByRole('button', { name: 'Open form', exact: true }).click()
    const d = await dialog.boundingBox(),
      x = await dialog.locator('.close-icon').boundingBox()
    assert.ok(d.x >= 15 && d.x + d.width <= width - 15)
    assert.ok(x.x >= d.x && x.x + x.width <= d.x + d.width)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.keyboard.press('Escape')
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: 'Open form', exact: true }).click()
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'))
  await page.screenshot({ path: '/tmp/panasms-dialog-light.png' })
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
  await page.screenshot({ path: '/tmp/panasms-dialog-dark.png' })
  await page.screenshot({ path: '/tmp/panasms-dialog-check.png' })
  assert.deepEqual(errors, [])
  console.log(
    'PASS modal layout, dirty dismissal, nested replacement, wait recovery, focus return, confirmation safety, toast overlap, responsive widths',
  )
} finally {
  await browser.close()
}
