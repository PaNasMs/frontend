import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  let state = {
      config: { enabled: false, gpio: 25 },
      supported: true,
      activeGPIO: null,
      rebootRequired: false,
    },
    failSave = false,
    failRead = false,
    role = 'admin',
    saves = []
  await page.route('**/api/v1/session', (r) => r.fulfill({ json: { role } }))
  await page.route('**/api/v1/notifications', (r) => r.fulfill({ json: [] }))
  await page.route('**/api/v1/power-control', async (r) => {
    if (r.request().method() === 'PUT') {
      const body = r.request().postDataJSON()
      saves.push(body)
      if (failSave) return r.fulfill({ status: 503, json: { error: 'GPIO25 is assigned to cooling' } })
      state = { ...state, config: body, rebootRequired: true }
    } else if (failRead) return r.fulfill({ status: 503, json: { error: 'Connection unavailable' } })
    return r.fulfill({ json: state })
  })
  const url = (process.env.POWER_TEST_URL ?? 'http://127.0.0.1:5173') + '/tests/power-control.html'
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'Power control' })).toBeVisible()
  const apply = page.getByRole('button', { name: 'Apply', exact: true })
  const enabled = page.getByRole('checkbox')
  const select = page.getByLabel('Power board GPIO')
  await expect(select).toHaveValue('25')
  await expect(apply).toBeDisabled()
  assert.match(await select.locator('option:checked').innerText(), /22/)
  await enabled.check()
  assert.equal(saves.length, 0)
  await page.getByRole('link', { name: 'Leave settings' }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(enabled).toBeChecked()
  failSave = true
  await apply.click()
  await expect(page.getByText('GPIO25 is assigned to cooling')).toBeVisible()
  await expect(enabled).toBeChecked()
  failSave = false
  await apply.click()
  await expect(apply).toBeDisabled()
  assert.deepEqual(saves.at(-1), { enabled: true, gpio: 25 })
  await expect(page.getByText(/Restart the NAS to apply/)).toBeVisible()
  state = { ...state, activeGPIO: 25, rebootRequired: false }
  await page.reload()
  await expect(page.getByText('Active: GPIO25 · physical pin 22')).toBeVisible()
  await select.focus()
  await select.press('ArrowDown')
  await expect(select).toHaveValue('26')
  state = { ...state, config: { enabled: true, gpio: 24 } }
  await expect(page.getByRole('button', { name: 'Reload settings' })).toBeVisible({ timeout: 10000 })
  await expect(apply).toBeDisabled()
  await page.getByRole('button', { name: 'Reload settings' }).click()
  await expect(select).toHaveValue('24')
  failRead = true
  await page.reload()
  await expect(page.getByText('Connection unavailable')).toBeVisible()
  failRead = false
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(select).toBeVisible()
  state = { ...state, supported: false }
  await page.reload()
  await expect(page.getByText(/Requires Raspberry Pi 5/)).toBeVisible()
  await expect(select).toHaveCount(0)
  role = 'member'
  await page.reload()
  await expect(select).toHaveCount(0)
  await expect(page.getByText(/administrator/i)).toBeVisible()
  role = 'admin'
  state = { ...state, supported: true, config: { enabled: true, gpio: 25 }, activeGPIO: 25 }
  for (const lang of ['en', 'ru', 'uk'])
    for (const theme of ['light', 'dark'])
      for (const material of ['solid', 'glass'])
        for (const width of [320, 1280]) {
          await page.setViewportSize({ width, height: 900 })
          await page.goto(url + `?lang=${lang}&theme=${theme}&material=${material}`)
          await expect(page.locator('select')).toBeVisible()
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            `${lang}/${theme}/${material}/${width} overflow`,
          )
          assert.ok(!(await page.locator('body').innerText()).includes('power.'))
          if (lang === 'ru' && width === 1280)
            await page.screenshot({ path: `/tmp/power-control-${theme}-${material}.png`, fullPage: true })
        }
  assert.deepEqual(errors, [])
  console.log(
    'Power settings: apply, pending/active states, dirty guard, keyboard, conflict, failure/retry, unsupported/member, EN/RU/UK and 24 theme/material/width combinations passed',
  )
} finally {
  await browser.close()
}
