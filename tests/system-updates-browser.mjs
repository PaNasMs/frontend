import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const base = process.env.FRONTEND_TEST_URL ?? 'http://127.0.0.1:15174'
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  headless: true,
  args: ['--no-sandbox'],
})
try {
  for (const lang of ['en', 'ru', 'uk']) {
    const text = JSON.parse(await readFile(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url)))
    for (const theme of ['light', 'dark'])
      for (const material of ['solid', 'glass'])
        for (const width of [320, 1440]) {
          const page = await browser.newPage({ viewport: { width, height: 900 } })
          const errors = []
          page.on('pageerror', (error) => errors.push(error.message))
          let failRead = true,
            releaseRead
          let hold = new Promise((resolve) => {
            releaseRead = resolve
          })
          let writes = [],
            reads = 0,
            job
          let state = {
            settings: { channel: 'testing', mode: 'auto', hour: 7 },
            installed: { 'panasms-prototype': '0.2.39-fixture' },
            candidate: null,
            checkedAt: '2026-11-14T10:00:00Z',
            available: false,
            busy: false,
            rollbackAvailable: true,
            state: {},
            history: [],
          }
          await page.route('**/api/v1/**', async (route) => {
            const url = new URL(route.request().url())
            const view = url.searchParams.get('view')
            if (view === 'system-updates') {
              reads++
              await hold
              return failRead
                ? route.fulfill({ status: 503, json: { error: 'Read unavailable' } })
                : route.fulfill({ json: state })
            }
            if (view === 'plan' || view === 'run') {
              const body = route.request().postDataJSON()
              writes.push({ view, ...body })
              if (view === 'plan')
                return route.fulfill({ json: { fingerprint: 'fixture', confirmation: '' } })
              assert.equal(body.action, 'system.update.settings')
              state = { ...state, settings: body.params }
              job = { id: body.id, status: 'succeeded', stage: 'complete' }
              return route.fulfill({ json: { id: body.id } })
            }
            if (view === 'jobs') return route.fulfill({ json: job ? [job] : [] })
            return route.fulfill({ json: [] })
          })
          await page.goto(
            `${base}/tests/system-updates.html?lang=${lang}&theme=${theme}&material=${material}`,
          )
          const apply = page.getByRole('button', { name: text.apply_768af677, exact: true })
          const retry = page.getByRole('button', { name: text['up.retry'], exact: true })
          const channel = page.getByRole('combobox', { name: text['up.channel'], exact: true })
          const mode = page.getByRole('combobox', { name: text['up.mode'], exact: true })
          const hour = page.getByRole('combobox', { name: text['up.hour'], exact: true })
          const refresh = page.getByRole('button', { name: 'Refresh test data' })
          await expect(page.getByText(text['up.loading'], { exact: true })).toBeVisible()
          await expect(channel).toHaveCount(0)
          await expect(apply).toHaveCount(0)
          releaseRead()
          hold = null
          await expect(retry).toBeVisible()
          await expect(page.getByText(text['up.none'], { exact: true })).toHaveCount(0)
          await expect(page.getByText(text['up.empty'], { exact: true })).toHaveCount(0)
          await expect(page.getByRole('button', { name: text['up.check'], exact: true })).toBeDisabled()
          assert.equal(writes.length, 0)
          failRead = false
          await retry.click()
          await expect(channel).toHaveValue('testing')
          await expect(mode).toHaveValue('auto')
          await expect(hour).toHaveValue('7')
          await expect(apply).toBeDisabled()
          await hour.selectOption('9')
          await expect(apply).toBeEnabled()
          const before = reads
          await refresh.click()
          await expect.poll(() => reads).toBeGreaterThan(before)
          await expect(hour).toHaveValue('9')
          failRead = true
          await refresh.click()
          await expect(retry).toBeVisible()
          await expect(
            page.getByRole('status').filter({ hasText: text['up.stale'].split('{{time}}')[0] }),
          ).toBeVisible()
          await expect(page.getByText('0.2.39-fixture', { exact: true })).toBeVisible()
          await expect(hour).toHaveValue('9')
          await expect(hour).toBeDisabled()
          await expect(apply).toBeDisabled()
          await page.locator('form').evaluate((form) => form.requestSubmit())
          await page.waitForTimeout(150)
          assert.equal(writes.length, 0)
          failRead = false
          state = { ...state, settings: { ...state.settings, hour: 8 } }
          await retry.click()
          const reload = page.getByRole('button', { name: text['oled.reload'], exact: true })
          await expect(reload).toBeVisible()
          await expect(hour).toHaveValue('9')
          await expect(apply).toBeDisabled()
          await reload.click()
          await expect(hour).toHaveValue('8')
          await hour.selectOption('10')
          await apply.click()
          await expect(apply).toBeDisabled()
          await expect.poll(() => writes.length).toBe(2)
          assert.deepEqual(writes[1].params, { channel: 'testing', mode: 'auto', hour: 10 })
          await expect(reload).toHaveCount(0)
          await expect(hour).toHaveValue('10')
          await expect(
            page.getByRole('status').filter({ hasText: text['up.stale'].split('{{time}}')[0] }),
          ).toHaveCount(0)
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            `${lang}/${theme}/${material}/${width} overflow`,
          )
          if (lang === 'en' && theme === 'light' && material === 'solid' && width === 1440) {
            await page.getByRole('button', { name: text['up.rollback'], exact: true }).click()
            const dialog = page.getByRole('dialog')
            failRead = true
            const dialogRetry = dialog.getByRole('button', { name: text['up.retry'], exact: true })
            await expect(dialogRetry).toBeVisible({ timeout: 10000 })
            await expect(
              dialog.getByRole('button', { name: text['homes.confirmButton'], exact: true }),
            ).toBeDisabled()
            assert.equal(writes.length, 2)
            failRead = false
            await dialogRetry.click()
            await expect(
              dialog.getByRole('button', { name: text['homes.confirmButton'], exact: true }),
            ).toBeEnabled()
            await dialog.getByRole('button', { name: text.cancel_0ec753be, exact: true }).click()
            await expect(dialog).toHaveCount(0)
            assert.equal(writes.length, 2)
          }
          assert.deepEqual(errors, [])
          await page.close()
          console.log(
            `${lang}/${theme}/${material}/${width}: update read, retry, stale draft and save passed`,
          )
        }
  }
} finally {
  await browser.close()
}
