import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  let holdNextRead = false,
    releaseRead = null
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  let state = {
      config: { enabled: false, gpio: 25 },
      supported: true,
      configured: true,
      button: { enabled: false, gpio: 22 },
      buttonState: 'disabled',
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
      if (JSON.stringify(body.expected) !== JSON.stringify(state.config))
        return r.fulfill({
          status: 409,
          json: { error: 'Power control settings changed; reload before saving' },
        })
      state = {
        ...state,
        configured: true,
        button: body.button,
        config: { enabled: body.enabled, gpio: body.gpio },
        rebootRequired: true,
      }
    } else if (failRead) return r.fulfill({ status: 503, json: { error: 'Connection unavailable' } })
    if (r.request().method() === 'GET' && holdNextRead) {
      holdNextRead = false
      const snapshot = structuredClone(state)
      await new Promise((resolve) => {
        releaseRead = resolve
      })
      return r.fulfill({ json: snapshot })
    }
    return r.fulfill({ json: state })
  })
  const url = (process.env.POWER_TEST_URL ?? 'http://127.0.0.1:5173') + '/tests/power-control.html'
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'Power control' })).toBeVisible()
  const apply = page.getByRole('button', { name: 'Apply', exact: true })
  const enabled = page.getByRole('checkbox', { name: 'Enable automatic power cut-off', exact: true })
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
  assert.deepEqual(saves.at(-1), {
    enabled: true,
    gpio: 25,
    expected: { enabled: false, gpio: 25 },
    button: { enabled: false, gpio: 22 },
    expectedButton: { enabled: false, gpio: 22 },
  })
  await expect(page.getByText(/Restart the NAS to apply/)).toBeVisible()
  await select.selectOption('26')
  holdNextRead = true
  await expect.poll(() => releaseRead !== null, { timeout: 10000 }).toBe(true)
  await apply.click()
  await expect(apply).toBeDisabled()
  releaseRead()
  await page.waitForTimeout(200)
  await expect(select).toHaveValue('26')
  state = { ...state, config: { enabled: true, gpio: 25 }, activeGPIO: 25, rebootRequired: false }
  await page.reload()
  await expect(page.getByText('Active: GPIO25 · physical pin 22')).toBeVisible()
  await select.focus()
  await select.press('ArrowDown')
  await expect(select).toHaveValue('26')
  state = { ...state, config: { enabled: true, gpio: 24 } }
  await apply.click()
  await expect(page.getByText('Power control settings changed; reload before saving')).toBeVisible()
  await expect(select).toHaveValue('26')
  await expect(page.getByRole('button', { name: 'Reload settings' })).toBeVisible({ timeout: 10000 })
  await expect(apply).toBeDisabled()
  await page.getByRole('button', { name: 'Reload settings' }).click()
  await expect(select).toHaveValue('24')
  failRead = true
  await expect(page.getByText(/Current power state is unavailable/)).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Active: GPIO25 · physical pin 22')).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Connection unavailable')).toBeVisible()
  failRead = false
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(select).toBeVisible()
  state = { ...state, activeGPIO: 1 }
  await page.reload()
  await expect(
    page.getByText('Active: GPIO1 · physical pin is outside the supported selection'),
  ).toBeVisible()
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
          await expect(page.locator('select').first()).toBeVisible()
          await expect(
            page.getByRole('heading', {
              name: { en: 'Power control', ru: 'Управление питанием', uk: 'Керування живленням' }[lang],
            }),
          ).toBeVisible()
          assert.equal(await page.locator('html').getAttribute('data-surface'), material)
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            `${lang}/${theme}/${material}/${width} overflow`,
          )
          assert.ok(!(await page.locator('body').innerText()).includes('power.'))
          if (lang === 'ru' && width === 1280)
            await page.screenshot({ path: `/tmp/power-control-${theme}-${material}.png`, fullPage: true })
        }
  state = {
    ...state,
    configured: false,
    config: { enabled: false, gpio: 25 },
    button: { enabled: false, gpio: 22 },
    activeGPIO: null,
    rebootRequired: false,
  }
  await page.goto(url)
  const button = page.getByRole('checkbox', { name: 'Shut down using a physical button' })
  await expect(enabled).toBeChecked()
  await expect(button).toBeChecked()
  await expect(apply).toBeEnabled()
  const before = saves.length
  await page.getByLabel('Button input GPIO').selectOption('25')
  await expect(apply).toBeDisabled()
  await page.getByLabel('Button input GPIO').selectOption('22')
  assert.equal(saves.length, before)
  await apply.click()
  await expect(apply).toBeDisabled()
  await expect.poll(() => saves.length).toBe(before + 1)
  await expect(page.getByText(/Both options are selected for initial setup/)).toHaveCount(0)
  assert.deepEqual(saves.at(-1).button, { enabled: true, gpio: 22 })
  assert.deepEqual(saves.at(-1).expectedButton, { enabled: false, gpio: 22 })
  assert.deepEqual(errors, [])
  console.log(
    'Power settings: apply, pending/active states, dirty guard, keyboard, conflict, failure/retry, unsupported/member, EN/RU/UK and 24 theme/material/width combinations passed',
  )
} finally {
  await browser.close()
}
