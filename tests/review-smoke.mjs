import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const directory = process.env.OSTOJAOS_SMOKE_DIR
const { url, token } = JSON.parse(await readFile(`${directory}/connection.json`, 'utf8'))
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox'],
})
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  await context.addCookies([{ name: 'ostojaos_session', value: token, url, httpOnly: true, sameSite: 'Strict' }])
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const nav = (name) =>
    page.getByRole('navigation', { name: 'Модули' }).getByRole('link', { name, exact: true })
  await page.goto(url)
  await page.getByRole('heading', { name: 'Рабочий стол' }).waitFor()
  await page.getByText('На связи', { exact: true }).waitFor()
  assert.equal(
    await page
      .getByRole('navigation', { name: 'Модули' })
      .getByRole('link')
      .first()
      .getAttribute('aria-label'),
    'Рабочий стол',
  )
  await page.getByLabel('Меню пользователя').click()
  await page.getByRole('link', { name: 'Мой профиль', exact: true }).click()
  await page.getByRole('heading', { name: 'Мой профиль' }).waitFor()
  await page.getByRole('main').getByText('pasha', { exact: true }).waitFor()
  await page.getByRole('heading', { name: 'SSH-ключи', exact: true }).waitFor()
  await page
    .getByText(/SHA256:/)
    .first()
    .waitFor()
  await page.screenshot({ path: `${directory}/profile.png`, fullPage: true })
  await nav('Настройки').click()
  assert.ok(page.url().endsWith('/settings'))
  assert.equal(await page.getByRole('dialog').count(), 0)
  await page.getByRole('tab', { name: 'Охлаждение дисков', exact: true }).click()
  await page.getByLabel('Профиль охлаждения дисков').waitFor()
  assert.equal(
    await page
      .getByText('Автоматически регулируется по температуре самого горячего диска.', { exact: false })
      .count(),
    0,
  )
  assert.equal(await page.getByText(/ata-WDC/).count(), 0)
  await page.getByRole('tab', { name: 'Охлаждение CPU', exact: true }).click()
  const original = await page.evaluate(async () => fetch('/api/v1/cooling').then((r) => r.json()))
  await page.getByLabel('Профиль охлаждения CPU').selectOption('performance')
  await page.getByRole('button', { name: 'Применить', exact: true }).click()
  await page.waitForFunction(async () => {
    const s = await fetch('/api/v1/cooling').then((r) => r.json())
    return (
      s.status.cpu.available && s.status.cpu.profile === 'performance' && s.status.cpu.thresholds[0] === 40000
    )
  })
  await page.getByLabel('Профиль охлаждения CPU').selectOption(original.config.cpuProfile)
  await page.getByRole('button', { name: 'Применить', exact: true }).click()
  await page.waitForFunction(
    async (profile) => (await fetch('/api/v1/cooling').then((r) => r.json())).status.cpu.profile === profile,
    original.config.cpuProfile,
  )
  await page.screenshot({ path: `${directory}/settings.png`, fullPage: true })
  await nav('Диски и хранилище').click()
  await page.locator('.raid').waitFor()
  assert.equal(await page.locator('.raid .disk-card').count(), 4)
  await page.getByText('SMART: исправен', { exact: true }).first().waitFor()
  await page.screenshot({ path: `${directory}/storage.png`, fullPage: true })
  await page.getByRole('tab', { name: 'Разделы и монтирования' }).click()
  assert.equal(await page.locator('table').count(), 0)
  await page.locator('.partition-map').first().waitFor()
  await page.locator('.mount-path').filter({ hasText: '/srv/dev-disk-by-uuid-' }).waitFor()
  await page.screenshot({ path: `${directory}/volumes.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'horizontal overflow on volume cards',
  )
  await nav('Настройки').click()
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'horizontal overflow in settings',
  )
  await page.screenshot({ path: `${directory}/settings-mobile.png`, fullPage: true })
  await page.getByLabel('Меню пользователя').click()
  await page.getByRole('link', { name: 'Мой профиль', exact: true }).click()
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'horizontal overflow in profile',
  )
  assert.deepEqual(errors, [])
  await page.getByLabel('Меню пользователя').click()
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await page.getByRole('heading', { name: 'Добро пожаловать' }).waitFor()
  assert.equal((await context.request.get(`${url}/api/v1/profile`)).status(), 401)
  console.log(
    'PASS navigation, profile/menu, settings route, CPU apply/restore, RAID/SMART, graphical volumes, mobile, logout',
  )
} catch (error) {
  for (const c of browser.contexts())
    for (const p of c.pages()) {
      await p.screenshot({ path: `${directory}/review-failure.png`, fullPage: true })
      console.error((await p.locator('body').innerText()).slice(-2500))
    }
  throw error
} finally {
  await browser.close()
}
