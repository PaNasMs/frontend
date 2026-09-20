import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const directory = process.env.PANASMS_SMOKE_DIR
const { url, token } = JSON.parse(await readFile(`${directory}/connection.json`, 'utf8'))
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox'],
})
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addCookies([{ name: 'panasms_session', value: token, url, httpOnly: true, sameSite: 'Strict' }])
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(url)
  await page.getByRole('heading', { name: 'Рабочий стол' }).waitFor()
  await page.getByText(/Вентилятор CPU · \d+ об\/мин/).waitFor()
  await page
    .getByRole('navigation', { name: 'Модули' })
    .getByRole('link', { name: 'Настройки', exact: true })
    .click()
  await page.getByRole('tab', { name: 'Охлаждение дисков', exact: true }).click()
  const original = await page.evaluate(async () => fetch('/api/v1/cooling').then((r) => r.json()))
  assert.equal(original.available, true)
  const changed = original.config.profile === 'quiet' ? 'balanced' : 'quiet'
  await page.getByLabel('Профиль охлаждения дисков').selectOption(changed)
  await page.getByRole('button', { name: 'Применить', exact: true }).click()
  await page.getByText('Профиль сохранён', { exact: true }).waitFor()
  await page.waitForFunction(
    async (profile) => (await fetch('/api/v1/cooling').then((r) => r.json())).status.profile === profile,
    changed,
  )
  const rejected = await page.evaluate(async () =>
    fetch('/api/v1/cooling', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-PaNasMs-Request': '1' },
      body: JSON.stringify({ profile: 'off', sampleSeconds: 0 }),
    }).then((r) => r.status),
  )
  assert.equal(rejected, 400)
  await page.getByLabel('Профиль охлаждения дисков').selectOption(original.config.profile)
  await page.getByRole('button', { name: 'Применить', exact: true }).click()
  await page.waitForFunction(
    async (profile) => (await fetch('/api/v1/cooling').then((r) => r.json())).status.profile === profile,
    original.config.profile,
  )
  await page.screenshot({ path: `${directory}/cooling.png`, fullPage: true })
  assert.deepEqual(errors, [])
  await page
    .getByRole('navigation', { name: 'Модули' })
    .getByRole('link', { name: 'Рабочий стол', exact: true })
    .click()
  await page.getByLabel('Меню пользователя').click()
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  console.log(
    'PASS real CPU RPM, cooling status, profile save and application, invalid config rejection, restore and logout',
  )
} finally {
  await browser.close()
}
