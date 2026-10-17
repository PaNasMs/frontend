import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox'],
})
const config = {
  layout: 'compact',
  pageSeconds: 6,
  enabled: false,
  brightness: 25,
  rotation: 0,
  bus: 1,
  sda: 2,
  scl: 3,
  address: 60,
  controller: 'ssd1306',
  showIP: true,
  showCPU: true,
  showDisks: true,
}
const makeState = (supported = true) => ({
  config: { ...config },
  supported,
  state: 'disabled',
  status: { observedAt: new Date().toISOString(), applied: config, error: '', lines: [] },
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  let state = makeState(false),
    failSave = false,
    saves = []
  await page.route('**/api/v1/oled', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON()
      saves.push(body)
      if (failSave) return route.fulfill({ status: 503, json: { error: 'Display test failure' } })
      state = {
        ...state,
        config: body,
        state: body.enabled ? 'active' : 'disabled',
        status: { ...state.status, applied: body },
      }
    }
    return route.fulfill({ json: state })
  })
  await page.route('**/api/v1/notifications', (route) => route.fulfill({ json: [] }))
  const url = (process.env.OLED_TEST_URL ?? 'http://127.0.0.1:5173') + '/tests/oled.html'
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'OLED display' })).toHaveCount(0)
  state = makeState()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'OLED display' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Enable display support' })).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Enable display support' }).check()
  await page.getByRole('link', { name: 'Leave settings' }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Enable display support' })).toBeChecked()
  await page.getByRole('button', { name: 'Advanced settings', exact: true }).click()
  await page.getByLabel('SDA / SCL pins').selectOption('12')
  for (const layout of ['large', 'disks', 'pages']) {
    await page.getByLabel('Layout', { exact: true }).selectOption(layout)
    await expect(page.locator('figure img')).toHaveAttribute('src', `/oled/${layout}.png`)
    assert.equal(saves.length, 0, 'preview must not apply settings')
  }
  const layoutSelect = page.getByLabel('Layout', { exact: true })
  await layoutSelect.focus()
  await layoutSelect.press('Home')
  await layoutSelect.press('ArrowDown')
  await expect(layoutSelect).toHaveValue('large')
  await layoutSelect.selectOption('pages')
  await page.getByLabel('Page interval (seconds)').fill('3')
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await expect(page.getByLabel('Page interval (seconds)')).toHaveAttribute('aria-invalid', 'true')
  await page.getByLabel('Page interval (seconds)').fill('8')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByText('Display is receiving updates', { exact: true })).toBeVisible()
  assert.equal(saves.at(-1).sda, 12)
  assert.equal(saves.at(-1).scl, 13)
  assert.equal(saves.at(-1).bus, 2)
  assert.equal(saves.at(-1).layout, 'pages')
  assert.equal(saves.at(-1).pageSeconds, 8)
  for (const label of ['IP address', 'CPU temperature', 'Disk temperatures'])
    await page.getByRole('checkbox', { name: label, exact: true }).uncheck()
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'IP address', exact: true }).check()
  await page.getByLabel('Layout', { exact: true }).selectOption('large')
  failSave = true
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByText('Display test failure')).toBeVisible()
  await expect(page.getByLabel('Layout', { exact: true })).toHaveValue('large')
  await expect(page.getByRole('checkbox', { name: 'CPU temperature' })).not.toBeChecked()
  failSave = false
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Enable display support' }).uncheck()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByText('Display support is off', { exact: true })).toBeVisible()
  for (const lang of ['en', 'ru', 'uk'])
    for (const theme of ['light', 'dark'])
      for (const width of [320, 768, 1280]) {
        state = makeState()
        await page.setViewportSize({ width, height: 900 })
        await page.goto(url + `?lang=${lang}&theme=${theme}`)
        await expect(page.locator('h2')).toBeVisible()
        await page.locator('.disclosure').click()
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${lang}/${theme}/${width} overflow`,
        )
        assert.ok(!(await page.locator('body').innerText()).includes('oled.'), 'missing translation')
        for (const layout of ['compact', 'large', 'disks', 'pages']) {
          await page.locator('select').first().selectOption(layout)
          await expect(page.locator('figure img')).toHaveJSProperty('naturalWidth', 128)
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            `${layout}/${lang}/${theme}/${width} overflow`,
          )
          assert.ok(!(await page.locator('body').innerText()).includes('oled.'), 'missing translation')
          if (width === 1280 && lang === 'ru')
            await page.screenshot({ path: `/tmp/oled-layout-${layout}-${theme}.png`, fullPage: true })
        }
      }
  assert.deepEqual(errors, [])
  console.log(
    'OLED: unsupported platform, disabled default, dirty guard, pin pairing, enable/disable, validation, save failure, all 4 layouts in 18 locale/theme/width combinations passed',
  )
} finally {
  await browser.close()
}
