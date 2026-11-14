import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox'],
})
const baseURL = process.env.ACCESS_CONFIRMATIONS_TEST_URL ?? 'http://127.0.0.1:15178'
const fixtureURL = new URL('/tests/access-confirmations.html', baseURL)
const keyOne = {
  id: 'key-fixture-laptop-001',
  comment: 'Studio laptop',
  fingerprint: 'SHA256:fixtureFingerprintAlpha1111111111111111111111111111',
}
const keyTwo = {
  id: 'key-fixture-laptop-002',
  comment: 'Studio laptop backup for the upstairs home office workstation',
  fingerprint: 'SHA256:fixtureFingerprintBravo2222222222222222222222222222',
}
const sessionOne = {
  id: 'panel-session-fixture-current',
  address: '192.0.2.41',
  device: 'Studio laptop · Chrome profile in the upstairs home office',
}
const sessionTwo = {
  id: 'panel-session-fixture-other',
  address: '192.0.2.42',
  device: 'Studio laptop · Chrome profile in the upstairs home office',
}
const sshTwo = {
  id: 'ssh-session-fixture-two',
  address: '192.0.2.52',
}
const telegramName = 'Studio Telegram account for the upstairs home office'
const deviceOne = 'abcd1234' + '1'.repeat(56)
const deviceTwo = 'abcd1234' + '2'.repeat(56)
const languages = ['en', 'ru', 'uk']
const themes = [
  { theme: 'light', surface: 'solid' },
  { theme: 'light', surface: 'glass' },
  { theme: 'dark', surface: 'solid' },
  { theme: 'dark', surface: 'glass' },
]
const widths = [320, 1440]

function url(path, lang, theme, surface) {
  const result = new URL(fixtureURL)
  result.search = new URLSearchParams({
    path,
    lang,
    theme,
    surface,
  })
  return result.href
}

async function openProfile(
  page,
  path = '/profile/security',
  lang = 'en',
  theme = 'light',
  surface = 'solid',
  width = 1440,
) {
  await page.setViewportSize({ width, height: 900 })
  await page.goto(url(path, lang, theme, surface))
  await expect(page.locator('.key-card')).toHaveCount(2)
  const fonts = await page.evaluate(async (sample) => {
    await document.fonts.ready
    const loaded = await document.fonts.load('16px "Manrope Variable"', sample)
    return {
      count: loaded.filter((face) => face.family === 'Manrope Variable' && face.status === 'loaded').length,
      family: getComputedStyle(document.body).fontFamily,
      checked: document.fonts.check('16px "Manrope Variable"', sample),
    }
  }, keyTwo.comment)
  assert.ok(fonts.count > 0, 'Manrope Variable should have an actually loaded face')
  assert.match(fonts.family, /Manrope Variable/)
  assert.equal(fonts.checked, true)
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
  await expect(page.locator('html')).toHaveAttribute('data-surface', surface)
}

async function state(page, key) {
  return page.evaluate((name) => window.accessConfirmationFixture[name], key)
}

async function hasRelease(page, key) {
  return page.evaluate((name) => typeof window.accessConfirmationFixture[name] === 'function', key)
}

async function writes(page) {
  return page.evaluate(() => window.accessConfirmationFixture.writes)
}

async function fixtureAction(page, action) {
  await page.evaluate(async (name) => window.accessConfirmationFixture[name](), action)
}

async function navigate(page, path) {
  await page.evaluate(async (next) => window.accessConfirmationFixture.navigate(next), path)
}

async function keyTrigger(page, comment) {
  const card = page.locator('.key-card').filter({ has: page.getByText(comment, { exact: true }) })
  await expect(card).toBeVisible()
  const trigger = card.getByRole('button')
  await trigger.click()
  return trigger
}

async function panelSessionTrigger(page, address) {
  const card = page.locator('.user-session-list article').filter({ hasText: address })
  await expect(card).toBeVisible()
  const trigger = card.getByRole('button')
  await trigger.click()
  return trigger
}

async function sshSessionTrigger(page, address) {
  const card = page.locator('.user-session-list article').filter({ hasText: address })
  await expect(card).toBeVisible()
  const trigger = card.getByRole('button')
  await trigger.click()
  return trigger
}

async function deviceTrigger(page, id) {
  const row = page
    .locator('.delivery-device')
    .filter({ hasText: id.slice(0, 8) })
    .last()
  await expect(row).toBeVisible()
  const trigger = row.getByRole('button')
  await trigger.click()
  return trigger
}

async function telegramTrigger(page) {
  const card = page.locator('section.surface').nth(1)
  await expect(card).toContainText(telegramName)
  const buttons = card.locator('button[aria-label]')
  await expect(buttons).toHaveCount(2)
  const trigger = buttons.last()
  await trigger.click({ timeout: 3000 })
  return trigger
}

async function assertConfirmation(page, expectedText, width) {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  for (const text of expectedText) await expect(dialog).toContainText(text)
  const cancel = dialog.locator('.modal-footer [data-dialog-cancel]:not(.close-icon)')
  const danger = dialog.locator('.modal-footer button.danger')
  await expect(cancel).toBeFocused()
  await expect(danger).toBeVisible()
  await expect(danger).toBeEnabled()
  await expect(async () => {
    const measured = await dialog.evaluate((element) => {
      const box = (node) => {
        const rect = node.getBoundingClientRect()
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        }
      }
      const header = element.querySelector('.modal-header')
      const footer = element.querySelector('.modal-footer')
      const controls = [...element.querySelectorAll('.modal-footer button')].map((button) => {
        const rect = button.getBoundingClientRect()
        const points = [
          [rect.left + rect.width / 2, rect.top + rect.height / 2],
          [rect.left + 4, rect.top + rect.height / 2],
          [rect.right - 4, rect.top + rect.height / 2],
          [rect.left + rect.width / 2, rect.top + 4],
          [rect.left + rect.width / 2, rect.bottom - 4],
        ]
        const hits = points.map(([x, y]) => {
          const target = document.elementFromPoint(x, y)
          return target === button || button.contains(target)
        })
        return { name: button.innerText, box: box(button), hits }
      })
      return {
        dialog: box(element),
        header: header ? box(header) : null,
        footer: footer ? box(footer) : null,
        controls,
        viewport: { width: innerWidth, height: innerHeight },
      }
    })
    assert.ok(measured.dialog.left >= 0 && measured.dialog.right <= width, 'dialog must fit viewport width')
    assert.ok(
      measured.dialog.top >= 0 && measured.dialog.bottom <= measured.viewport.height,
      'dialog must fit viewport height',
    )
    for (const [name, box] of [
      ['header', measured.header],
      ['footer', measured.footer],
    ]) {
      assert.ok(box, `${name} must be present`)
      assert.ok(box.left >= 0 && box.right <= width, `${name} must fit viewport width`)
      assert.ok(box.top >= 0 && box.bottom <= measured.viewport.height, `${name} must remain reachable`)
    }
    assert.ok(
      measured.controls.every((control) => control.box.left >= 0 && control.box.right <= width),
      'confirmation controls must remain inside the viewport',
    )
    assert.ok(
      measured.controls.every(
        (control) => control.box.top >= 0 && control.box.bottom <= measured.viewport.height,
      ),
      'confirmation controls must remain vertically reachable',
    )
    assert.ok(
      measured.controls.every((control) => control.box.width >= 43.9 && control.box.height >= 43.9),
      'confirmation controls must meet the 44 CSS pixel target size',
    )
    assert.ok(
      measured.controls.every((control) => control.hits.every(Boolean)),
      'confirmation controls must pass center and inset-edge hit tests',
    )
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'confirmation must not cause page horizontal overflow',
    )
  }).toPass({ timeout: 3000 })
  return { dialog, cancel, danger }
}

async function assertRuntime(page, fontResponses, errors, httpFailures, expectedFailures = []) {
  assert.ok(fontResponses.length > 0, 'a Manrope font resource must load successfully')
  assert.deepEqual(errors, [], 'browser console and page errors: ' + errors.join('; '))
  assert.deepEqual(httpFailures.sort(), [], 'unexpected real browser HTTP responses failed')
  assert.deepEqual(
    (await state(page, 'failedResponses')).sort(),
    expectedFailures.sort(),
    'mock failure responses',
  )
  assert.ok(
    await page.evaluate((sample) => document.fonts.check('16px "Manrope Variable"', sample), keyTwo.comment),
    'Manrope should remain available after interactions',
  )
}

try {
  // Each locale, theme, surface and viewport exercises every access confirmation without submitting it.
  for (const lang of languages) {
    for (const { theme, surface } of themes) {
      for (const width of widths) {
        const page = await browser.newPage({ viewport: { width, height: 900 } })
        const errors = []
        const fontResponses = []
        const httpFailures = []
        page.on('pageerror', (error) => errors.push(error.message))
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text())
        })
        page.on('response', (response) => {
          if (response.request().resourceType() === 'font' && response.status() === 200)
            fontResponses.push(response.url())
          if (response.status() >= 400) {
            const pathname = new URL(response.url()).pathname
            httpFailures.push(`${pathname}:${response.status()}`)
          }
        })

        await openProfile(page, '/profile/security', lang, theme, surface, width)
        await page.locator('.profile-keys input[type="password"]').fill('fixture-password')
        await keyTrigger(page, keyTwo.comment)
        let current = await assertConfirmation(page, [keyTwo.comment, keyTwo.fingerprint], width)
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(
          page.locator('.key-card').filter({ hasText: keyTwo.comment }).getByRole('button'),
        ).toBeFocused()

        await navigate(page, '/profile/activity')
        await expect(page.locator('.user-session-list article')).toHaveCount(4)
        await panelSessionTrigger(page, sessionTwo.address)
        current = await assertConfirmation(page, [sessionTwo.device, sessionTwo.address], width)
        await expect(current.dialog).not.toContainText('192.0.2.41')
        await current.cancel.click()
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(
          page
            .locator('.user-session-list article')
            .filter({ hasText: sessionTwo.address })
            .getByRole('button'),
        ).toBeFocused()

        await sshSessionTrigger(page, sshTwo.address)
        current = await assertConfirmation(page, [sshTwo.address, sshTwo.id], width)
        await current.cancel.click()
        await expect(page.getByRole('dialog')).toHaveCount(0)
        assert.equal(
          (await writes(page)).filter((write) => write.path.endsWith('?view=run')).length,
          0,
          'Escape/Cancel must not run an SSH session operation',
        )

        await navigate(page, '/profile/notifications')
        await expect(page.locator('.delivery-device')).toHaveCount(2)
        await deviceTrigger(page, deviceTwo)
        current = await assertConfirmation(page, [deviceTwo], width)
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(
          page
            .locator('.delivery-device')
            .filter({ hasText: deviceTwo.slice(0, 8) })
            .last()
            .getByRole('button'),
        ).toBeFocused()

        await telegramTrigger(page)
        current = await assertConfirmation(page, [telegramName], width)
        await current.cancel.click()
        await expect(page.getByRole('dialog')).toHaveCount(0)
        assert.equal(
          (await writes(page)).filter((write) => write.path.endsWith('notification-telegram-link')).length,
          0,
        )
        assert.equal(
          (await writes(page)).filter((write) => write.path.endsWith('notification-push')).length,
          0,
        )
        assert.equal((await writes(page)).filter((write) => write.path.endsWith('/profile')).length, 0)
        assert.equal((await writes(page)).filter((write) => write.path.includes('/sessions?')).length, 0)
        await assertRuntime(page, fontResponses, errors, httpFailures)
        await page.close()
      }
    }
  }

  // The shared discard confirmation keeps its default primary style and preserves the draft on Cancel/Escape.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await openProfile(page)
    const publicKey = page.locator('.profile-keys textarea')
    await page.locator('.profile-keys input[type="password"]').fill('fixture-password')
    await publicKey.fill('ssh-ed25519 AAAAFixture draft-key')
    await expect(page.getByRole('button', { name: 'Add key' })).toBeEnabled()
    await page.getByRole('tab', { name: 'Sessions & history' }).click()
    let dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.modal-footer button.primary')).toBeVisible()
    await expect(dialog.locator('.modal-footer button.danger')).toHaveCount(0)
    await expect(dialog.locator('.modal-footer [data-dialog-cancel]:not(.close-icon)')).toBeFocused()
    await dialog.locator('.modal-footer [data-dialog-cancel]:not(.close-icon)').click()
    await expect(page.getByRole('tab', { name: 'Security' })).toHaveAttribute('aria-selected', 'true')
    await expect(publicKey).toHaveValue('ssh-ed25519 AAAAFixture draft-key')
    await page.getByRole('tab', { name: 'Sessions & history' }).click()
    dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Security' })).toHaveAttribute('aria-selected', 'true')
    await expect(publicKey).toHaveValue('ssh-ed25519 AAAAFixture draft-key')
    assert.equal((await writes(page)).length, 0)
    await publicKey.fill('')
    await page.close()
  }

  // Key selection remains bound to the selected object through reorder, pending save and a rejected write.
  {
    const page = await browser.newPage({ viewport: { width: 320, height: 900 } })
    await openProfile(page, '/profile/security', 'en', 'dark', 'glass', 320)
    await page.locator('.profile-keys input[type="password"]').fill('fixture-password')

    let trigger = await keyTrigger(page, keyOne.comment)
    let current = await assertConfirmation(page, [keyOne.comment, keyOne.fingerprint], 320)
    await current.cancel.click()
    await expect(trigger).toBeFocused()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    trigger = await keyTrigger(page, keyOne.comment)
    await assertConfirmation(page, [keyOne.comment, keyOne.fingerprint], 320)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    assert.equal((await writes(page)).length, 0, 'Cancel and Escape must not delete a key')

    await page.evaluate(() => {
      window.accessConfirmationFixture.keys.reverse()
      window.accessConfirmationFixture.keyWriteMode = 'hold'
    })
    trigger = await keyTrigger(page, keyTwo.comment)
    current = await assertConfirmation(page, [keyTwo.comment, keyTwo.fingerprint], 320)
    await fixtureAction(page, 'refresh')
    await current.dialog.getByText(keyTwo.fingerprint, { exact: true }).waitFor()
    await current.danger.click()
    await expect.poll(() => hasRelease(page, 'releaseKeyWrite')).toBe(true)
    await expect(current.dialog).toContainText(keyTwo.comment)
    await expect(current.dialog.locator('.modal-footer button.danger')).toBeDisabled()
    await page.evaluate(() => window.accessConfirmationFixture.releaseKeyWrite?.())
    await expect(page.getByRole('dialog')).toHaveCount(0)
    let requests = await writes(page)
    const successfulKeyWrite = requests.find(
      (write) => write.path === '/api/v1/profile' && write.method === 'POST',
    )
    assert.equal(successfulKeyWrite.body.id, keyTwo.id)
    assert.equal(successfulKeyWrite.body.currentPassword, 'fixture-password')

    await page.locator('.profile-keys input[type="password"]').fill('fixture-password')
    trigger = await keyTrigger(page, keyOne.comment)
    await assertConfirmation(page, [keyOne.comment, keyOne.fingerprint], 320)
    await page.evaluate(() => {
      window.accessConfirmationFixture.keyWriteMode = 'fail'
    })
    await page.getByRole('dialog').locator('.modal-footer button.danger').click()
    current = { dialog: page.getByRole('dialog') }
    await expect(current.dialog.getByText('Fixture key removal rejected')).toBeVisible()
    await expect.poll(() => state(page, 'failedResponses')).toEqual(['/api/v1/profile:503'])
    await expect(current.dialog).toContainText(keyOne.comment)
    await expect(current.dialog).toContainText(keyOne.fingerprint)
    await current.dialog.locator('.modal-footer [data-dialog-cancel]:not(.close-icon)').click()
    await expect(current.dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    requests = await writes(page)
    const failedKeyWrite = requests
      .filter((write) => write.path === '/api/v1/profile' && write.method === 'POST')
      .at(-1)
    assert.equal(failedKeyWrite.body.id, keyOne.id)
    await page.close()
  }

  // Panel session selection keeps its address/device identity after refresh; the current session is explicitly marked.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await openProfile(page, '/profile/activity')
    const ownTrigger = await panelSessionTrigger(page, sessionOne.address)
    let current = await assertConfirmation(page, [sessionOne.device, sessionOne.address], 1440)
    await expect(current.dialog).toContainText('current session')
    await current.cancel.click()
    await expect(ownTrigger).toBeFocused()
    assert.equal((await writes(page)).filter((write) => write.path.includes('/sessions?')).length, 0)

    let trigger = await panelSessionTrigger(page, sessionTwo.address)
    current = await assertConfirmation(page, [sessionTwo.device, sessionTwo.address], 1440)
    await page.evaluate(() => {
      window.accessConfirmationFixture.panelSessions.reverse()
    })
    await fixtureAction(page, 'refresh')
    await expect(current.dialog).toContainText(sessionTwo.address)
    await expect(current.dialog).not.toContainText(sessionOne.address)
    await current.cancel.click()
    await expect(trigger).toBeFocused()
    assert.equal((await writes(page)).filter((write) => write.path.includes('/sessions?')).length, 0)

    await panelSessionTrigger(page, sessionTwo.address)
    current = await assertConfirmation(page, [sessionTwo.device, sessionTwo.address], 1440)
    await current.danger.click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const sessionWrite = (await writes(page)).find(
      (write) => write.path.startsWith('/api/v1/sessions?') && write.method === 'POST',
    )
    assert.equal(sessionWrite.body.id, sessionTwo.id)
    assert.match(sessionWrite.path, /user=fixture/)
    await page.close()
  }

  // Push ID snapshot survives list reorder and pending/error responses; only the exact full ID is submitted.
  {
    const page = await browser.newPage({ viewport: { width: 320, height: 900 } })
    await openProfile(page, '/profile/notifications', 'en', 'light', 'solid', 320)

    let trigger = await deviceTrigger(page, deviceTwo)
    let current = await assertConfirmation(page, [deviceTwo], 320)
    await current.cancel.click()
    await expect(trigger).toBeFocused()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await deviceTrigger(page, deviceTwo)
    await assertConfirmation(page, [deviceTwo], 320)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    assert.equal((await writes(page)).filter((write) => write.path === '/api/v1/notification-push').length, 0)

    await page.evaluate(() => {
      window.accessConfirmationFixture.deviceIDs.reverse()
      window.accessConfirmationFixture.deviceWriteMode = 'hold'
    })
    await deviceTrigger(page, deviceTwo)
    current = await assertConfirmation(page, [deviceTwo], 320)
    await fixtureAction(page, 'refresh')
    await expect(current.dialog).toContainText(deviceTwo)
    await current.danger.click()
    await expect.poll(() => hasRelease(page, 'releaseDeviceWrite')).toBe(true)
    await expect(current.dialog).toContainText(deviceTwo)
    await expect(current.dialog.locator('.modal-footer button.danger')).toBeDisabled()
    await page.evaluate(() => window.accessConfirmationFixture.releaseDeviceWrite?.())
    await expect(page.getByRole('dialog')).toHaveCount(0)
    let deviceWrite = (await writes(page)).find((write) => write.path === '/api/v1/notification-push')
    assert.deepEqual(deviceWrite.body, { id: deviceTwo })

    await deviceTrigger(page, deviceOne)
    current = await assertConfirmation(page, [deviceOne], 320)
    await page.evaluate(() => {
      window.accessConfirmationFixture.deviceWriteMode = 'fail'
    })
    await current.danger.click()
    await expect(current.dialog.getByText('Fixture device removal rejected')).toBeVisible()
    await expect.poll(() => state(page, 'failedResponses')).toEqual(['/api/v1/notification-push:503'])
    await expect(current.dialog).toContainText(deviceOne)
    await current.cancel.click()
    deviceWrite = (await writes(page)).filter((write) => write.path === '/api/v1/notification-push').at(-1)
    assert.deepEqual(deviceWrite.body, { id: deviceOne })
    await page.close()
  }

  // Telegram's captured name must still match the polled link before deletion.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await openProfile(page, '/profile/notifications', 'en', 'dark', 'glass')

    let trigger = await telegramTrigger(page)
    let current = await assertConfirmation(page, [telegramName], 1440)
    await current.cancel.click()
    await expect(trigger).toBeFocused()
    assert.equal(
      (await writes(page)).filter((write) => write.path === '/api/v1/notification-telegram-link').length,
      0,
    )

    trigger = await telegramTrigger(page)
    current = await assertConfirmation(page, [telegramName], 1440)
    await page.evaluate(() => {
      window.accessConfirmationFixture.telegram.name = 'Studio Telegram replacement account'
    })
    await fixtureAction(page, 'refresh')
    await expect(current.dialog).toContainText(telegramName)
    await expect(current.dialog.getByText(/changed/i)).toBeVisible()
    await expect(current.danger).toBeDisabled()
    assert.equal(
      (await writes(page)).filter((write) => write.path === '/api/v1/notification-telegram-link').length,
      0,
    )
    await current.cancel.click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.evaluate((name) => {
      window.accessConfirmationFixture.telegram.name = name
      window.accessConfirmationFixture.telegramWriteMode = 'fail'
    }, telegramName)
    await fixtureAction(page, 'refresh')
    trigger = await telegramTrigger(page)
    current = await assertConfirmation(page, [telegramName], 1440)
    await current.danger.click()
    await expect(current.dialog.getByText('Fixture Telegram unlink rejected')).toBeVisible()
    await expect
      .poll(() => state(page, 'failedResponses'))
      .toEqual(['/api/v1/notification-telegram-link:503'])
    await expect(current.dialog).toContainText(telegramName)
    await current.cancel.click()

    await page.evaluate(() => {
      window.accessConfirmationFixture.telegramWriteMode = 'hold'
    })
    await fixtureAction(page, 'refresh')
    await telegramTrigger(page)
    current = await assertConfirmation(page, [telegramName], 1440)
    await current.danger.click()
    await expect.poll(() => hasRelease(page, 'releaseTelegramWrite')).toBe(true)
    await expect(current.dialog).toContainText(telegramName)
    await expect(current.dialog.locator('.modal-footer button.danger')).toBeDisabled()
    await page.evaluate(() => window.accessConfirmationFixture.releaseTelegramWrite?.())
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const telegramWrites = (await writes(page)).filter(
      (write) => write.path === '/api/v1/notification-telegram-link' && write.method === 'DELETE',
    )
    assert.equal(telegramWrites.length, 2)
    assert.equal(
      telegramWrites.every((write) => write.body === undefined),
      true,
    )
    await page.close()
  }

  console.log(
    'PASS access confirmations: two similar keys/sessions/push IDs, exact snapshot identity, safe Cancel/Escape, pending/rejected writes, Telegram stale-link guard, default discard style, EN/RU/UK × four themes × 320/1440 geometry, fonts and hit targets',
  )
} finally {
  await browser.close()
}
