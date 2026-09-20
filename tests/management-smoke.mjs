import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const directory = process.env.OSTOJAOS_SMOKE_DIR
const { url, token } = JSON.parse(await readFile(`${directory}/connection.json`, 'utf8'))
const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox'],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
await context.addCookies([{ name: 'ostojaos_session', value: token, url, httpOnly: true, sameSite: 'Strict' }])
const original = await (await context.request.get(url + '/api/v1/preferences')).json()
const fixture = '/home/pasha/ostojaos-ui-fixture-' + Date.now()
const headers = { Origin: url, 'X-OstojaOS-Request': '1' }
async function api(view, body, target) {
  const r = body
    ? await context.request.post(url + '/api/v1/manage?view=' + view, { headers, data: body })
    : await context.request.get(
        url + '/api/v1/manage?view=' + view + (target ? '&target=' + encodeURIComponent(target) : ''),
      )
  assert.ok(r.ok(), `${view}: ${r.status()}`)
  const data = await r.json()
  assert.ok(!data.error, `${view}: ${data.error}`)
  return data
}
async function job(action, params) {
  const plan = await api('plan', { action, params })
  const id = 'test-' + Date.now() + '-' + Math.random().toString(16).slice(2)
  const created = await api('run', {
    id,
    action,
    params,
    fingerprint: plan.fingerprint,
    confirmation: plan.confirmation,
  })
  assert.equal(created.id, id)
  await api('run', { id, action, params, fingerprint: plan.fingerprint, confirmation: plan.confirmation })
  for (let i = 0; i < 100; i++) {
    const rows = await api('jobs')
    const j = rows.find((j) => j.id === id)
    if (j.status === 'succeeded') return j
    if (['failed', 'interrupted'].includes(j.status)) throw Error(`${action}: ${j.stage}`)
    await new Promise((r) => setTimeout(r, 200))
  }
  throw Error('job timeout')
}
let created = false
try {
  const page = await context.newPage()
  let terminalOutput = ''
  page.on('websocket', (socket) => {
    if (socket.url().includes('/terminal'))
      socket.on('framereceived', (frame) => {
        terminalOutput += typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
      })
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(url)
  await page.getByRole('heading', { name: 'Рабочий стол', exact: true }).waitFor()
  await page.locator('.coordinate-tile').first().waitFor()
  await page.getByRole('button', { name: 'Настроить', exact: true }).click()
  await page.getByLabel('Каталог виджетов').selectOption('network')
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await page.reload()
  await page.locator('.tile-title').filter({ hasText: 'Сеть' }).waitFor()
  await page.goto(url + '/storage')
  await page.locator('.raid').waitFor()
  await page.locator('.raid').getByRole('button', { name: 'Удалить массив', exact: true }).click()
  await page.waitForTimeout(1200)
  assert.ok(await page.getByRole('dialog').isVisible())
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
  const forbidden = await context.request.post(url + '/api/v1/manage?view=plan', {
    headers,
    data: { action: 'filesystem.format', params: { target: '/dev/mmcblk0', format: 'ext4' } },
  })
  assert.match((await forbidden.json()).error, /Системный/)
  await page.goto(url + '/system')
  await page.getByRole('tab', { name: 'Журнал', exact: true }).click()
  await page.locator('.journal>div').first().waitFor()
  await page.screenshot({ path: directory + '/system-management.png', fullPage: true })
  await page.goto(url + '/terminal')
  await page.getByRole('button', { name: 'Открыть терминал', exact: true }).click()
  await page.getByText('Подключён', { exact: true }).waitFor()
  await page.locator('.xterm-helper-textarea').pressSequentially('id -u\n', { delay: 40 })
  await page.waitForTimeout(800)
  assert.match(terminalOutput, /[\r\n]1000\r?\n/, 'terminal must run as pasha, not root')
  await page.waitForTimeout(16000)
  await page.locator('.xterm-helper-textarea').pressSequentially('pwd\n', { delay: 40 })
  await page.waitForTimeout(800)
  assert.match(terminalOutput, /\/home\/pasha/, 'PTY must remain connected and start in home')
  await page.screenshot({ path: directory + '/terminal.png' })
  await page.getByRole('button', { name: 'Закрыть терминал', exact: true }).click()
  await job('file.mkdir', { target: fixture })
  created = true
  const upload = await context.request.put(
    url + '/api/v1/files/content?target=' + encodeURIComponent(fixture + '/hello.txt'),
    {
      headers: { ...headers, 'Content-Type': 'application/octet-stream' },
      data: Buffer.from('OstojaOS streamed test\n'),
    },
  )
  assert.equal(upload.status(), 204)
  const download = await context.request.get(
    url + '/api/v1/files/content?target=' + encodeURIComponent(fixture + '/hello.txt'),
  )
  assert.equal(await download.text(), 'OstojaOS streamed test\n')
  await job('file.copy', { target: fixture + '/hello.txt', destination: fixture + '/copy.txt' })
  await job('file.rename', { target: fixture + '/copy.txt', destination: fixture + '/renamed.txt' })
  assert.equal((await api('files', undefined, fixture)).entries.length, 2)
  await page.goto(url + '/files')
  await page.getByRole('heading', { name: 'Файлы', exact: true }).waitFor()
  await page.getByRole('button', { name: '/home/pasha', exact: true }).click()
  await page.screenshot({ path: directory + '/files.png', fullPage: true })
  await page.goto(url + '/jobs')
  await page.getByRole('heading', { name: 'Задачи и события', exact: true }).waitFor()
  await page.screenshot({ path: directory + '/jobs.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  for (const route of ['/', '/storage', '/jobs', '/files', '/settings']) {
    await page.goto(url + route)
    await page.waitForTimeout(300)
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      route + ' overflow',
    )
  }
  assert.deepEqual(errors, [])
  console.log(
    'PASS module navigation, coordinate desktop/catalog/save, RAID plan, root disk guard, system journal, PTY, jobs/idempotency, streamed files, copy/rename, mobile',
  )
} catch (e) {
  for (const p of context.pages()) {
    await p.screenshot({ path: directory + '/management-failure.png', fullPage: true })
    console.error((await p.locator('body').innerText()).slice(-2500))
  }
  throw e
} finally {
  if (created) await job('file.delete', { target: fixture })
  await context.request.put(url + '/api/v1/preferences', { headers, data: original })
  await context.request.post(url + '/api/v1/logout', { headers })
  await browser.close()
}
