import { chromium, expect } from '@playwright/test'

const base = process.env.FRONTEND_TEST_URL ?? 'http://127.0.0.1:5173'
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox'],
})

try {
  const page = await browser.newPage()
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url())
    const values = {
      session: { username: 'operator', role: 'admin' },
      preferences: { language: 'en', theme: 'light' },
      avatar: {},
      wallpaper: {},
      notifications: [],
      modules: { installed: [] },
      jobs: [],
    }
    const key = url.searchParams.get('view') ?? url.pathname.split('/').pop()
    return Object.hasOwn(values, key)
      ? route.fulfill({ json: values[key] })
      : route.fulfill({ status: 503, json: { error: 'Unavailable in fixture' } })
  })
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 800 })
    for (const [route, title] of [
      ['/settings/general', 'Settings'],
      ['/users/accounts', 'Users and groups'],
      ['/missing-section', 'Page not found'],
    ]) {
      await page.goto(base + route)
      const main = page.getByRole('main')
      await expect(main.getByRole('heading', { level: 1, name: title, exact: true })).toHaveCount(1)
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(main).toHaveCount(1)
      if (route === '/missing-section') {
        const back = main.getByRole('link', { name: 'Go to desktop' })
        await back.focus()
        await expect(back).toBeFocused()
        await back.press('Enter')
        await expect(main.getByRole('heading', { level: 1, name: 'Desktop' })).toHaveCount(1)
      }
    }
  }
} finally {
  await browser.close()
}
