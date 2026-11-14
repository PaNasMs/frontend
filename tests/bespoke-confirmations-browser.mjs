import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const base = process.env.FRONTEND_TEST_URL ?? 'http://127.0.0.1:15177'
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  headless: true,
  args: ['--no-sandbox'],
})
const labels = Object.fromEntries(
  await Promise.all(
    ['en', 'ru', 'uk'].map(async (lang) => [
      lang,
      JSON.parse(await readFile(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url))),
    ]),
  ),
)
const matrix = []
try {
  for (const lang of ['en', 'ru', 'uk']) {
    for (const theme of ['light', 'dark']) {
      for (const material of ['solid', 'glass']) {
        for (const width of [320, 1440]) {
          const page = await browser.newPage({ viewport: { width, height: 900 } })
          const errors = []
          const writes = []
          const consoleErrors = []
          const moduleName = 'Fixture module · Storage group · North wing · Long descriptive target'
          const representative = lang === 'en' && theme === 'light' && material === 'solid' && width === 1440
          page.on('pageerror', (error) => errors.push(error.message))
          page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text())
          })
          await page.route('**/api/v1/**', async (route) => {
            const url = new URL(route.request().url())
            const view = url.searchParams.get('view')
            if (view === 'system-updates')
              return route.fulfill({
                json: {
                  settings: { channel: 'stable', mode: 'notify', hour: 7 },
                  installed: { 'panasms-prototype': '0.2.0' },
                  candidate: { version: '0.3.0-fixture', run: 'https://example.test/release' },
                  checkedAt: '2026-11-14T10:00:00Z',
                  available: true,
                  busy: false,
                  rollbackAvailable: true,
                  state: {},
                  history: [],
                },
              })
            if (view === 'modules')
              return route.fulfill({
                json: {
                  core: '0.2.0',
                  api: 1,
                  installed: [
                    {
                      id: 'fixture-module',
                      title: moduleName,
                      version: '1.2.3-fixture',
                      enabled: true,
                      signer: 'PaNasMs',
                      core: '0.2.0',
                      description: 'A mock module',
                      dependencies: {},
                      packages: {},
                      requiredBy: [],
                      files: {},
                    },
                    {
                      id: 'fixture-disabled',
                      title: 'Disabled fixture',
                      version: '1.2.3-fixture',
                      enabled: false,
                      signer: 'PaNasMs',
                      core: '0.2.0',
                      description: 'A mock disabled module',
                      dependencies: {},
                      packages: {},
                      requiredBy: [],
                      files: {},
                    },
                  ],
                },
              })
            if (view === 'module-catalog') return route.fulfill({ json: { available: [], errors: [] } })
            if (view === 'plan') {
              const body = route.request().postDataJSON()
              writes.push({ view, ...body })
              return route.fulfill({
                json: {
                  target: body.params.target,
                  details: ['Mock review consequence.'],
                  fingerprint: 'fixture',
                  confirmation: 'fixture',
                },
              })
            }
            if (view === 'run') {
              writes.push({ view, ...route.request().postDataJSON() })
              return route.fulfill({ json: { id: 'fixture-job' } })
            }
            if (view === 'jobs')
              return route.fulfill({ json: [{ id: 'fixture-job', status: 'succeeded', stage: 'complete' }] })
            return route.fulfill({ json: [] })
          })
          await page.goto(
            `${base}/tests/bespoke-confirmations.html?lang=${lang}&theme=${theme}&material=${material}`,
          )
          await page.evaluate(() => document.fonts.ready)
          assert.match(
            await page.locator('body').evaluate((body) => getComputedStyle(body).fontFamily),
            /Manrope/i,
          )
          assert.ok(
            (await page.evaluate(() => document.fonts.load('16px "Manrope Variable"'))).length > 0,
            `${lang}/${theme}/${material}/${width} Manrope face loaded`,
          )
          const t = labels[lang]
          const dialog = page.getByRole('dialog')
          const checkDialogGeometry = async (action) => {
            const actionBox = await action.boundingBox()
            assert.ok(actionBox, 'confirmation action is rendered')
            assert.ok(
              actionBox.x >= 0 && actionBox.x + actionBox.width <= width,
              `${lang}/${theme}/${material}/${width} action stays inside viewport`,
            )
            assert.ok(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
              `${lang}/${theme}/${material}/${width} dialog has no horizontal overflow`,
            )
            let hit
            try {
              await expect(async () => {
                hit = await action.evaluate((button) => {
                  const rect = button.getBoundingClientRect()
                  const dialog = button.closest('[role="dialog"]')?.getBoundingClientRect()
                  const overlay = document.querySelector('.dialog-overlay')?.getBoundingClientRect()
                  const element = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
                  return {
                    reachesButton: element === button || button.contains(element),
                    buttonRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                    dialogRect: dialog && {
                      x: dialog.x,
                      y: dialog.y,
                      width: dialog.width,
                      height: dialog.height,
                    },
                    overlayRect: overlay && {
                      x: overlay.x,
                      y: overlay.y,
                      width: overlay.width,
                      height: overlay.height,
                    },
                    hitElement: element?.outerHTML.slice(0, 180),
                  }
                })
                expect(hit.reachesButton, JSON.stringify(hit)).toBe(true)
              }).toPass({ timeout: 5000 })
            } catch (error) {
              await page.screenshot({
                path: `/tmp/bespoke-confirmations-${lang}-${theme}-${material}-${width}.png`,
                fullPage: true,
              })
              throw new Error(`${error.message}\nLast hit-test geometry: ${JSON.stringify(hit)}`)
            }
          }

          await page.getByRole('button', { name: `${t['share.stop']} enp2s0`, exact: true }).click()
          await expect(dialog).toBeVisible()
          await expect(dialog.getByRole('heading', { name: t['share.stop'], exact: true })).toBeVisible()
          const groupName = 'Workshop network · North wing · "Guest devices" · Dedicated Wi-Fi access'
          await expect(dialog.getByText(groupName, { exact: true })).toBeVisible()
          const shareStop = dialog.getByRole('button', {
            name: `${t['share.stop']} · ${groupName}`,
            exact: true,
          })
          await expect(shareStop).toHaveClass(/primary/)
          await checkDialogGeometry(shareStop)
          await expect(dialog.getByRole('button', { name: t['share.cancel'], exact: true })).toBeFocused()
          await dialog.getByRole('button', { name: t['share.cancel'], exact: true }).click()
          assert.deepEqual(await page.evaluate(() => window.bespokeRuns), [])
          await page.getByRole('button', { name: `${t['share.start']} enp3s0`, exact: true }).click()
          const shareStart = dialog.getByRole('button', {
            name: `${t['share.start']} · Workshop backup network`,
            exact: true,
          })
          await expect(shareStart).toHaveClass(/primary/)
          await checkDialogGeometry(shareStart)
          await expect(dialog.getByRole('button', { name: t['share.cancel'], exact: true })).toBeFocused()
          await expect(dialog.getByRole('button', { name: t['share.cancel'], exact: true })).toBeFocused()
          await shareStart.click()
          assert.deepEqual(await page.evaluate(() => window.bespokeRuns.at(-1)), {
            action: 'network.share.start',
            params: { id: 'stopped-sharing-fixture' },
          })
          await page.getByRole('button', { name: `${t['share.delete']} enp2s0`, exact: true }).click()
          const shareDelete = dialog.getByRole('button', {
            name: `${t['share.delete']} · ${groupName}`,
            exact: true,
          })
          await expect(shareDelete).toHaveClass(/danger/)
          await checkDialogGeometry(shareDelete)
          await expect(dialog.getByRole('button', { name: t['share.cancel'], exact: true })).toBeFocused()
          if (representative) {
            await shareDelete.click()
            assert.deepEqual(await page.evaluate(() => window.bespokeRuns.at(-1)), {
              action: 'network.share.delete',
              params: { id: 'sharing-fixture' },
            })
          } else await dialog.getByRole('button', { name: t['share.cancel'], exact: true }).click()

          await page
            .getByRole('button', { name: `${t['wifi.disconnect']} wlan-fixture`, exact: true })
            .click()
          await expect(
            dialog.getByRole('heading', { name: `${t['wifi.disconnect']} · wlan-fixture`, exact: true }),
          ).toBeVisible()
          await expect(dialog.getByText(t['wifi.disconnectHint'], { exact: true })).toBeVisible()
          const disconnect = dialog.getByRole('button', {
            name: `${t['wifi.disconnect']} · wlan-fixture`,
            exact: true,
          })
          await expect(disconnect).toHaveClass(/primary/)
          await checkDialogGeometry(disconnect)
          await expect(dialog.getByRole('button', { name: t['homes.cancel'], exact: true })).toBeFocused()
          await disconnect.click()
          assert.deepEqual(await page.evaluate(() => window.bespokeRuns.at(-1)), {
            action: 'network.wifi.disconnect',
            params: { interface: 'wlan-fixture' },
          })
          await page.getByRole('switch', { name: 'Wi-Fi · wlan-fixture' }).click()
          await expect(
            dialog.getByRole('heading', { name: `${t['wifi.turnOff']} · wlan-fixture`, exact: true }),
          ).toBeVisible()
          await expect(dialog.getByText(t['wifi.radioHint'], { exact: true })).toBeVisible()
          const radioOff = dialog.getByRole('button', {
            name: `${t['wifi.turnOff']} · wlan-fixture`,
            exact: true,
          })
          await checkDialogGeometry(radioOff)
          await expect(dialog.getByRole('button', { name: t['homes.cancel'], exact: true })).toBeFocused()
          await radioOff.click()
          assert.deepEqual(await page.evaluate(() => window.bespokeRuns.at(-1)), {
            action: 'network.wifi.radio',
            params: { interface: 'wlan-fixture', enabled: false },
          })
          await page.getByRole('switch', { name: 'Wi-Fi · wlan-offline-fixture' }).click()
          await expect(
            dialog.getByRole('heading', { name: `${t['wifi.turnOn']} · wlan-offline-fixture`, exact: true }),
          ).toBeVisible()
          const radioOn = dialog.getByRole('button', {
            name: `${t['wifi.turnOn']} · wlan-offline-fixture`,
            exact: true,
          })
          await checkDialogGeometry(radioOn)
          await expect(dialog.getByRole('button', { name: t['homes.cancel'], exact: true })).toBeFocused()
          await dialog.getByRole('button', { name: t['homes.cancel'], exact: true }).click()

          await page.getByRole('button', { name: t['up.install'], exact: true }).click()
          await expect(dialog.getByRole('heading', { name: t['up.install'], exact: true })).toBeVisible()
          const install = dialog.getByRole('button', {
            name: `${t['up.install']} · PaNasMs 0.3.0-fixture`,
            exact: true,
          })
          await expect(install).toBeVisible()
          await checkDialogGeometry(install)
          await expect(dialog.getByRole('button', { name: t.cancel_0ec753be, exact: true })).toBeFocused()
          await dialog.getByRole('button', { name: t.cancel_0ec753be, exact: true }).click()
          await page.getByRole('button', { name: t['up.rollback'], exact: true }).click()
          const rollback = dialog.getByRole('button', { name: `${t['up.rollback']} · PaNasMs`, exact: true })
          await expect(rollback).toBeVisible()
          await checkDialogGeometry(rollback)
          await expect(dialog.getByRole('button', { name: t.cancel_0ec753be, exact: true })).toBeFocused()
          await dialog.getByRole('button', { name: t.cancel_0ec753be, exact: true }).click()

          const enableButton = page
            .getByRole('button', { name: `${t.disable_94d07a21} ${moduleName}`, exact: true })
            .first()
          await enableButton.click()
          await expect(
            dialog.getByRole('heading', { name: t.disable_module_11c9ac86, exact: true }),
          ).toBeVisible()
          await expect(dialog.getByText(moduleName, { exact: true })).toBeVisible()
          await expect(dialog.getByRole('button', { name: t.cancel_0ec753be, exact: true })).toBeFocused()
          const moduleDisable = dialog.getByRole('button', {
            name: `${t.disable_module_11c9ac86} · ${moduleName}`,
            exact: true,
          })
          await expect(moduleDisable).toHaveClass(/primary/)
          await checkDialogGeometry(moduleDisable)
          await expect(dialog.getByRole('button', { name: t.cancel_0ec753be, exact: true })).toBeFocused()
          await dialog.getByRole('button', { name: t.cancel_0ec753be, exact: true }).click()
          await page
            .getByRole('button', { name: new RegExp(`${t.enable_66be7e0c} Disabled fixture`) })
            .first()
            .click()
          await expect(
            dialog.getByRole('heading', { name: t.enable_module_9e827c96, exact: true }),
          ).toBeVisible()
          await expect(
            dialog.getByRole('button', { name: new RegExp(`${t.enable_module_9e827c96}.*Disabled fixture`) }),
          ).toBeVisible()
          await checkDialogGeometry(
            dialog.getByRole('button', { name: new RegExp(`${t.enable_module_9e827c96}.*Disabled fixture`) }),
          )
          await expect(dialog.getByRole('button', { name: t.cancel_0ec753be, exact: true })).toBeFocused()
          await dialog.getByRole('button', { name: t.cancel_0ec753be, exact: true }).click()
          const removeName = t.delete_12edf5dd.replace('{{v0}}', moduleName)
          await page.getByRole('button', { name: removeName, exact: true }).first().click()
          await expect(
            dialog.getByRole('heading', { name: t.remove_module_ed11fa8e, exact: true }),
          ).toBeVisible()
          const moduleRemove = dialog.getByRole('button', {
            name: new RegExp(`${t.remove_module_ed11fa8e}.*${moduleName}`),
          })
          await expect(moduleRemove).toHaveClass(/danger/)
          await checkDialogGeometry(moduleRemove)
          await expect(dialog.getByRole('button', { name: t.cancel_0ec753be, exact: true })).toBeFocused()
          if (representative) {
            await moduleRemove.click()
            await expect.poll(() => writes.some((write) => write.view === 'run')).toBe(true)
            const submission = writes.find((write) => write.view === 'run')
            assert.equal(submission.action, 'module.remove')
            assert.deepEqual(submission.params, { target: 'fixture-module' })
            assert.equal(submission.fingerprint, 'fixture')
            assert.equal(submission.confirmation, 'fixture')
          } else await dialog.getByRole('button', { name: t.cancel_0ec753be, exact: true }).click()

          if (!representative)
            assert.deepEqual(
              writes.filter((write) => write.view === 'run'),
              [],
              'cancelled confirmations must not submit run requests; server plans for module preview are allowed',
            )
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            `${lang}/${theme}/${material}/${width} horizontal overflow`,
          )
          assert.deepEqual(errors, [], `${lang}/${theme}/${material}/${width} browser errors`)
          assert.deepEqual(consoleErrors, [], `${lang}/${theme}/${material}/${width} console errors`)
          matrix.push(`${lang}/${theme}/${material}/${width}`)
          await page.close()
        }
      }
    }
  }
  console.log(
    `PASS bespoke confirmation matrix ${matrix.length}/24; action labels and target/consequence checks, open-dialog geometry and focus, mocked network/module submissions, and cancel paths without run calls`,
  )
} finally {
  await browser.close()
}
