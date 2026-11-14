import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const server = await createServer({
  configFile: false,
  root: frontend,
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 15182, strictPort: true },
})
await server.listen()
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox'],
})
const themes = [
  { theme: 'light', surface: 'solid' },
  { theme: 'light', surface: 'glass' },
  { theme: 'dark', surface: 'solid' },
  { theme: 'dark', surface: 'glass' },
]

async function fixtureState(page, key) {
  return page.evaluate((name) => window.networkDraftFixture[name], key)
}

async function setMode(page, setter, mode) {
  await page.evaluate(({ name, value }) => window.networkDraftFixture[name](value), {
    name: setter,
    value: mode,
  })
}

async function assertFontAndGeometry(page, label) {
  const font = await page.evaluate(async () => {
    const sample = 'Network access profile — 1234567890'
    await document.fonts.ready
    const faces = await document.fonts.load('16px "Manrope Variable"', sample)
    return {
      loaded: faces.some((face) => face.family === 'Manrope Variable' && face.status === 'loaded'),
      family: getComputedStyle(document.body).fontFamily,
    }
  })
  assert.equal(font.loaded, true, `${label}: Manrope Variable face loaded`)
  assert.match(font.family, /Manrope Variable/, `${label}: computed body font`)
  let geometry
  await expect(async () => {
    geometry = await page.evaluate(() => {
      const elements = [
        ...document.querySelectorAll(
          'form button:not([disabled]):not([role="switch"]), form input:not([disabled]):not([type="checkbox"]), form select:not([disabled]), form input[type="checkbox"]:not([disabled]), [role="alert"] button:not([disabled])',
        ),
      ]
      const targets = elements.map((element) =>
        element instanceof HTMLInputElement && element.type === 'checkbox'
          ? (element.closest('label') ?? element)
          : element,
      )
      const controls = targets
        .map((element) => {
          element.scrollIntoView({ block: 'center', inline: 'nearest' })
          const rect = element.getBoundingClientRect()
          const x = rect.left + rect.width / 2
          const y = rect.top + rect.height / 2
          const hit = document.elementFromPoint(x, y)
          return {
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
            visible: rect.top >= 0 && rect.bottom <= document.documentElement.clientHeight,
            label: element.getAttribute('aria-label') || element.textContent?.trim(),
            hit: !!hit && (hit === element || element.contains(hit)),
          }
        })
        .filter((item) => item.height > 0)
      const switchElement = document.querySelector('.wifi-radio-switch')
      const switchRect = switchElement?.getBoundingClientRect()
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        viewportHeight: document.documentElement.clientHeight,
        controls,
        switch:
          switchElement && switchRect
            ? {
                width: switchRect.width,
                height: switchRect.height,
                cssWidth: getComputedStyle(switchElement).width,
                cssHeight: getComputedStyle(switchElement).height,
              }
            : null,
      }
    })
    assert.ok(geometry.scrollWidth <= geometry.clientWidth, `${label}: horizontal overflow`)
    assert.ok(geometry.controls.length > 0, `${label}: no actionable controls rendered`)
    for (const control of geometry.controls) {
      assert.ok(control.top >= -1, `${label}: visible control begins above viewport`)
      assert.ok(
        control.bottom <= geometry.viewportHeight + 1,
        `${label}: visible control ends below viewport`,
      )
      assert.ok(control.hit, `${label}: visible control center is covered`)
      assert.ok(control.height >= 43.9, `${label}: control ${control.label} is too short (${control.height})`)
    }
  }).toPass({ timeout: 3000 })
  if (label.startsWith('en/light/solid/'))
    console.log(
      `${label}: Wi-Fi radio switch ${geometry.switch?.width}×${geometry.switch?.height}px (CSS ${geometry.switch?.cssWidth}×${geometry.switch?.cssHeight})`,
    )
}

async function runBehavior() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('503')) consoleErrors.push(message.text())
  })
  let readSuccess = false
  let readCalls = 0
  const writes = []
  let job
  let access = {
    config: {
      enabled: false,
      adapter: '02:00:00:00:00:01',
      ssid: 'Synthetic fallback network',
      password: 'synthetic-initial-password',
      band: 'auto',
      delay: 90,
      onLoss: true,
      usb: false,
    },
    devices: [
      {
        name: 'wlan-fixture0',
        mac: '02:00:00:00:00:01',
        ap: true,
        kind: 'wifi',
        reserved: false,
        bands: ['bg', 'a'],
        addresses: ['192.0.2.90/24'],
      },
    ],
    state: { phase: 'disabled', clients: 0, usbState: 'disabled' },
    usb: { available: true, port: 'USB-C fixture port', reason: '', reboot: false },
  }
  await page.route('**/api/v1/manage**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const view = url.searchParams.get('view')
    if (view === 'network-access') {
      readCalls++
      return readSuccess
        ? route.fulfill({ json: access })
        : route.fulfill({ status: 503, json: { error: 'Synthetic managed read unavailable' } })
    }
    if (view === 'plan' || view === 'run') {
      const body = request.postDataJSON()
      writes.push({ view, body })
      if (view === 'plan')
        return route.fulfill({
          json: { fingerprint: 'synthetic-plan-fingerprint', confirmation: 'synthetic-confirmation' },
        })
      job = { id: body.id, status: 'succeeded', stage: 'complete' }
      return route.fulfill({ json: { id: body.id } })
    }
    if (view === 'jobs') return route.fulfill({ json: job ? [job] : [] })
    return route.fulfill({ json: [] })
  })
  await page.goto('http://127.0.0.1:15182/tests/network-drafts.html?lang=en&theme=light&surface=solid')
  const apply = page.getByRole('button', { name: 'Apply', exact: true })
  const retry = page.getByRole('button', { name: 'Retry', exact: true })
  await expect(page.getByLabel('Network name', { exact: true })).toHaveCount(0)
  await expect(apply).toHaveCount(0)
  assert.equal(writes.length, 0)
  readSuccess = true
  await retry.click()
  const ssid = page.getByLabel('Network name', { exact: true })
  const fallbackPassword = page.locator('input[type="password"]').first()
  const usb = page.getByLabel('Enable USB network access', { exact: true })
  await expect(ssid).toHaveValue('Synthetic fallback network')
  await ssid.fill('Synthetic fallback travel 123456')
  await fallbackPassword.fill('synthetic-edited-fallback-secret')
  await usb.check()
  await expect(apply).toBeEnabled()
  await page.getByRole('button', { name: 'Refresh managed access', exact: true }).click()
  const callsBeforeFailure = readCalls
  readSuccess = false
  await page.getByRole('button', { name: 'Refresh managed access', exact: true }).click()
  await expect.poll(() => readCalls).toBeGreaterThan(callsBeforeFailure)
  await expect(retry).toBeVisible()
  await expect(ssid).toHaveValue('Synthetic fallback travel 123456')
  await expect(fallbackPassword).toHaveValue('synthetic-edited-fallback-secret')
  await expect(usb).toBeChecked()
  await expect(ssid).toBeEnabled()
  await expect(fallbackPassword).toBeEnabled()
  await expect(usb).toBeEnabled()
  await expect(apply).toBeDisabled()
  assert.equal(
    await page.getByRole('status').filter({ hasText: 'Showing the last successful read' }).count(),
    1,
  )
  await page.locator('form').evaluate((form) => form.requestSubmit())
  assert.equal(writes.length, 0, 'stale read blocks plan/run writes')
  readSuccess = true
  await retry.click()
  await expect(ssid).toHaveValue('Synthetic fallback travel 123456')
  await expect(fallbackPassword).toHaveValue('synthetic-edited-fallback-secret')
  await expect(usb).toBeChecked()
  await expect(apply).toBeEnabled()
  await apply.click()
  await expect.poll(() => writes.length).toBe(2)
  assert.deepEqual(
    writes.map(({ view }) => view),
    ['plan', 'run'],
  )
  const expectedConfig = {
    enabled: false,
    adapter: '02:00:00:00:00:01',
    ssid: 'Synthetic fallback travel 123456',
    password: 'synthetic-edited-fallback-secret',
    band: 'auto',
    delay: 90,
    onLoss: true,
    usb: true,
  }
  for (const { body } of writes) {
    assert.equal(body.action, 'network.access.save')
    assert.deepEqual(body.params, expectedConfig)
  }
  assert.equal(writes[1].body.fingerprint, 'synthetic-plan-fingerprint')
  assert.equal(writes[1].body.confirmation, 'synthetic-confirmation')

  access = { ...access, state: { ...access.state, phase: 'access-point' } }
  await page.getByRole('button', { name: 'Refresh managed access', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Fallback Wi-Fi active' })).toBeVisible()
  await ssid.fill('Synthetic active draft 123456')
  await apply.click()
  const accessDialog = page.getByRole('dialog')
  const confirmAccess = accessDialog.getByRole('button', { name: 'Apply', exact: true })
  await expect(confirmAccess).toBeEnabled()
  readSuccess = false
  const beforeConfirmRefresh = readCalls
  await page.evaluate(() => window.networkDraftFixture.refresh())
  await expect.poll(() => readCalls).toBeGreaterThan(beforeConfirmRefresh)
  await expect(confirmAccess).toBeDisabled()
  await expect(accessDialog.getByText(/refresh|connection/i)).toBeVisible()
  await expect(ssid).toHaveValue('Synthetic active draft 123456')
  assert.equal(writes.length, 2, 'stale open confirmation cannot plan or run')
  await accessDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(accessDialog).toHaveCount(0)
  await expect(ssid).toHaveValue('Synthetic active draft 123456')
  readSuccess = true
  await retry.click()
  await expect(ssid).toHaveValue('Synthetic active draft 123456')
  await expect(apply).toBeEnabled()

  const networksButton = page.getByRole('button', { name: 'Wi-Fi networks wlan-fixture0', exact: true })
  await networksButton.click()
  await page.getByRole('button', { name: /Synthetic selected network/ }).click()
  const wifiDialog = page.getByRole('dialog')
  const wifiPassword = wifiDialog.getByLabel('Wi-Fi password', { exact: true })
  await wifiPassword.fill('synthetic-selected-secret')
  await setMode(page, 'setRunMode', 'fail')
  await wifiDialog.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(wifiPassword).toHaveValue('synthetic-selected-secret')
  await expect(wifiDialog).toBeVisible()
  assert.deepEqual(await fixtureState(page, 'writes'), [
    {
      action: 'network.wifi.connect',
      params: {
        interface: 'wlan-fixture0',
        accessPoint: 'fixture-ap-selected-001',
        ssidHex: '53796E7468657469632053656C6563746564',
        password: 'synthetic-selected-secret',
      },
    },
  ])
  await setMode(page, 'setRunMode', 'hold')
  const connectSelected = wifiDialog.getByRole('button', { name: 'Connect', exact: true })
  await connectSelected.click()
  await expect(connectSelected).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(wifiDialog).toBeVisible()
  assert.equal((await fixtureState(page, 'writes')).length, 2, 'pending retry does not duplicate the run')
  await setMode(page, 'setRunMode', 'success')
  await page.evaluate(() => window.networkDraftFixture.releaseRun())
  await expect(wifiDialog).toHaveCount(0)
  await networksButton.click()
  await page.getByRole('button', { name: /Synthetic selected network/ }).click()
  await expect(page.getByRole('dialog').getByLabel('Wi-Fi password', { exact: true })).toHaveValue('')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await networksButton.click()
  await page.getByRole('button', { name: 'Connect to a hidden network', exact: true }).click()
  const hidden = page.getByRole('dialog')
  const hiddenSSID = hidden.getByLabel('SSID', { exact: true })
  const hiddenPassword = hidden.getByLabel('Wi-Fi password', { exact: true })
  await hiddenSSID.fill('Synthetic hidden network')
  await hiddenPassword.fill('synthetic-hidden-secret')
  await setMode(page, 'setRunMode', 'fail')
  await hidden.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(hiddenSSID).toHaveValue('Synthetic hidden network')
  await expect(hiddenPassword).toHaveValue('synthetic-hidden-secret')
  await setMode(page, 'setRunMode', 'success')
  await hidden.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(hidden).toHaveCount(0)
  const fixtureWrites = await fixtureState(page, 'writes')
  assert.deepEqual(fixtureWrites.slice(-2), [
    {
      action: 'network.wifi.connect',
      params: {
        interface: 'wlan-fixture0',
        ssid: 'Synthetic hidden network',
        security: 'wpa2',
        password: 'synthetic-hidden-secret',
      },
    },
    {
      action: 'network.wifi.connect',
      params: {
        interface: 'wlan-fixture0',
        ssid: 'Synthetic hidden network',
        security: 'wpa2',
        password: 'synthetic-hidden-secret',
      },
    },
  ])

  await page.getByRole('button', { name: 'Open synthetic access point', exact: true }).click()
  const apDialog = page.getByRole('dialog')
  const apSSID = apDialog.getByLabel('SSID', { exact: true })
  const apPassword = apDialog.getByLabel('Wi-Fi password', { exact: true })
  await apSSID.fill('Synthetic guest access point')
  await apPassword.fill('synthetic-ap-secret')
  await setMode(page, 'setRunMode', 'fail')
  await apDialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(apSSID).toHaveValue('Synthetic guest access point')
  await expect(apPassword).toHaveValue('synthetic-ap-secret')
  await setMode(page, 'setRunMode', 'success')
  await apDialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(apDialog).toHaveCount(0)
  const apWrite = (await fixtureState(page, 'writes')).at(-1)
  assert.deepEqual(apWrite, {
    action: 'network.share.wifi',
    params: {
      id: 'synthetic-sharing-group-001',
      interface: 'wlan-fixture0',
      wifi: { ssid: 'Synthetic guest access point', band: 'bg', channel: 1, password: 'synthetic-ap-secret' },
    },
  })
  await page.getByRole('button', { name: 'Open synthetic access point', exact: true }).click()
  await expect(page.getByRole('dialog').getByLabel('SSID', { exact: true })).toHaveValue(
    'Synthetic access point name',
  )
  await expect(page.getByRole('dialog').getByLabel('Wi-Fi password', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await assertFontAndGeometry(page, 'en/light/solid/1440')
  assert.deepEqual(pageErrors, [])
  assert.deepEqual(consoleErrors, [])
  await page.close()
  console.log('network draft failure/retry, stale preservation, Wi-Fi and AP recovery passed')
}

try {
  const textByLang = {}
  for (const lang of ['en', 'ru', 'uk'])
    textByLang[lang] = JSON.parse(
      await readFile(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url)),
    )

  await runBehavior()

  for (const lang of ['en', 'ru', 'uk']) {
    for (const { theme, surface } of themes) {
      for (const width of [320, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } })
        const pageErrors = []
        page.on('pageerror', (error) => pageErrors.push(error.message))
        let available = false
        const fixtureAccess = {
          config: {
            enabled: false,
            adapter: '02:00:00:00:00:01',
            ssid: 'Fixture SSID',
            password: 'synthetic-fixture-secret',
            band: 'auto',
            delay: 90,
            onLoss: true,
            usb: false,
          },
          devices: [
            {
              name: 'wlan-fixture0',
              mac: '02:00:00:00:00:01',
              ap: true,
              kind: 'wifi',
              reserved: false,
              bands: ['bg', 'a'],
              addresses: [],
            },
          ],
          state: { phase: 'disabled', clients: 0, usbState: 'disabled' },
          usb: { available: true, port: 'USB-C fixture', reason: '', reboot: false },
        }
        await page.route('**/api/v1/manage**', async (route) => {
          const url = new URL(route.request().url())
          if (url.searchParams.get('view') === 'network-access')
            return available
              ? route.fulfill({ json: fixtureAccess })
              : route.fulfill({ status: 503, json: { error: 'Synthetic managed read unavailable' } })
          if (url.searchParams.get('view') === 'plan')
            return route.fulfill({ json: { fingerprint: 'fixture', confirmation: '' } })
          if (url.searchParams.get('view') === 'run') return route.fulfill({ json: { id: 'fixture-job' } })
          if (url.searchParams.get('view') === 'jobs')
            return route.fulfill({ json: [{ id: 'fixture-job', status: 'succeeded' }] })
          return route.fulfill({ json: [] })
        })
        await page.goto(
          `http://127.0.0.1:15182/tests/network-drafts.html?lang=${lang}&theme=${theme}&surface=${surface}`,
        )
        const strings = textByLang[lang]
        const retry = page.getByRole('button', { name: strings['access.retry'], exact: true })
        await expect(retry).toBeVisible()
        available = true
        await retry.click()
        await expect(page.getByLabel(strings['access.ssid'], { exact: true })).toHaveValue('Fixture SSID')
        await expect(page.getByLabel(strings['access.usbEnabled'], { exact: true })).toBeVisible()
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          .toBe(true)
        const font = await page.evaluate(async () => {
          await document.fonts.ready
          const faces = await document.fonts.load('16px "Manrope Variable"', 'Network settings 123')
          return {
            loaded: faces.some((face) => face.family === 'Manrope Variable' && face.status === 'loaded'),
            family: getComputedStyle(document.body).fontFamily,
          }
        })
        assert.equal(font.loaded, true, `${lang}/${theme}/${surface}/${width}: font loaded`)
        assert.match(font.family, /Manrope Variable/)
        await assertFontAndGeometry(page, `${lang}/${theme}/${surface}/${width}`)
        assert.deepEqual(pageErrors, [], `${lang}/${theme}/${surface}/${width}: browser errors`)
        await page.close()
        console.log(`${lang}/${theme}/${surface}/${width}: localized recovery and layout passed`)
      }
    }
  }
} finally {
  await browser.close()
  await server.close()
}
