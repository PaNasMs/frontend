import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'

const base = process.env.FRONTEND_TEST_URL ?? 'http://127.0.0.1:15175'
const launchOptions = { headless: true, args: ['--no-sandbox'] }
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH
const browser = await chromium.launch(launchOptions)

const tile = (id, kind, x, y, config) => ({
  id,
  kind,
  x,
  y,
  ...(config ? { config } : {}),
})
const initialPreferences = () => ({
  language: 'en',
  theme: 'dark',
  taskbar: ['settings', 'storage'],
  layouts: { wide: ['settings'], mobile: ['storage'] },
  desktopLayouts: {
    wide: [tile('wide-alpha', 'test-alpha', 0, 0), tile('wide-beta', 'test-beta', 1, 0)],
    medium: [tile('medium-alpha', 'test-alpha', 0, 0)],
    mobile: [tile('mobile-beta', 'test-beta', 0, 0)],
  },
})

async function openDashboard(language = 'en', width = 1280) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
  const errors = []
  const calls = []
  let preferences = initialPreferences()
  let failSave = false
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/preferences') {
      if (request.method() === 'PUT') {
        const body = request.postDataJSON()
        calls.push(structuredClone(body))
        if (failSave) return route.fulfill({ status: 503, json: { error: 'Fixture save failure' } })
        preferences = body
      }
      return route.fulfill({ json: structuredClone(preferences) })
    }
    if (path === '/api/v1/metrics')
      return route.fulfill({
        json: { cpu: 1, memoryUsed: 1, memoryTotal: 2, observedAt: new Date().toISOString() },
      })
    if (path === '/api/v1/wallpaper') return route.fulfill({ json: { version: '' } })
    return route.fulfill({ status: 404, json: { error: 'Unexpected fixture endpoint' } })
  })
  await page.goto(`${base}/tests/desktop-drafts.html?lang=${language}`)
  await page.getByRole('link', { name: 'Open dashboard' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  return {
    page,
    errors,
    calls,
    get preferences() {
      return preferences
    },
    set preferences(value) {
      preferences = value
    },
    set failSave(value) {
      failSave = value
    },
  }
}

const editLabels = {
  en: {
    customize: 'Customize desktop',
    save: 'Save layouts',
    discard: 'Discard changes',
    picker: 'Widget or shortcut',
    add: 'Add to desktop',
    cell: (x, y) => `Cell ${x}, ${y}`,
    cancel: 'Cancel',
    discardSession: 'Discard changes',
  },
  ru: {
    customize: 'Настроить рабочий стол',
    save: 'Сохранить раскладки',
    discard: 'Отменить изменения',
    picker: 'Виджет или ярлык',
    add: 'Добавить на рабочий стол',
    cell: (x, y) => `Ячейка ${x}, ${y}`,
    cancel: 'Отмена',
    discardSession: 'Не сохранять',
  },
  uk: {
    customize: 'Налаштувати робочий стіл',
    save: 'Зберегти розкладки',
    discard: 'Скасувати зміни',
    picker: 'Віджет або ярлик',
    add: 'Додати на робочий стіл',
    cell: (x, y) => `Клітинка ${x}, ${y}`,
    cancel: 'Скасувати',
    discardSession: 'Не зберігати',
  },
}
const guidance = {
  en: 'Resizing keeps your edits. Save or discard applies to all edited layouts.',
  ru: 'Изменение размера сохраняет правки. Сохранение или отмена применяется ко всем изменённым раскладкам.',
  uk: 'Зміна розміру зберігає правки. Збереження або скасування застосовується до всіх змінених розкладок.',
}
const overflowCases = []

async function beginEditing(page, language = 'en') {
  await page.getByRole('button', { name: editLabels[language].customize }).click()
  await expect(page.getByRole('button', { name: editLabels[language].save })).toBeVisible()
}

async function setViewport(page, width) {
  await page.setViewportSize({ width, height: 900 })
  await page.waitForTimeout(100)
}

async function moveWithKeyboard(page, title, cellName) {
  const moveButton = page.getByRole('button', { name: `Move ${title}`, exact: true })
  await moveButton.focus()
  await moveButton.press('Enter')
  const cell = page.getByRole('button', { name: cellName, exact: true })
  await cell.focus()
  await cell.press('Enter')
}

async function tileColumn(page, kind) {
  return page
    .locator('.coordinate-tile')
    .filter({ hasText: kind })
    .evaluate((element) => {
      const start = element.style.gridColumn.match(/^\s*(\d+)/)
      return start ? Number(start[1]) : 0
    })
}

try {
  {
    const { page, calls, errors } = await openDashboard()
    await beginEditing(page)

    await page.getByLabel('Widget or shortcut').selectOption('test-gamma')
    await page.getByRole('button', { name: 'Add to desktop' }).click()
    await page.getByRole('button', { name: 'Remove Alpha widget', exact: true }).click()
    await page.getByRole('button', { name: 'Move Beta widget', exact: true }).focus()
    await page.getByRole('button', { name: 'Move Beta widget', exact: true }).press('Enter')
    await expect(page.locator('.coordinate-tile').filter({ hasText: 'test-beta' })).toHaveClass(/moving/)
    await page.getByRole('button', { name: 'Cell 4, 1', exact: true }).focus()
    await page.getByRole('button', { name: 'Cell 4, 1', exact: true }).press('Enter')
    await expect.poll(() => tileColumn(page, 'test-beta')).toBe(4)

    await setViewport(page, 800)
    await expect(page.locator('.coordinate-tile').filter({ hasText: 'test-alpha' })).toHaveCount(1)
    await moveWithKeyboard(page, 'Alpha widget', 'Cell 3, 1')
    await expect.poll(() => tileColumn(page, 'test-alpha')).toBe(3)

    await setViewport(page, 375)
    await page.getByRole('button', { name: 'Remove Beta widget', exact: true }).click()
    await expect(page.locator('.coordinate-tile').filter({ hasText: 'test-beta' })).toHaveCount(0)
    await setViewport(page, 1280)
    await expect(page.getByRole('button', { name: 'Save layouts' })).toBeVisible()
    await expect.poll(() => tileColumn(page, 'test-beta')).toBe(4)
    await expect(page.locator('.coordinate-tile').filter({ hasText: 'test-alpha' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Save layouts' }).click()
    await expect(page.getByRole('button', { name: 'Customize desktop' })).toBeVisible()
    expect(calls).toHaveLength(1)
    const saved = calls[0]
    expect(saved.desktopLayouts.wide.some((item) => item.kind === 'test-gamma')).toBe(true)
    expect(saved.desktopLayouts.wide.some((item) => item.kind === 'test-alpha')).toBe(false)
    expect(saved.desktopLayouts.wide.find((item) => item.kind === 'test-beta')).toMatchObject({ x: 3, y: 0 })
    expect(saved.desktopLayouts.medium.find((item) => item.kind === 'test-alpha')).toMatchObject({
      x: 2,
      y: 0,
    })
    expect(saved.desktopLayouts.mobile).toEqual([])
    expect(saved.taskbar).toEqual(['settings', 'storage'])
    expect(saved.layouts).toEqual({ wide: ['settings'], mobile: ['storage'] })
    expect(saved.theme).toBe('dark')
    expect(errors).toEqual([])
    await page.close()
  }

  {
    const { page, calls } = await openDashboard()
    await beginEditing(page)
    await page.getByRole('button', { name: 'Remove Alpha widget', exact: true }).click()
    await page.getByRole('button', { name: 'Save layouts' }).click()
    await expect(page.getByRole('button', { name: 'Customize desktop' })).toBeVisible()
    expect(calls).toHaveLength(1)
    expect(calls[0].desktopLayouts.medium).toEqual(initialPreferences().desktopLayouts.medium)
    expect(calls[0].desktopLayouts.mobile).toEqual(initialPreferences().desktopLayouts.mobile)
    await page.close()
  }

  {
    const { page, errors } = await openDashboard()
    await beginEditing(page)
    await page.getByRole('button', { name: 'Remove Alpha widget', exact: true }).click()
    await setViewport(page, 800)
    await moveWithKeyboard(page, 'Alpha widget', 'Cell 3, 1')
    await expect.poll(() => tileColumn(page, 'test-alpha')).toBe(3)
    await setViewport(page, 1280)
    await page.getByRole('link', { name: 'Leave dashboard' }).click()
    const dialog = page.getByRole('dialog', { name: 'Discard unsaved changes?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Save layouts' })).toBeVisible()
    await expect(page.locator('.coordinate-tile').filter({ hasText: 'test-alpha' })).toHaveCount(0)
    await page.getByRole('link', { name: 'Leave dashboard' }).click()
    await page
      .getByRole('dialog', { name: 'Discard unsaved changes?' })
      .getByRole('button', { name: 'Discard changes', exact: true })
      .click()
    await expect(page.getByRole('link', { name: 'Open dashboard' })).toBeVisible()
    await page.getByRole('link', { name: 'Open dashboard' }).click()
    await beginEditing(page)
    await expect(page.locator('.coordinate-tile').filter({ hasText: 'test-alpha' })).toHaveCount(1)
    await expect.poll(() => tileColumn(page, 'test-beta')).toBe(2)
    await setViewport(page, 800)
    await expect.poll(() => tileColumn(page, 'test-alpha')).toBe(1)
    await expect(page.getByRole('button', { name: 'Save layouts' })).toBeDisabled()
    expect(errors).toEqual([])
    await page.close()
  }

  {
    const { page, errors } = await openDashboard()
    await beginEditing(page)
    await moveWithKeyboard(page, 'Beta widget', 'Cell 4, 1')
    await expect.poll(() => tileColumn(page, 'test-beta')).toBe(4)
    await expect(page.getByRole('button', { name: 'Save layouts' })).toBeEnabled()
    await page.goBack()
    const dialog = page.getByRole('dialog', { name: 'Discard unsaved changes?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Save layouts' })).toBeVisible()
    await page.goBack()
    await page
      .getByRole('dialog', { name: 'Discard unsaved changes?' })
      .getByRole('button', { name: 'Discard changes', exact: true })
      .click()
    await expect(page.getByRole('link', { name: 'Open dashboard' })).toBeVisible()
    expect(errors).toEqual([])
    await page.close()
  }

  {
    const state = await openDashboard()
    const { page, calls, errors } = state
    await beginEditing(page)
    await page.getByRole('button', { name: 'Remove Alpha widget', exact: true }).click()
    state.failSave = true
    await page.getByRole('button', { name: 'Save layouts' }).click()
    await expect(page.getByRole('button', { name: 'Save layouts' })).toBeVisible()
    await expect(page.locator('.coordinate-tile').filter({ hasText: 'test-alpha' })).toHaveCount(0)
    await expect(page.getByRole('alert')).toBeVisible()
    expect(calls).toHaveLength(1)
    expect(errors).toEqual([])
    await page.close()
  }

  {
    const state = await openDashboard()
    const { page, calls, errors } = state
    await beginEditing(page)
    await page.getByRole('button', { name: 'Remove Alpha widget', exact: true }).click()
    state.preferences = {
      ...state.preferences,
      desktopLayouts: {
        ...state.preferences.desktopLayouts,
        wide: [...state.preferences.desktopLayouts.wide, tile('external-change', 'test-gamma', 5, 0)],
      },
    }
    await page.getByRole('button', { name: 'Save layouts' }).click()
    await expect(page.getByRole('button', { name: 'Save layouts' })).toBeVisible()
    await expect(
      page.getByText('The layout was changed from the application menu. Cancel editing and start again.'),
    ).toBeVisible()
    await expect(page.locator('.coordinate-tile').filter({ hasText: 'test-alpha' })).toHaveCount(0)
    expect(calls).toHaveLength(0)
    expect(errors).toEqual([])
    await page.close()
  }

  {
    const { page, errors } = await openDashboard()
    await beginEditing(page)
    await page.getByRole('button', { name: 'Configure: Beta widget' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Widget label').fill('edited configuration')
    await setViewport(page, 375)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Widget label')).toHaveValue('edited configuration')
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
    await setViewport(page, 1280)
    await page.getByRole('button', { name: 'Configure: Beta widget' }).click()
    await expect(page.getByRole('dialog').getByLabel('Widget label')).toHaveValue('edited configuration')
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(errors).toEqual([])
    await page.close()
  }

  for (const language of ['en', 'ru', 'uk']) {
    const { page, errors } = await openDashboard(language, 320)
    expect(await page.evaluate(() => getComputedStyle(document.body).minWidth)).toBe('0px')
    await beginEditing(page, language)
    await expect(page.getByRole('button', { name: editLabels[language].discard })).toBeVisible()
    await expect(page.getByRole('status')).toContainText(guidance[language])
    for (const theme of ['dark', 'light']) {
      for (const surface of ['solid', 'glass']) {
        await page.evaluate(
          ({ theme, surface }) => {
            document.documentElement.dataset.theme = theme
            document.documentElement.dataset.surface = surface
          },
          { theme, surface },
        )
        for (const width of [320, 1440]) {
          await setViewport(page, width)
          const dimensions = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth,
            bodyMinWidth: getComputedStyle(document.body).minWidth,
            overflowing: [...document.querySelectorAll('body *')]
              .map((element) => {
                const rect = element.getBoundingClientRect()
                return {
                  tag: element.tagName,
                  className: element.className,
                  left: rect.left,
                  right: rect.right,
                }
              })
              .filter((element) => element.right > innerWidth + 1 || element.left < -1)
              .slice(0, 8),
          }))
          expect(
            dimensions.overflowing,
            `${language}/${theme}/${surface}/${width} offscreen element bounds`,
          ).toEqual([])
          if (dimensions.scrollWidth > dimensions.innerWidth)
            overflowCases.push({ language, theme, surface, width, ...dimensions })
          if (language === 'ru' && theme === 'dark' && surface === 'glass' && width === 320)
            await page.screenshot({ path: '/tmp/ux04-ru-dark-glass-320.png', fullPage: true })
        }
      }
    }
    await page.getByRole('button', { name: editLabels[language].discard }).click()
    expect(errors).toEqual([])
    await page.close()
  }

  assert.deepEqual(overflowCases, [], `document horizontal overflow: ${JSON.stringify(overflowCases)}`)
  console.log(
    'PASS desktop drafts: responsive editing, independent layouts, combined preference save, navigation guard, save errors, conflict detection, configuration and EN/RU/UK controls',
  )
} finally {
  await browser.close()
}
