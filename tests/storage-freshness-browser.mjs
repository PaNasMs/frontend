import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const base = process.env.FRONTEND_TEST_URL ?? 'http://127.0.0.1:15175'
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  headless: true,
  args: ['--no-sandbox'],
})
const locale = async (language) =>
  JSON.parse(await readFile(new URL(`../src/i18n/locales/${language}.json`, import.meta.url)))

async function openFixture({ lang = 'en', theme = 'light', material = 'solid', width = 1440, fail } = {}) {
  const text = await locale(lang)
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  const query = new URLSearchParams({ lang, theme, material })
  if (fail) query.set('fail', fail)
  await page.goto(`${base}/tests/storage-freshness.html?${query}`)
  await expect(page.getByRole('heading', { name: text.storage_5347bdf6, exact: true })).toBeVisible()
  await expect(page.getByText('Fixture SATA Disk', { exact: true })).toBeVisible()
  const font = await page.evaluate(async () => {
    const faces = await document.fonts.load('16px "Manrope Variable"', 'Storage freshness')
    await document.fonts.ready
    return {
      family: getComputedStyle(document.body).fontFamily,
      loaded: faces.some((face) => face.family === 'Manrope Variable' && face.status === 'loaded'),
    }
  })
  assert.match(font.family, /Manrope Variable/)
  assert.ok(font.loaded, 'the actual Manrope face must load')
  return { page, text, errors }
}

async function fixtureState(page) {
  return page.evaluate(() => window.storageFreshnessFixture)
}

async function selectMounts(page, text) {
  const label = text['partitions_and_mounts_c5a470d6']
  const tab = page.getByRole('tab', { name: label, exact: true })
  if (await tab.count()) {
    await tab.click()
    return
  }
  await page
    .getByRole('button', { name: `${text.storage_5347bdf6}: ${text.disks_and_arrays_a0066b23}` })
    .click()
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click()
}

try {
  for (const lang of ['en', 'ru', 'uk']) {
    for (const theme of ['light', 'dark']) {
      for (const material of ['solid', 'glass']) {
        for (const width of [320, 1440]) {
          const { page, text, errors } = await openFixture({ lang, theme, material, width })
          await expect(page.getByText(/34 °C/)).toBeVisible()
          await page.getByRole('button', { name: 'Toggle cooling read failure' }).click()
          const retry = page.getByRole('button', { name: text.retry_9e506acb, exact: true })
          await expect(retry).toBeVisible()
          await expect(page.getByText(/34 °C \*/)).toBeVisible()
          const stalePrefix = text['storageRead.stale'].split('{{time}}')[0]
          const staleNotice = page.getByText(stalePrefix, { exact: false })
          await expect(staleNotice).toBeVisible()
          const staleNoticeText = await staleNotice.innerText()
          assert.ok(staleNoticeText.length > stalePrefix.length)
          const coolingStatus = page
            .locator('p.small.muted')
            .filter({ hasText: text['requested_power_9ddc5388'] })
          await expect(coolingStatus).toContainText(text['data_is_out_of_date_ea94b7bf'])
          await expect(coolingStatus).not.toContainText('35%')

          await page.getByRole('button', { name: 'SMART FIXTURE-001' }).click()
          const dialog = page.getByRole('dialog')
          await expect(dialog).toBeVisible()
          await expect(dialog.getByText(/34 °C/)).toHaveCount(0)
          await expect(dialog.getByText(stalePrefix, { exact: false })).toBeVisible()
          await expect(
            dialog.getByRole('button', { name: text.acknowledge_current_crc_count_3ad8bb52, exact: true }),
          ).toBeDisabled()
          await dialog.getByRole('button', { name: text.close_4ae50d30, exact: true }).click()

          await page.getByRole('button', { name: 'Allow retry without refreshing' }).click()
          await retry.click()
          await expect(retry).toHaveCount(0)
          await expect(page.getByText(/34 °C \*/)).toHaveCount(0)
          await page.getByRole('button', { name: 'SMART FIXTURE-001' }).click()
          const recoveredDialog = page.getByRole('dialog')
          await expect(
            recoveredDialog.getByRole('button', {
              name: text.acknowledge_current_crc_count_3ad8bb52,
              exact: true,
            }),
          ).toBeEnabled()
          await recoveredDialog.getByRole('button', { name: text.close_4ae50d30, exact: true }).click()

          const before = await fixtureState(page)
          await page.getByRole('button', { name: text.refresh_c2f668e5, exact: true }).click()
          await expect
            .poll(async () => {
              const after = await fixtureState(page)
              return ['storage', 'cooling', 'metrics', 'storage-options', 'preferences'].every(
                (view) => (after.reads[view] ?? 0) > (before.reads[view] ?? 0),
              )
            })
            .toBe(true)
          assert.ok(await page.evaluate(() => document.fonts.status === 'loaded'))
          assert.ok(await page.evaluate(() => document.fonts.check('16px "Manrope Variable"')))
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            `${lang}/${theme}/${material}/${width} horizontal overflow`,
          )
          assert.deepEqual(errors, [], `${lang}/${theme}/${material}/${width} browser errors`)
          assert.deepEqual((await fixtureState(page)).writes, [], 'the fixture must not complete any writes')
          await page.close()
          console.log(
            `${lang}/${theme}/${material}/${width}: cached cooling read, SMART guard, recovery and refresh passed`,
          )
        }
      }
    }
  }

  {
    const { page, text, errors } = await openFixture()
    await page.getByRole('button', { name: 'SMART FIXTURE-001' }).click()
    const dialog = page.getByRole('dialog')
    const acknowledge = dialog.getByRole('button', {
      name: text.acknowledge_current_crc_count_3ad8bb52,
      exact: true,
    })
    await expect(acknowledge).toBeEnabled()
    // Trigger a background failure through the fixture while the modal owns focus.
    await page
      .locator('nav[aria-label="Fixture controls"] button')
      .filter({ hasText: 'Toggle cooling read failure' })
      .evaluate((button) => button.click())
    await expect(acknowledge).toBeDisabled()
    await expect(dialog.getByText('Fixture cooling read failed', { exact: false })).toBeVisible()
    await page
      .locator('nav[aria-label="Fixture controls"] button')
      .filter({ hasText: 'Allow retry without refreshing' })
      .evaluate((button) => button.click())
    await dialog.getByRole('button', { name: text.retry_9e506acb, exact: true }).click()
    await expect(acknowledge).toBeEnabled()
    await expect(dialog).toBeVisible()
    assert.deepEqual((await fixtureState(page)).writes, [])
    assert.deepEqual(errors, [])
    await page.close()
    console.log('open SMART dialog: background failure disables CRC and in-dialog retry restores fresh data')
  }

  {
    const { page, text, errors } = await openFixture({ fail: 'cooling' })
    await expect(page.getByRole('button', { name: text.retry_9e506acb, exact: true })).toBeVisible()
    await expect(page.getByText(/34 °C/)).toHaveCount(0)
    await expect(page.locator('.disk-status strong')).toContainText('—')
    await page.getByRole('button', { name: 'Allow retry without refreshing' }).click()
    await page.getByRole('button', { name: text.retry_9e506acb, exact: true }).click()
    await expect(page.getByText(/34 °C/)).toBeVisible()
    assert.deepEqual(errors, [])
    await page.close()
    console.log(
      'initial cooling read failure: no fabricated temperature; retry loaded a real fixture reading',
    )
  }

  {
    const { page, text, errors } = await openFixture({ fail: 'storage-options' })
    const retry = page.getByRole('button', { name: text.retry_9e506acb, exact: true })
    await expect(retry.first()).toBeVisible()
    await selectMounts(page, text)
    await page.getByRole('button', { name: /Fixture volume/ }).click()
    await expect(page.getByText(text['storageRead.actionsUnavailable'], { exact: false })).toBeVisible()
    await expect(page.getByText(text['checking_available_actions_8f7ab614'], { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: text['mount_options_64cffcf3'], exact: true })).toHaveCount(
      0,
    )
    await page.getByRole('button', { name: 'Allow retry without refreshing' }).click()
    await retry.last().click()
    await expect(retry).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: text['mount_options_64cffcf3'], exact: true }),
    ).toBeVisible()
    assert.deepEqual((await fixtureState(page)).writes, [])
    assert.deepEqual(errors, [])
    await page.close()
    console.log('initial storage options failure: selected volume exposed recovery and restored its controls')
  }

  {
    const { page, text, errors } = await openFixture()
    await selectMounts(page, text)
    await page.getByRole('button', { name: /Fixture volume/ }).click()
    await expect(
      page.getByRole('button', { name: text['mount_options_64cffcf3'], exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Toggle storage options failure' }).click()
    await expect(page.getByText(text['storageRead.actionsUnavailable'], { exact: false })).toBeVisible()
    await expect(page.getByText(text['checking_available_actions_8f7ab614'], { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: text['mount_options_64cffcf3'], exact: true })).toHaveCount(
      0,
    )
    await page.getByRole('button', { name: 'Allow retry without refreshing' }).click()
    await page.getByRole('button', { name: text.retry_9e506acb, exact: true }).last().click()
    await expect(
      page.getByRole('button', { name: text['mount_options_64cffcf3'], exact: true }),
    ).toBeVisible()
    assert.deepEqual((await fixtureState(page)).writes, [])
    assert.deepEqual(errors, [])
    await page.close()
    console.log(
      'post-success storage options failure: selected mount stayed visible and retry restored actions',
    )
  }
} finally {
  await browser.close()
}
