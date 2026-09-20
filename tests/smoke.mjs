import { chromium } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const directory = process.env.OSTOJAOS_SMOKE_DIR
if (!directory) throw new Error('OSTOJAOS_SMOKE_DIR is required; launch Go TestBrowserHarness first')
const { url, token } = JSON.parse(await readFile(`${directory}/connection.json`, 'utf8'))
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox'],
})
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(url)
  await page.getByRole('heading', { name: 'Добро пожаловать' }).waitFor()
  await page.screenshot({ path: `${directory}/login.png`, fullPage: true })
  await context.addCookies([{ name: 'ostojaos_session', value: token, url, httpOnly: true, sameSite: 'Strict' }])
  await page.reload()
  const initialPreferences = await page.evaluate(async () =>
    fetch('/api/v1/preferences').then((r) => r.json()),
  )
  await page.getByRole('heading', { name: 'Рабочий стол' }).waitFor()
  await page.getByText('На связи', { exact: true }).waitFor()
  await page.screenshot({ path: `${directory}/desktop.png`, fullPage: true })
  await page.getByRole('button', { name: 'Настроить', exact: true }).click()
  await page.getByRole('button', { name: 'Переместить Процессор вправо' }).click()
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await page.getByRole('button', { name: 'Настроить', exact: true }).waitFor()
  const prefs = await page.evaluate(async () => fetch('/api/v1/preferences').then((r) => r.json()))
  assert.equal(prefs.layouts.wide[0], 'memory')
  await page
    .getByRole('navigation', { name: 'Модули' })
    .getByRole('link', { name: 'Пользователи', exact: true })
    .click()
  await page.getByRole('heading', { name: 'Пользователи и группы' }).waitFor()
  await page.locator('td strong').getByText('pasha', { exact: true }).waitFor()
  await page.getByRole('checkbox').check()
  await page.locator('td strong').getByText('root', { exact: true }).waitFor()
  await page.getByRole('tab', { name: 'Группы', exact: true }).click()
  await page.getByRole('cell', { name: 'sudo', exact: true }).waitFor()
  await page
    .getByRole('navigation', { name: 'Модули' })
    .getByRole('link', { name: 'Диски и хранилище' })
    .click()
  await page.getByRole('heading', { name: 'Хранилище', exact: true }).waitFor()
  await page.getByRole('tab', { name: 'Разделы и монтирования' }).click()
  await page.locator('.storage-volumes').waitFor()
  await page
    .getByRole('navigation', { name: 'Модули' })
    .getByRole('link', { name: 'Настройки', exact: true })
    .click()
  await page.getByLabel('Тема', { exact: true }).selectOption('light')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await page.getByText('Настройки сохранены', { exact: true }).waitFor()
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light')
  await page
    .getByRole('navigation', { name: 'Модули' })
    .getByRole('link', { name: 'Рабочий стол', exact: true })
    .click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(url)
  await page.getByRole('heading', { name: 'Рабочий стол' }).waitFor()
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'horizontal overflow on mobile',
  )
  await page.screenshot({ path: `${directory}/mobile.png`, fullPage: true })
  await page.evaluate(async (prefs) => {
    const r = await fetch('/api/v1/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-OstojaOS-Request': '1' },
      body: JSON.stringify(prefs),
    })
    if (!r.ok) throw new Error('restore preferences failed')
  }, initialPreferences)
  await page.getByLabel('Меню пользователя').click()
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await page.getByRole('heading', { name: 'Добро пожаловать' }).waitFor()
  assert.equal((await context.request.get(`${url}/api/v1/users`)).status(), 401)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: real Linux inventory, WebSocket, layout persistence, users/groups, mounts, settings/theme, mobile, logout',
  )
} catch (e) {
  for (const c of browser.contexts()) {
    for (const p of c.pages()) {
      await p.screenshot({ path: `${directory}/failure.png`, fullPage: true })
      console.error((await p.locator('body').innerText()).slice(-2000))
    }
  }
  throw e
} finally {
  await browser.close()
  await writeFile(`${directory}/done`, 'done')
}
