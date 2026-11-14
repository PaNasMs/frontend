import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const server = await createServer({
  configFile: false,
  root: frontend,
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 15183, strictPort: true },
})
await server.listen()
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox'],
})

const localeIDs = ['en', 'ru', 'uk']
const surfaces = [
  { theme: 'light', surface: 'solid' },
  { theme: 'light', surface: 'glass' },
  { theme: 'dark', surface: 'solid' },
  { theme: 'dark', surface: 'glass' },
]
const widths = [320, 1440]

function clone(value) {
  return structuredClone(value)
}

function initialState() {
  return {
    writes: [],
    failNextPlan: false,
    failNotificationSave: false,
    failProviderSave: false,
    job: null,
    hostname: {
      hostname: 'nas-fixture',
      networkName: 'nas-fixture.local',
      state: 'ready',
      port: 80,
      scheme: 'http',
    },
    webAccess: { port: 80, pending: false, error: '' },
    notificationSettings: {
      config: {
        smtp: {
          host: 'smtp.fixture.invalid',
          port: 587,
          security: 'starttls',
          username: 'fixture-user',
          from: 'nas@fixture.invalid',
          enabled: false,
        },
        telegramEnabled: false,
        contact: '',
      },
      passwordConfigured: true,
      tokenConfigured: true,
    },
    notificationProfile: {
      preferences: {
        enabled: true,
        email: 'old@fixture.invalid',
        chatId: '',
        routes: { info: [], warning: ['push'], error: ['email'], critical: ['telegram'] },
      },
      publicKey: 'synthetic-public-key-not-used-by-tests',
      devices: [],
      available: { email: false, telegram: false, push: false },
      history: [],
    },
    telegramLink: { linked: false, name: '', enabled: true, pending: { ready: false, name: '', expires: 0 } },
    external: {
      google: {
        provider: 'google',
        clientId: 'synthetic-google-client',
        secretConfigured: true,
        enabled: false,
        redirectUri: 'http://fixture.invalid/oauth/google/callback',
      },
      github: {
        provider: 'github',
        clientId: 'synthetic-github-client',
        secretConfigured: true,
        enabled: false,
        redirectUri: 'http://fixture.invalid/oauth/github/callback',
      },
      dropbox: {
        provider: 'dropbox',
        clientId: 'synthetic-dropbox-client',
        secretConfigured: true,
        enabled: false,
        redirectUri: 'http://fixture.invalid/oauth/dropbox/callback',
      },
    },
    updates: {
      settings: { channel: 'stable', mode: 'notify', hour: 9 },
      installed: { 'panasms-prototype': '0.2.39-fixture' },
      candidate: null,
      checkedAt: '2026-11-14T10:00:00Z',
      available: false,
      busy: false,
      rollbackAvailable: false,
      state: {},
      history: [],
    },
  }
}

async function mockAPI(page) {
  const state = initialState()
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const resource = url.pathname.replace(/^\/api\/v1\//, '')
    const method = request.method()
    const body = method === 'GET' || method === 'DELETE' ? undefined : request.postDataJSON()
    if (resource === 'session')
      return route.fulfill({
        json: { role: 'admin', username: 'fixture-admin', uid: '1000', name: 'Synthetic Admin' },
      })
    if (resource === 'manage') {
      const view = url.searchParams.get('view')
      if (view === 'hostname') return route.fulfill({ json: clone(state.hostname) })
      if (view === 'web-access') return route.fulfill({ json: clone(state.webAccess) })
      if (view === 'system-updates') return route.fulfill({ json: clone(state.updates) })
      if (view === 'plan') {
        state.writes.push({ resource, view, body })
        if (state.failNextPlan) {
          state.failNextPlan = false
          return route.fulfill({ status: 503, json: { error: 'Synthetic plan rejection' } })
        }
        return route.fulfill({
          json: { fingerprint: `fingerprint:${body.action}`, confirmation: `confirm:${body.action}` },
        })
      }
      if (view === 'run') {
        state.writes.push({ resource, view, body })
        if (body.action === 'system.hostname')
          state.hostname = {
            ...state.hostname,
            hostname: body.params.hostname,
            networkName: `${body.params.hostname}.local`,
          }
        if (body.action === 'system.web-port')
          state.webAccess = { ...state.webAccess, port: body.params.port }
        if (body.action === 'system.update.settings')
          state.updates = { ...state.updates, settings: body.params }
        state.job = { id: body.id, status: 'succeeded', stage: 'complete' }
        return route.fulfill({ json: { id: body.id } })
      }
      if (view === 'jobs') return route.fulfill({ json: state.job ? [clone(state.job)] : [] })
    }
    if (resource === 'notification-settings') {
      if (method === 'GET') return route.fulfill({ json: clone(state.notificationSettings) })
      if (method === 'PUT') {
        state.writes.push({ resource, body })
        if (state.failNotificationSave) {
          state.failNotificationSave = false
          return route.fulfill({ status: 503, json: { error: 'Synthetic notification save rejection' } })
        }
        state.notificationSettings = { ...state.notificationSettings, config: clone(body) }
        return route.fulfill({ json: clone(state.notificationSettings) })
      }
    }
    if (resource === 'notification-profile') {
      if (method === 'GET') return route.fulfill({ json: clone(state.notificationProfile) })
      if (method === 'PUT') {
        state.writes.push({ resource, body })
        state.notificationProfile = { ...state.notificationProfile, preferences: clone(body) }
        return route.fulfill({ json: clone(state.notificationProfile) })
      }
    }
    if (resource === 'notification-telegram-link') return route.fulfill({ json: clone(state.telegramLink) })
    if (resource.startsWith('external/settings/')) {
      const provider = resource.split('/').at(-1)
      if (method === 'GET') return route.fulfill({ json: clone(state.external[provider]) })
      if (method === 'PUT') {
        state.writes.push({ resource, body })
        if (state.failProviderSave) {
          state.failProviderSave = false
          return route.fulfill({ status: 503, json: { error: 'Synthetic provider save rejection' } })
        }
        state.external[provider] = {
          ...state.external[provider],
          ...body,
          secretConfigured: !!body.clientSecret || state.external[provider].secretConfigured,
        }
        return route.fulfill({ json: clone(state.external[provider]) })
      }
    }
    if (resource === 'health') return route.fulfill({ json: { status: 'ok', product: 'PaNasMs' } })
    return route.fulfill({ json: {} })
  })
  return state
}

async function fixtureRefresh(page, keys) {
  await page.evaluate((queryKeys) => window.settingsDraftFixture.refresh(queryKeys), keys)
}

async function openPage(page, path = '/system/hostname', lang = 'en', theme = 'light', surface = 'solid') {
  await page.goto(
    `http://127.0.0.1:15183/tests/settings-drafts.html?path=${path}&lang=${lang}&theme=${theme}&surface=${surface}`,
  )
}

async function assertFontAndFormGeometry(page, label) {
  const font = await page.evaluate(async () => {
    await document.fonts.ready
    const loaded = await document.fonts.load('16px "Manrope Variable"', 'Settings changed elsewhere 123')
    return {
      face: loaded.some((item) => item.family === 'Manrope Variable' && item.status === 'loaded'),
      body: getComputedStyle(document.body).fontFamily,
    }
  })
  assert.equal(font.face, true, `${label}: Manrope Variable must load`)
  assert.match(font.body, /Manrope Variable/, `${label}: body must use Manrope Variable`)
  let metrics
  await expect(async () => {
    metrics = await page.evaluate(() => {
      const nodes = [
        ...document.querySelectorAll(
          'main form button, main form input, main form select, [role="status"] button, [role="alert"] button',
        ),
      ].filter((node) => !(node instanceof HTMLInputElement && node.type === 'hidden'))
      const targets = nodes.map((node) =>
        node instanceof HTMLInputElement && node.type === 'checkbox' ? (node.closest('label') ?? node) : node,
      )
      const controls = targets
        .map((node) => {
          node.scrollIntoView({ block: 'center', inline: 'nearest' })
          const rect = node.getBoundingClientRect()
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
          return {
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
            hit: !!hit && (hit === node || node.contains(hit)),
            label: node.getAttribute('aria-label') || node.textContent?.trim() || node.getAttribute('name'),
          }
        })
        .filter((item) => item.height > 0)
      const overflow = [...document.querySelectorAll('body *')]
        .map((node) => {
          const rect = node.getBoundingClientRect()
          return {
            tag: node.tagName,
            className: typeof node.className === 'string' ? node.className : '',
            text: node.textContent?.trim().slice(0, 100),
            left: rect.left,
            right: rect.right,
            width: rect.width,
          }
        })
        .filter((node) => node.width > 0 && (node.left < -1 || node.right > innerWidth + 1))
      return {
        width: document.documentElement.scrollWidth,
        clientWidth: innerWidth,
        height: innerHeight,
        controls,
        overflow,
      }
    })
    assert.ok(
      metrics.width <= metrics.clientWidth,
      `${label}: horizontal overflow ${JSON.stringify(metrics.overflow)}`,
    )
    assert.ok(metrics.controls.length > 0, `${label}: no checked form targets`)
    for (const item of metrics.controls) {
      assert.ok(
        item.top >= -1 && item.bottom <= metrics.height + 1,
        `${label}: ${item.label} outside viewport`,
      )
      assert.ok(item.hit, `${label}: ${item.label} center is occluded`)
      if (item.label) assert.ok(item.height >= 43.9, `${label}: ${item.label} target height ${item.height}px`)
    }
  }).toPass({ timeout: 4000 })
}

async function behaviorTests() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors = []
  const consoleErrors = []
  const expectedMockFailures = []
  const browserDialogs = []
  page.on('dialog', async (dialog) => {
    browserDialogs.push(dialog.type())
    await dialog.dismiss()
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      if (
        message.text() ===
        'Failed to load resource: the server responded with a status of 503 (Service Unavailable)'
      )
        expectedMockFailures.push(message.text())
      else consoleErrors.push(message.text())
    }
  })
  const state = await mockAPI(page)
  const strings = JSON.parse(await readFile(new URL('../src/i18n/locales/en.json', import.meta.url)))

  await openPage(page)
  const hostname = page.getByLabel('Hostname', { exact: true })
  await expect(hostname).toHaveValue('nas-fixture')
  state.hostname = {
    ...state.hostname,
    hostname: 'clean-refreshed-host',
    networkName: 'clean-refreshed-host.local',
  }
  await fixtureRefresh(page, [['hostname']])
  await expect(hostname).toHaveValue('clean-refreshed-host')
  await hostname.fill('local-host-draft')
  state.hostname = {
    ...state.hostname,
    hostname: 'second-client-host',
    networkName: 'second-client-host.local',
  }
  await fixtureRefresh(page, [['hostname']])
  await expect(hostname).toHaveValue('local-host-draft')
  await expect(page.getByRole('status').filter({ hasText: strings['forms.changed'] })).toBeVisible()
  const reloadDraft = page.getByRole('button', { name: strings['forms.reload'], exact: true })
  const apply = page.getByRole('button', { name: strings.apply_768af677, exact: true })
  await expect(apply).toBeDisabled()
  await page.locator('form').evaluate((form) => form.requestSubmit())
  assert.equal(state.writes.length, 0, 'conflicted hostname submit must not write')
  await reloadDraft.click()
  await expect(hostname).toHaveValue('second-client-host')
  await hostname.fill('rejected-host-change')
  state.failNextPlan = true
  await apply.click()
  await expect(page.getByRole('alert').filter({ hasText: 'Synthetic plan rejection' })).toBeVisible()
  await expect(hostname).toHaveValue('rejected-host-change')
  assert.deepEqual(state.writes.at(-1), {
    resource: 'manage',
    view: 'plan',
    body: { action: 'system.hostname', params: { hostname: 'rejected-host-change' } },
  })
  await apply.click()
  await expect.poll(() => state.writes.filter((write) => write.view === 'run').length).toBe(1)
  assert.deepEqual(state.writes.at(-1).body.action, 'system.hostname')
  assert.deepEqual(state.writes.at(-1).body.params, { hostname: 'rejected-host-change' })
  assert.equal(state.writes.at(-1).body.fingerprint, 'fingerprint:system.hostname')
  assert.equal(state.writes.at(-1).body.confirmation, 'confirm:system.hostname')

  await hostname.fill('unsaved-navigation-draft')
  await page.getByRole('link', { name: 'Web', exact: true }).click()
  const discardDialog = page.getByRole('dialog')
  await expect(discardDialog).toBeVisible()
  await discardDialog.getByRole('button', { name: strings.cancel_0ec753be, exact: true }).click()
  await expect(discardDialog).toHaveCount(0)
  await expect(hostname).toHaveValue('unsaved-navigation-draft')
  await page.getByRole('link', { name: 'Web', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: strings['ui.discard'], exact: true }).click()
  await expect(page.getByRole('heading', { name: strings['web.title'], exact: true })).toBeVisible()

  const webPort = page.getByLabel(strings['web.port'], { exact: true })
  await expect(webPort).toHaveValue('80')
  await webPort.fill('15183')
  state.webAccess = { port: 8088, pending: false, error: '' }
  await fixtureRefresh(page, [['web-access']])
  await expect(webPort).toHaveValue('15183')
  await expect(page.getByRole('status').filter({ hasText: strings['forms.changed'] })).toBeVisible()
  const webApply = page.getByRole('button', { name: strings.apply_768af677, exact: true })
  await expect(webApply).toBeDisabled()
  await page.getByRole('button', { name: strings['forms.reload'], exact: true }).click()
  await expect(webPort).toHaveValue('8088')
  await webPort.fill('15183')
  await webApply.click()
  const conflictedWebDialog = page.getByRole('dialog')
  await expect(conflictedWebDialog).toBeVisible()
  state.webAccess = { port: 9090, pending: false, error: '' }
  await fixtureRefresh(page, [['web-access']])
  await expect(
    conflictedWebDialog.getByRole('status').filter({ hasText: strings['forms.changed'] }),
  ).toBeVisible()
  await expect(
    conflictedWebDialog.getByRole('button', { name: strings.apply_768af677, exact: true }),
  ).toBeDisabled()
  await conflictedWebDialog.getByRole('button', { name: strings['forms.reload'], exact: true }).click()
  await expect(conflictedWebDialog).toHaveCount(0)
  await expect(webPort).toHaveValue('9090')
  state.webAccess = { port: 80, pending: false, error: '' }
  await fixtureRefresh(page, [['web-access']])
  await expect(webPort).toHaveValue('80')
  await webPort.fill('15183')
  await webApply.click()
  let webDialog = page.getByRole('dialog')
  await expect(webDialog).toBeVisible()
  await expect(webDialog.getByRole('link', { name: /127\.0\.0\.1:15183\/settings\/general/ })).toBeVisible()
  state.failNextPlan = true
  const webConfirm = webDialog.getByRole('button', { name: strings.apply_768af677, exact: true })
  await webConfirm.click()
  await expect(webDialog.getByRole('alert').filter({ hasText: 'Synthetic plan rejection' })).toBeVisible()
  await expect(webPort).toHaveValue('15183')
  assert.equal(
    state.writes.filter((write) => write.view === 'run' && write.body.action === 'system.web-port').length,
    0,
  )
  await webDialog.getByRole('button', { name: strings.cancel_0ec753be, exact: true }).click()
  await expect(webDialog).toHaveCount(0)
  await webApply.click()
  webDialog = page.getByRole('dialog')
  await page.route('**/settings/general', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><main>Mock target port reached</main>',
    }),
  )
  await webDialog.getByRole('button', { name: strings.apply_768af677, exact: true }).click()
  await page.waitForURL('**/settings/general')
  assert.deepEqual(
    browserDialogs,
    [],
    'the verified port redirect must not trigger an unsaved-changes unload prompt',
  )
  assert.deepEqual(state.writes.filter((write) => write.view === 'run').at(-1).body.params, { port: 15183 })
  assert.equal(state.writes.filter((write) => write.view === 'run').at(-1).body.action, 'system.web-port')
  assert.deepEqual(pageErrors, [])
  assert.deepEqual(consoleErrors, [])
  assert.equal(
    expectedMockFailures.length,
    2,
    'only the deliberate hostname and port plan rejections should produce HTTP 503 console lines',
  )
  await page.close()

  const notificationsPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const notificationsState = await mockAPI(notificationsPage)
  await openPage(notificationsPage, '/settings/notifications')
  const smtpHost = notificationsPage.getByLabel(strings['delivery.host'], { exact: true })
  await expect(smtpHost).toHaveValue('smtp.fixture.invalid')
  await notificationsPage.getByLabel(strings['delivery.password'], { exact: true }).fill('')
  assert.equal(
    await notificationsPage.getByLabel(strings['delivery.password'], { exact: true }).inputValue(),
    '',
  )
  await smtpHost.fill('smtp.local-draft.invalid')
  notificationsState.notificationSettings.config = {
    ...notificationsState.notificationSettings.config,
    smtp: { ...notificationsState.notificationSettings.config.smtp, host: 'smtp.second-client.invalid' },
  }
  await fixtureRefresh(notificationsPage, [['notification-settings']])
  await expect(smtpHost).toHaveValue('smtp.local-draft.invalid')
  await expect(
    notificationsPage.getByRole('status').filter({ hasText: strings['forms.changed'] }),
  ).toBeVisible()
  await expect(
    notificationsPage.getByRole('button', { name: strings.apply_768af677, exact: true }),
  ).toBeDisabled()
  await notificationsPage.getByRole('button', { name: strings['forms.reload'], exact: true }).click()
  await expect(smtpHost).toHaveValue('smtp.second-client.invalid')
  await smtpHost.fill('smtp.saved.invalid')
  notificationsState.failNotificationSave = true
  const saveNotifications = notificationsPage.getByRole('button', {
    name: strings.apply_768af677,
    exact: true,
  })
  await saveNotifications.click()
  await expect(
    notificationsPage.getByRole('alert').filter({ hasText: 'Synthetic notification save rejection' }),
  ).toBeVisible()
  await expect(smtpHost).toHaveValue('smtp.saved.invalid')
  await saveNotifications.click()
  await expect
    .poll(
      () => notificationsState.writes.filter((write) => write.resource === 'notification-settings').length,
    )
    .toBe(2)
  assert.equal(notificationsState.writes.at(-1).body.smtp.host, 'smtp.saved.invalid')
  assert.equal(
    await notificationsPage.getByLabel(strings['delivery.token'], { exact: true }).inputValue(),
    '',
  )
  await notificationsPage.close()

  const preferencesPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const preferencesState = await mockAPI(preferencesPage)
  await openPage(preferencesPage, '/profile/notifications')
  const email = preferencesPage.getByLabel(strings['delivery.email'], { exact: true })
  await expect(email).toHaveValue('old@fixture.invalid')
  await email.fill('local@fixture.invalid')
  preferencesState.notificationProfile.preferences = {
    ...preferencesState.notificationProfile.preferences,
    email: 'second@fixture.invalid',
  }
  await fixtureRefresh(preferencesPage, [['notification-profile']])
  await expect(email).toHaveValue('local@fixture.invalid')
  await expect(
    preferencesPage.getByRole('status').filter({ hasText: strings['forms.changed'] }),
  ).toBeVisible()
  const prefsApply = preferencesPage
    .getByRole('button', { name: strings.apply_768af677, exact: true })
    .first()
  await expect(prefsApply).toBeDisabled()
  await preferencesPage.getByRole('button', { name: strings['forms.reload'], exact: true }).click()
  await expect(email).toHaveValue('second@fixture.invalid')
  await email.fill('saved@fixture.invalid')
  await prefsApply.click()
  await expect
    .poll(() => preferencesState.writes.filter((write) => write.resource === 'notification-profile').length)
    .toBe(1)
  assert.deepEqual(preferencesState.writes.at(-1).body, {
    ...preferencesState.notificationProfile.preferences,
    email: 'saved@fixture.invalid',
  })
  await preferencesPage.close()

  const providerPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const providerState = await mockAPI(providerPage)
  await openPage(providerPage, '/settings/connections/google')
  const providerID = providerPage.getByLabel(strings['external.clientId'], { exact: true })
  const providerSecret = providerPage.getByLabel(strings['external.clientSecret'], { exact: true })
  await expect(providerID).toHaveValue('synthetic-google-client')
  await expect(providerSecret).toHaveValue('')
  await providerSecret.fill('synthetic-provider-secret-only')
  providerState.external.google = { ...providerState.external.google, clientId: 'second-client-google' }
  await fixtureRefresh(providerPage, [['external-settings', 'google']])
  await expect(providerID).toHaveValue('synthetic-google-client')
  await expect(providerSecret).toHaveValue('synthetic-provider-secret-only')
  await expect(providerPage.getByRole('status').filter({ hasText: strings['forms.changed'] })).toBeVisible()
  const providerApply = providerPage.getByRole('button', { name: strings.apply_768af677, exact: true })
  await expect(providerApply).toBeDisabled()
  await providerPage.getByRole('button', { name: strings['forms.reload'], exact: true }).click()
  await expect(providerID).toHaveValue('second-client-google')
  await expect(providerSecret).toHaveValue('')
  await providerSecret.fill('synthetic-provider-secret-only')
  providerState.failProviderSave = true
  await providerApply.click()
  await expect(
    providerPage.getByRole('alert').filter({ hasText: 'Synthetic provider save rejection' }),
  ).toBeVisible()
  await expect(providerSecret).toHaveValue('synthetic-provider-secret-only')
  await providerApply.click()
  await expect
    .poll(() => providerState.writes.filter((write) => write.resource === 'external/settings/google').length)
    .toBe(2)
  assert.deepEqual(providerState.writes.at(-1).body, {
    clientId: 'second-client-google',
    clientSecret: 'synthetic-provider-secret-only',
    enabled: false,
  })
  await expect(providerSecret).toHaveValue('')
  await providerPage.close()

  const updatesPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const updateState = await mockAPI(updatesPage)
  await openPage(updatesPage, '/system/updates')
  const channel = updatesPage.getByRole('combobox', { name: strings['up.channel'], exact: true })
  await expect(channel).toHaveValue('stable')
  await channel.selectOption('testing')
  updateState.updates = {
    ...updateState.updates,
    settings: { ...updateState.updates.settings, mode: 'auto', hour: 13 },
  }
  await fixtureRefresh(updatesPage, [['system-updates']])
  await expect(channel).toHaveValue('testing')
  await expect(updatesPage.getByRole('status').filter({ hasText: strings['forms.changed'] })).toBeVisible()
  const updatesApply = updatesPage.getByRole('button', { name: strings.apply_768af677, exact: true })
  await expect(updatesApply).toBeDisabled()
  await updatesPage.locator('form').evaluate((form) => form.requestSubmit())
  assert.equal(updateState.writes.length, 0, 'conflicted update settings must not plan or run')
  await updatesPage.getByRole('button', { name: strings['forms.reload'], exact: true }).click()
  await expect(channel).toHaveValue('stable')
  await expect(updatesPage.getByRole('combobox', { name: strings['up.mode'], exact: true })).toHaveValue(
    'auto',
  )
  await updatesPage.close()
  console.log(
    'hostname, port, notifications, provider secret, navigation guard and update conflict behaviors passed',
  )
}

try {
  const text = {}
  for (const lang of localeIDs)
    text[lang] = JSON.parse(await readFile(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url)))
  if (!process.env.SETTINGS_DRAFT_MATRIX_FILTER) await behaviorTests()
  for (const lang of localeIDs) {
    for (const { theme, surface } of surfaces) {
      for (const width of widths) {
        const caseName = `${lang}/${theme}/${surface}/${width}`
        if (process.env.SETTINGS_DRAFT_MATRIX_FILTER && process.env.SETTINGS_DRAFT_MATRIX_FILTER !== caseName)
          continue
        const page = await browser.newPage({ viewport: { width, height: 900 } })
        const errors = []
        page.on('pageerror', (error) => errors.push(error.message))
        const state = await mockAPI(page)
        await openPage(page, '/system/hostname', lang, theme, surface)
        const field = page.getByLabel(text[lang]['hostname.label'], { exact: true })
        await expect(field).toHaveValue('nas-fixture')
        await field.fill('local-conflict-target')
        state.hostname = {
          ...state.hostname,
          hostname: 'external-conflict-target',
          networkName: 'external-conflict-target.local',
        }
        await fixtureRefresh(page, [['hostname']])
        await expect(field).toHaveValue('local-conflict-target')
        await expect(page.getByRole('status').filter({ hasText: text[lang]['forms.changed'] })).toBeVisible()
        await expect(
          page.getByRole('button', { name: text[lang]['apply_768af677'], exact: true }),
        ).toBeDisabled()
        await assertFontAndFormGeometry(page, `${lang}/${theme}/${surface}/${width}`)
        assert.deepEqual(errors, [], `${lang}/${theme}/${surface}/${width}: page errors`)
        await page.close()
        console.log(`${lang}/${theme}/${surface}/${width}: conflict copy, fonts, and form geometry passed`)
      }
    }
  }
} finally {
  await browser.close()
  await server.close()
}
