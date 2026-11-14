import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  headless: true,
  args: ['--no-sandbox'],
})

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors = []
  const consoleErrors = []
  const fontResponses = []
  const failedResponses = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push({ text: message.text(), location: message.location() })
  })
  page.on('response', (response) => {
    if (response.request().resourceType() === 'font' && /manrope/i.test(response.url()))
      fontResponses.push({ url: response.url(), status: response.status() })
    if (response.status() >= 400) failedResponses.push({ url: response.url(), status: response.status() })
  })
  const baseUrl = process.env.OPERATION_CONFIRMATIONS_TEST_URL ?? 'http://127.0.0.1:15176'
  const fixtureUrl = baseUrl + '/tests/operation-confirmations.html'
  const state = () => page.evaluate(() => window.operationConfirmationFixture)
  const open = async (label) => page.getByRole('button', { name: label, exact: true }).click()
  const review = async (lang = 'en') => {
    const labels = {
      en: { continue: 'Continue', confirmation: 'Confirmation' },
      ru: { continue: 'Продолжить', confirmation: 'Подтверждение' },
      uk: { continue: 'Продовжити', confirmation: 'Підтвердження' },
    }[lang]
    await page.getByRole('button', { name: labels.continue, exact: true }).click()
    await expect(page.getByRole('heading', { name: labels.confirmation, exact: true })).toBeVisible()
  }
  const runCount = async () => (await state()).runs.length

  await page.goto(fixtureUrl + '?hold=1')
  const formatTrigger = page.getByRole('button', { name: 'Format fixture volume', exact: true })
  await formatTrigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect.poll(async () => (await state()).pendingPlanReleases.length).toBe(1)
  await page.evaluate(() => window.operationConfirmationFixture.pendingPlanReleases.shift()?.())
  await expect(page.getByRole('heading', { name: 'Confirmation', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  assert.equal((await state()).plans.length, 1, 'the real OperationButton must request a review plan')
  assert.equal(await runCount(), 0, 'review alone must not submit an operation')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(formatTrigger).toBeFocused()
  assert.equal(await runCount(), 0, 'Cancel after review must not submit')
  await page.goto(fixtureUrl)

  // A second reviewed operation can be dismissed with Escape without a run request.
  await open('Format fixture volume')
  await review()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  assert.equal(await runCount(), 0, 'Escape after review must not submit')

  // Check that confirmation submits the reviewed action, parameters and server tokens verbatim.
  await open('Format fixture volume')
  await review()
  const reviewedPlan = (await state()).plans.at(-1)
  await page.getByRole('button', { name: /Format volume/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const submitted = (await state()).runs.at(-1)
  assert.deepEqual(submitted, {
    id: submitted.id,
    action: 'filesystem.format',
    params: reviewedPlan.params,
    fingerprint: 'fixture-fingerprint:filesystem.format',
    confirmation: 'fixture-confirmation:filesystem.format',
  })
  assert.deepEqual(reviewedPlan, {
    action: 'filesystem.format',
    params: {
      target: 'Fixture volume · /dev/mapper/' + 'panasms-bay-01-long-target-'.repeat(3) + 'data',
      format: 'ext4',
    },
  })

  // Snapshot confirmation repeats the snapshot name and restore destination semantics.
  await open('Restore fixture snapshot')
  await review()
  const restoreReview = (await state()).plans.at(-1)
  const restoreDialog = page.getByRole('dialog')
  await expect(restoreDialog.getByText('/mnt/fixture · snapshot-2026-11-14', { exact: true })).toBeVisible()
  await expect(restoreDialog.getByRole('heading', { name: 'Restore snapshot to a new folder' })).toBeVisible()
  await restoreDialog.getByRole('button', { name: /snapshot to a new folder/i }).click()
  const restoreRun = (await state()).runs.at(-1)
  assert.equal(restoreReview.action, 'filesystem.snapshot-restore')
  assert.deepEqual(restoreRun.params, restoreReview.params)
  assert.equal(restoreRun.params.snapshot, 'snapshot-2026-11-14')
  assert.equal(restoreRun.params.name, 'restored-fixture')
  assert.equal(restoreRun.fingerprint, 'fixture-fingerprint:filesystem.snapshot-restore')
  assert.equal(restoreRun.confirmation, 'fixture-confirmation:filesystem.snapshot-restore')

  await open('Delete fixture snapshot')
  await review()
  const snapshotDeleteDialog = page.getByRole('dialog')
  await expect(
    snapshotDeleteDialog.getByText('/mnt/fixture · snapshot-2026-11-14', { exact: true }),
  ).toBeVisible()
  const deletePlan = (await state()).plans.at(-1)
  await snapshotDeleteDialog.getByRole('button', { name: /Delete snapshot/ }).click()
  const deleteRun = (await state()).runs.at(-1)
  assert.equal(deletePlan.action, 'filesystem.snapshot-delete')
  assert.deepEqual(deleteRun.params, deletePlan.params)
  assert.equal(deleteRun.params.snapshot, 'snapshot-2026-11-14')
  assert.equal(deleteRun.fingerprint, 'fixture-fingerprint:filesystem.snapshot-delete')
  assert.equal(deleteRun.confirmation, 'fixture-confirmation:filesystem.snapshot-delete')

  // File removal keeps its three distinct decisions and names the target in the prompt.
  await open('Remove fixture file')
  let fileDialog = page.getByRole('dialog')
  await expect(fileDialog.getByRole('button', { name: 'Move to trash', exact: true })).toBeVisible()
  await expect(fileDialog.getByText('long-fixture-name.txt', { exact: true })).toBeVisible()
  await expect(fileDialog.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
  await expect(fileDialog.getByRole('button', { name: 'Move to trash', exact: true })).toBeVisible()
  await expect(fileDialog.getByRole('button', { name: 'Delete', exact: true })).toBeVisible()
  const trashPlan = (await state()).plans.at(-1)
  await fileDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(await runCount(), 3, 'file Cancel must not submit')
  assert.equal(trashPlan.action, 'file.trash')

  await open('Remove fixture file')
  fileDialog = page.getByRole('dialog')
  await expect(fileDialog.getByRole('button', { name: 'Move to trash', exact: true })).toBeVisible()
  const trashSubmissionPlan = (await state()).plans.at(-1)
  await fileDialog.getByRole('button', { name: 'Move to trash', exact: true }).click()
  const trashSubmission = (await state()).runs.at(-1)
  assert.equal(trashSubmissionPlan.action, 'file.trash')
  assert.equal(trashSubmission.action, 'file.trash')
  assert.deepEqual(trashSubmission.params, trashSubmissionPlan.params)
  assert.equal(trashSubmission.fingerprint, 'fixture-fingerprint:file.trash')
  assert.equal(trashSubmission.confirmation, 'fixture-confirmation:file.trash')

  await open('Delete fixture file')
  fileDialog = page.getByRole('dialog')
  await expect(fileDialog.getByText('long-fixture-name.txt', { exact: true })).toBeVisible()
  await expect(fileDialog.getByRole('button', { name: 'Move to trash', exact: true })).toBeDisabled()
  await expect(fileDialog.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled()
  const permanentDeletePlan = (await state()).plans.at(-1)
  await fileDialog.getByRole('button', { name: 'Delete', exact: true }).click()
  const permanentDeleteRun = (await state()).runs.at(-1)
  assert.equal(permanentDeletePlan.action, 'file.delete')
  assert.equal(permanentDeleteRun.action, 'file.delete')
  assert.deepEqual(permanentDeleteRun.params, permanentDeletePlan.params)
  assert.equal(permanentDeleteRun.fingerprint, 'fixture-fingerprint:file.delete')
  assert.equal(permanentDeleteRun.confirmation, 'fixture-confirmation:file.delete')

  // Exercise all locales, all four surfaces and narrow/wide viewport geometry.
  for (const lang of ['en', 'ru', 'uk'])
    for (const theme of ['light', 'dark'])
      for (const material of ['solid', 'glass'])
        for (const width of [320, 1440]) {
          await page.setViewportSize({ width, height: 900 })
          await page.goto(fixtureUrl + '?lang=' + lang + '&theme=' + theme + '&material=' + material)
          const combination = lang + '/' + theme + '/' + material + '/' + width
          assert.equal(await page.locator('html').getAttribute('data-theme'), theme)
          assert.equal(await page.locator('html').getAttribute('data-surface'), material)
          const loadedFontCount = await page.evaluate(async () => {
            await document.fonts.ready
            return (await document.fonts.load('16px \"Manrope Variable\"')).length
          })
          assert.ok(loadedFontCount > 0, combination + ': no Manrope font face was loaded')
          assert.match(
            await page.locator('body').evaluate((element) => getComputedStyle(element).fontFamily),
            /Manrope/i,
            combination + ': body does not use Manrope',
          )
          assert.ok(
            fontResponses.some((font) => font.status === 200),
            combination + ': Manrope font request did not return HTTP 200',
          )
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            combination + ': page horizontal overflow',
          )

          await open('Format fixture volume')
          await review(lang)
          const dialog = page.getByRole('dialog')
          const layout = await dialog.evaluate((element) => {
            const footer = element.querySelector('.actions')
            const buttons = [...footer.querySelectorAll('button')]
            const rect = (node) => {
              const { left, right, top, bottom, width: elementWidth } = node.getBoundingClientRect()
              return { left, right, top, bottom, width: elementWidth }
            }
            return {
              viewport: { width: innerWidth, height: innerHeight },
              dialog: rect(element),
              footer: rect(footer),
              buttons: buttons.map((button) => ({ name: button.innerText, ...rect(button) })),
              hitTargets: buttons.map((button) => {
                const box = button.getBoundingClientRect()
                const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
                return target === button || button.contains(target)
              }),
              text: element.innerText,
            }
          })
          assert.ok(
            layout.dialog.left >= 0 && layout.dialog.right <= width,
            combination + ': dialog outside viewport',
          )
          assert.ok(
            layout.footer.left >= 0 && layout.footer.right <= width,
            combination + ': footer outside viewport',
          )
          assert.ok(
            layout.buttons.every(
              (button) =>
                button.left >= 0 && button.right <= width && button.bottom <= layout.viewport.height,
            ),
            combination + ': button outside viewport',
          )
          assert.ok(layout.hitTargets.every(Boolean), combination + ': button center hit test failed')
          assert.ok(
            layout.buttons.every((button) => button.width >= 40),
            combination + ': decision button hit area is too narrow',
          )
          if (width === 320)
            assert.ok(layout.buttons[1].width > 250, combination + ': long target action needs its own row')
          assert.ok(!layout.text.includes('operation.'), combination + ': untranslated operation key')
          await page.keyboard.press('Escape')
          await expect(page.getByRole('dialog')).toHaveCount(0)

          if (width === 320) {
            await open('Delete fixture file')
            const dangerButton = page.getByRole('dialog').locator('button.danger')
            await expect(dangerButton).toBeEnabled()
            const dangerBox = await dangerButton.boundingBox()
            if (lang === 'en' && theme === 'light' && material === 'solid')
              await page.screenshot({ path: '/tmp/operation-confirmations-320.png', fullPage: true })
            await expect(async () => {
              const choices = await page
                .getByRole('dialog')
                .locator('.modal-footer button')
                .evaluateAll((buttons) =>
                  buttons.map((button) => {
                    const rect = button.getBoundingClientRect()
                    return (
                      rect.left >= 0 &&
                      rect.right <= innerWidth &&
                      rect.top >= 0 &&
                      rect.bottom <= innerHeight &&
                      button.contains(
                        document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2),
                      )
                    )
                  }),
                )
              assert.equal(choices.length, 3, combination + ': file removal must retain all three decisions')
              assert.ok(choices.every(Boolean), combination + ': file removal choice is not reachable')
            }).toPass()
            assert.ok(
              dangerBox.x >= 0 && dangerBox.x + dangerBox.width <= width,
              combination + ': danger action overflows horizontally',
            )
            assert.ok(
              dangerBox.y + dangerBox.height <= 900,
              combination + ': danger action falls below the viewport',
            )
            await page.keyboard.press('Escape')
            await expect(page.getByRole('dialog')).toHaveCount(0)
          }
        }

  assert.deepEqual(pageErrors, [], 'browser page errors: ' + pageErrors.join('; '))
  assert.deepEqual(
    consoleErrors,
    [],
    'browser console errors: ' +
      JSON.stringify(consoleErrors) +
      '; failed responses: ' +
      JSON.stringify(failedResponses),
  )
  console.log(
    'PASS operation confirmations: real async review/cancel focus, exact reviewed submissions, file and snapshot decisions, EN/RU/UK × four themes × 320/1440 layout, loaded font, overflow and button hit testing',
  )
} finally {
  await browser.close()
}
