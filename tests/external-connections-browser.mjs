import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' })
  const errors = [],
    starts = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    window.open = () => null
  })
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname
    let value = {}
    if (path.endsWith('/providers'))
      value = {
        google: { enabled: true, login: true },
        github: { enabled: true, login: true },
        dropbox: { enabled: true, login: false },
      }
    else if (path.includes('/settings/')) {
      const provider = path.split('/').at(-1)
      value = {
        provider,
        clientId: `test-${provider}`,
        secretConfigured: true,
        enabled: true,
        redirectUri: 'https://example.test/callback',
      }
    } else if (path.endsWith('/connections'))
      value = [
        { id: '1', provider: 'github', name: '@alice', email: '', created: 1 },
        { id: '2', provider: 'dropbox', name: 'Alice', email: 'alice@example.test', created: 2 },
      ]
    else if (path.endsWith('/start')) {
      starts.push({ path, body: req.postDataJSON() })
      value = { url: 'https://example.test/authorize' }
    } else if (path.endsWith('/poll')) value = { status: 'pending' }
    else if (path.endsWith('/grants')) value = []
    await route.fulfill({ json: value })
  })
  const base = process.env.EXTERNAL_TEST_URL ?? 'http://127.0.0.1:5173'
  await page.goto(base + '/tests/external-connections.html')
  await expect(page.getByRole('heading', { name: 'External connections', exact: true })).toBeVisible()
  await expect(page.getByLabel('Client secret', { exact: true })).toHaveCount(3)
  for (const field of await page.getByLabel('Client secret', { exact: true }).all()) {
    await expect(field).toHaveValue('')
    await expect(field).toHaveAttribute('placeholder', '••••••••')
  }
  await expect(page.getByTestId('login').getByRole('button')).toHaveCount(2)
  await page.getByRole('button', { name: 'Link GitHub account', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Link GitHub account' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Current Linux password').fill('test-only-password')
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(dialog.getByText('Waiting for GitHub authorization…')).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'Open GitHub authorization' })).toBeVisible()
  assert.equal(starts[0].path, '/api/v1/external/github/start')
  assert.equal(starts[0].body.purpose, 'link')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  for (const language of ['en', 'ru', 'uk']) {
    await page.goto(base + '/tests/external-connections.html?language=' + language)
    await expect(page.locator('.external-account')).toHaveCount(2)
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme
      }, theme)
      for (const width of [1200, 320]) {
        await page.setViewportSize({ width, height: 900 })
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
          `${language}/${theme}/${width} overflow`,
        )
      }
    }
  }
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto(base + '/tests/external-connections.html')
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme
    }, theme)
    await page.screenshot({ path: `/tmp/panasms-external-${theme}.png`, fullPage: true })
  }
  assert.deepEqual(errors, [])
  console.log(
    'PASS provider settings, masked secrets, identity labels, login capabilities, linking dialog, fallback link, three languages and responsive themes',
  )
} finally {
  await browser.close()
}
