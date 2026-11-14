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
  server: { host: '127.0.0.1', port: 15186, strictPort: true },
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
const languages = ['en', 'ru', 'uk']
const widths = [320, 1440]

async function mockAPI(page) {
  const writes = []
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const resource = url.pathname.replace(/^\/api\/v1\//, '')
    if (request.method() !== 'GET')
      writes.push({ resource, method: request.method(), body: request.postDataJSON() })
    if (resource === 'preferences')
      return route.fulfill({
        json: {
          desktopLayouts: {
            wide: [
              {
                id: 'fixture-desktop-tile',
                kind: 'synthetic-config-widget',
                x: 0,
                y: 0,
                config: { endpoint: 'synthetic-baseline-endpoint' },
              },
            ],
            medium: [],
            mobile: [],
          },
        },
      })
    if (resource === 'metrics') return route.fulfill({ json: {} })
    return route.fulfill({ json: {} })
  })
  return writes
}

async function goto(page, path = '/dialog', lang = 'en', theme = 'light', surface = 'solid') {
  await page.goto(
    `http://127.0.0.1:15186/tests/dirty-dialogs.html?path=${encodeURIComponent(path)}&lang=${lang}&theme=${theme}&surface=${surface}`,
  )
}

async function reproduceBackLoss() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await mockAPI(page)
  await goto(page)
  const dialog = page.getByRole('dialog', { name: 'Synthetic settings dialog' })
  await expect(dialog).toBeVisible()
  await dialog
    .getByRole('textbox', { name: 'Mock value', exact: true })
    .fill('synthetic edit that must survive')
  await page.evaluate(() => window.dirtyDialogsFixture.back())
  await expect(page.getByTestId('current-route')).toHaveText('/start')
  assert.equal(
    await page.getByRole('dialog').count(),
    0,
    'baseline reproduces the dialog being discarded by router Back',
  )
  assert.equal(await page.getByRole('dialog', { name: 'Discard unsaved changes?' }).count(), 0)
  console.log('BASELINE REPRODUCED: router Back leaves the dirty dialog without a discard decision')
  await page.close()
}

async function assertFontAndLayout(page, label, strings) {
  const font = await page.evaluate(async () => {
    await document.fonts.ready
    const loaded = await document.fonts.load('16px "Manrope Variable"', 'Discard unsaved changes 123')
    return {
      face: loaded.some((entry) => entry.family === 'Manrope Variable' && entry.status === 'loaded'),
      family: getComputedStyle(document.body).fontFamily,
    }
  })
  assert.equal(font.face, true, `${label}: actual Manrope Variable font face`)
  assert.match(font.family, /Manrope Variable/, `${label}: computed font family`)
  let geometry
  await expect(async () => {
    geometry = await page.evaluate(() => {
      const dialog = document.querySelector('[role=dialog]')
      const elements = [
        ...(dialog?.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled])',
        ) ?? []),
      ].filter((node) => node.getClientRects().length > 0)
      const controls = elements.map((node) => {
        node.scrollIntoView({ block: 'center', inline: 'nearest' })
        const rect = node.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        return {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          hit: !!hit && (hit === node || node.contains(hit)),
          label: node.getAttribute('aria-label') || node.textContent?.trim(),
        }
      })
      const rect = dialog?.getBoundingClientRect()
      return {
        width: document.documentElement.scrollWidth,
        clientWidth: innerWidth,
        height: innerHeight,
        dialog: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null,
        controls,
      }
    })
    assert.ok(geometry.width <= geometry.clientWidth, `${label}: horizontal overflow`)
    assert.ok(geometry.dialog, `${label}: dialog missing`)
    assert.ok(
      geometry.dialog.left >= -1 && geometry.dialog.right <= geometry.clientWidth + 1,
      `${label}: dialog horizontal bounds`,
    )
    assert.ok(
      geometry.dialog.top >= -1 && geometry.dialog.bottom <= geometry.height + 1,
      `${label}: dialog vertical bounds`,
    )
    assert.ok(geometry.controls.length >= 3, `${label}: expected form and dismissal controls`)
    for (const control of geometry.controls) {
      assert.ok(
        control.top >= -1 && control.bottom <= geometry.height + 1,
        `${label}: ${control.label} outside viewport`,
      )
      assert.ok(control.hit, `${label}: ${control.label} center hit test`)
      assert.ok(control.height >= 43.9, `${label}: ${control.label} target is ${control.height}px high`)
    }
  }).toPass({ timeout: 4000 })
}

async function behaviorTests(strings) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  const writes = await mockAPI(page)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await goto(page)
  const dialog = page.getByRole('dialog', { name: 'Synthetic settings dialog' })
  const value = dialog.getByRole('textbox', { name: 'Mock value', exact: true })

  // Clean footer, X, Escape, and backdrop close without a discard prompt.
  await dialog.getByRole('button', { name: strings.cancel_0ec753be, exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'Open dialog', exact: true }).click()
  await page.getByRole('button', { name: strings.close_4ae50d30, exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'Open dialog', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'Open dialog', exact: true }).click()
  await page.mouse.click(4, 4)
  await expect(dialog).toHaveCount(0)

  // Dirty backdrop interaction is ignored: it does not close or silently discard.
  await page.getByRole('button', { name: 'Open dialog', exact: true }).click()
  await value.fill('retained after outside pointer')
  await page.mouse.click(4, 4)
  await expect(dialog).toBeVisible()
  await expect(value).toHaveValue('retained after outside pointer')
  await expect(page.getByRole('heading', { name: strings['ui.discardTitle'], exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: strings.cancel_0ec753be, exact: true }).click()
  await page.getByRole('button', { name: strings['ui.discard'], exact: true }).click()

  // A field edit can be reverted; the true baseline should be clean again.
  await page.getByRole('button', { name: 'Open dialog', exact: true }).click()
  await value.fill('temporary edit')
  await value.fill('synthetic baseline value')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  // X and footer cancellation require an explicit decision, and Keep editing retains values.
  await page.getByRole('button', { name: 'Open dialog', exact: true }).click()
  await value.fill('preserved after keep editing')
  await page.getByRole('button', { name: strings.close_4ae50d30, exact: true }).click()
  await expect(page.getByRole('heading', { name: strings['ui.discardTitle'], exact: true })).toBeVisible()
  await page.getByRole('button', { name: strings['ui.keepEditing'], exact: true }).click()
  await expect(value).toHaveValue('preserved after keep editing')
  await dialog.getByRole('button', { name: strings.cancel_0ec753be, exact: true }).click()
  await expect(page.getByRole('heading', { name: strings['ui.discardTitle'], exact: true })).toBeVisible()
  await page.getByRole('button', { name: strings['ui.discard'], exact: true }).click()
  await expect(dialog).toHaveCount(0)
  assert.equal(writes.length, 0, 'cancel/discard never submits the mock form')

  // Child picker Escape closes only the child and retains the dirty parent.
  await page.getByRole('button', { name: 'Open dialog', exact: true }).click()
  await value.fill('parent survives child picker')
  await dialog.getByRole('button', { name: 'Open child picker', exact: true }).click()
  const child = page.getByRole('dialog', { name: 'Mock child picker' })
  await expect(child).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(child).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(value).toHaveValue('parent survives child picker')
  await page.getByRole('button', { name: strings.close_4ae50d30, exact: true }).click()
  await page.getByRole('button', { name: strings['ui.discard'], exact: true }).click()

  // Router Back must retain the open form behind the shared route guard.
  await page.getByRole('link', { name: 'Start page', exact: true }).click()
  await page.getByRole('link', { name: 'Open dialog', exact: true }).click()
  await expect(dialog).toBeVisible()
  await value.fill('router back draft')
  await page.evaluate(() => window.dirtyDialogsFixture.back())
  const guard = page.getByRole('dialog', { name: strings['ui.discardTitle'], exact: true })
  await expect(guard).toBeVisible()
  await expect(page.getByTestId('current-route')).toHaveText('/dialog')
  await guard.getByRole('button', { name: strings.cancel_0ec753be, exact: true }).click()
  await expect(dialog).toBeVisible()
  await expect(value).toHaveValue('router back draft')

  // Pending work blocks both local dismissal and navigation; releasing restores the decision.
  await dialog.getByRole('button', { name: 'Start pending operation', exact: true }).click()
  await expect(dialog.locator('.waiting-overlay')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await page.evaluate(() => window.dirtyDialogsFixture.back())
  const pendingGuard = page.getByRole('dialog', {
    name: strings['operation_in_progress_10a75370'],
    exact: true,
  })
  await expect(pendingGuard).toBeVisible()
  await expect(pendingGuard.getByText(strings['ui.waitBeforeLeaving'], { exact: true })).toBeVisible()
  await expect(pendingGuard.getByRole('button', { name: strings['ui.discard'], exact: true })).toBeDisabled()
  await pendingGuard.getByRole('button', { name: strings.cancel_0ec753be, exact: true }).click()
  await expect(pendingGuard).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await page.evaluate(() => window.dirtyDialogsFixture.releasePending())
  await expect(dialog.locator('.waiting-overlay')).toHaveCount(0)
  await page.evaluate(() => window.dirtyDialogsFixture.back())
  await expect(page.getByRole('dialog', { name: strings['ui.discardTitle'], exact: true })).toBeVisible()
  await page.getByRole('button', { name: strings['ui.discard'], exact: true }).click()
  await expect(page.getByTestId('current-route')).toHaveText('/start')
  assert.equal(writes.length, 0)
  await page.close()

  // Shared DialogContent remains usable without the global dirty-form provider/router guard.
  const unhosted = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const unhostedErrors = []
  await mockAPI(unhosted)
  unhosted.on('pageerror', (error) => unhostedErrors.push(error.message))
  await goto(unhosted, '/unhosted')
  const unhostedDialog = unhosted.getByRole('dialog', { name: 'Synthetic settings dialog' })
  const unhostedValue = unhostedDialog.getByRole('textbox', { name: 'Mock value', exact: true })
  await unhostedValue.fill('standalone local draft')
  await unhosted.getByRole('button', { name: strings.close_4ae50d30, exact: true }).click()
  await expect(unhosted.getByRole('heading', { name: strings['ui.discardTitle'], exact: true })).toBeVisible()
  await unhosted.getByRole('button', { name: strings['ui.keepEditing'], exact: true }).click()
  await expect(unhostedValue).toHaveValue('standalone local draft')
  await unhostedDialog.getByRole('button', { name: strings.cancel_0ec753be, exact: true }).click()
  await unhosted.getByRole('button', { name: strings['ui.discard'], exact: true }).click()
  await expect(unhostedDialog).toHaveCount(0)
  assert.deepEqual(unhostedErrors, [])
  await unhosted.close()

  // Real Wi-Fi controls: password-only edits are dirty and cannot be silently dropped.
  const wifiPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const wifiWrites = await mockAPI(wifiPage)
  await goto(wifiPage, '/wifi')
  await wifiPage.getByRole('button', { name: /Wi-Fi networks/ }).click()
  await wifiPage.getByRole('button', { name: /Synthetic secure network/ }).click()
  let wifiDialog = wifiPage.getByRole('dialog')
  const secret = wifiDialog.getByLabel(strings['wifi.password'], { exact: true })
  await secret.fill('synthetic-wifi-secret-only')
  await wifiPage.keyboard.press('Escape')
  await expect(wifiPage.getByRole('heading', { name: strings['ui.discardTitle'], exact: true })).toBeVisible()
  await wifiPage.getByRole('button', { name: strings['ui.keepEditing'], exact: true }).click()
  await expect(secret).toHaveValue('synthetic-wifi-secret-only')
  await wifiDialog.getByRole('button', { name: strings.cancel_0ec753be, exact: true }).click()
  await expect(wifiPage.getByRole('heading', { name: strings['ui.discardTitle'], exact: true })).toBeVisible()
  await wifiPage.getByRole('button', { name: strings['ui.discard'], exact: true }).click()
  await expect(wifiDialog).toHaveCount(0)
  await wifiPage.getByRole('button', { name: /Wi-Fi networks/ }).click()
  await wifiPage.getByRole('button', { name: /Synthetic secure network/ }).click()
  wifiDialog = wifiPage.getByRole('dialog')
  await expect(wifiDialog.getByLabel(strings['wifi.password'], { exact: true })).toHaveValue('')
  assert.equal(wifiWrites.length, 0, 'Wi-Fi dismissal never runs a connection')
  await wifiPage.close()

  // Actual desktop widget configuration uses the same shared dialog guard.
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const desktopWrites = await mockAPI(desktop)
  await goto(desktop, '/desktop')
  await desktop.getByRole('button', { name: strings['customize_desktop_701fd886'], exact: true }).click()
  await desktop
    .getByRole('button', {
      name: new RegExp(`${strings['configure_8960ddc3']}: Synthetic configurable widget`),
    })
    .click()
  const configDialog = desktop.getByRole('dialog')
  const endpoint = configDialog.getByLabel('Mock endpoint', { exact: true })
  await endpoint.fill('synthetic-edited-endpoint')
  await configDialog.getByRole('button', { name: 'Open child picker', exact: true }).click()
  await expect(desktop.getByRole('dialog', { name: 'Mock child picker' })).toBeVisible()
  await desktop.keyboard.press('Escape')
  await expect(desktop.getByRole('dialog', { name: 'Mock child picker' })).toHaveCount(0)
  await expect(configDialog).toBeVisible()
  await expect(endpoint).toHaveValue('synthetic-edited-endpoint')
  await configDialog.getByRole('button', { name: strings.cancel_0ec753be, exact: true }).click()
  await expect(desktop.getByRole('heading', { name: strings['ui.discardTitle'], exact: true })).toBeVisible()
  await desktop.getByRole('button', { name: strings['ui.keepEditing'], exact: true }).click()
  await expect(endpoint).toHaveValue('synthetic-edited-endpoint')
  await configDialog.getByRole('button', { name: strings.cancel_0ec753be, exact: true }).click()
  await desktop.getByRole('button', { name: strings['ui.discard'], exact: true }).click()
  await expect(configDialog).toHaveCount(0)
  assert.equal(desktopWrites.length, 0, 'desktop dialog discard never saves preferences')
  assert.deepEqual(errors, [])
  await desktop.close()
  console.log('generic dialog, router Back, pending guard, Wi-Fi password and desktop configuration passed')
}

try {
  const translations = {}
  for (const lang of languages)
    translations[lang] = JSON.parse(
      await readFile(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url)),
    )
  if (process.env.DIRTY_DIALOGS_REPRO_ONLY) await reproduceBackLoss()
  else if (!process.env.DIRTY_DIALOGS_MATRIX_FILTER) await behaviorTests(translations.en)

  if (!process.env.DIRTY_DIALOGS_REPRO_ONLY)
    for (const lang of languages) {
      for (const { theme, surface } of themes) {
        for (const width of widths) {
          const caseName = `${lang}/${theme}/${surface}/${width}`
          if (process.env.DIRTY_DIALOGS_MATRIX_FILTER && process.env.DIRTY_DIALOGS_MATRIX_FILTER !== caseName)
            continue
          const page = await browser.newPage({ viewport: { width, height: 760 } })
          const errors = []
          page.on('pageerror', (error) => errors.push(error.message))
          await mockAPI(page)
          await goto(page, '/dialog', lang, theme, surface)
          const strings = translations[lang]
          const dialog = page.getByRole('dialog', { name: 'Synthetic settings dialog' })
          const field = dialog.getByRole('textbox', { name: 'Mock value', exact: true })
          await field.fill('long synthetic edit for translated discard prompt')
          await page.keyboard.press('Escape')
          await expect(
            page.getByRole('heading', { name: strings['ui.discardTitle'], exact: true }),
          ).toBeVisible()
          await expect(
            page.getByRole('button', { name: strings['ui.keepEditing'], exact: true }),
          ).toBeFocused()
          await assertFontAndLayout(page, caseName, strings)
          assert.deepEqual(errors, [], `${caseName}: page errors`)
          await page.close()
          console.log(`${caseName}: discard dialog copy, loaded font, bounds, and hit targets passed`)
        }
      }
    }
} finally {
  await browser.close()
  await server.close()
}
