import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const baseURL = process.env.FRONTEND_TEST_URL ?? 'http://127.0.0.1:15174'
const executablePath = process.env.CHROME_PATH
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const widths = [320, 390, 640, 768, 1024, 1440]
const languages = ['en', 'ru', 'uk']
const themes = ['light', 'dark']
const surfaces = ['solid', 'glass']
const overflowLabels = {
  en: 'More pinned applications',
  ru: 'Другие закреплённые приложения',
  uk: 'Інші закріплені застосунки',
}

function fixtureURL({ role = 'admin', lang = 'en', theme = 'dark', surface = 'solid' } = {}) {
  const url = new URL('/tests/taskbar-overflow.html', baseURL)
  url.search = new URLSearchParams({ role, lang, theme, surface }).toString()
  return url.href
}

async function openFixture(page, options = {}) {
  await page.goto(fixtureURL(options), { waitUntil: 'networkidle' })
  await page.locator('.application-bar').waitFor()
  await page.waitForFunction(() => document.querySelector('.pinned-applications a[data-app-id]'))
  const font = await page.evaluate(async () => {
    const faces = await document.fonts.load('16px "Manrope Variable"', 'Taskbar overflow')
    await document.fonts.ready
    return {
      ready: document.fonts.check('16px "Manrope Variable"', 'Taskbar overflow'),
      family: getComputedStyle(document.body).fontFamily,
      loaded: faces.some((face) => face.family === 'Manrope Variable' && face.status === 'loaded'),
    }
  })
  assert.match(font.family, /Manrope Variable/)
  assert.equal(font.ready, true, 'Manrope Variable should be available after document.fonts.ready')
  assert.equal(font.loaded, true, 'the Manrope Variable face for fixture text should be loaded')
}

function trackRuntime(page) {
  const errors = []
  const failedFonts = []
  const loadedFonts = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${message.text()} (${JSON.stringify(message.location())})`)
  })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('requestfailed', (request) => {
    if (request.resourceType() === 'font') {
      failedFonts.push(`${request.url()}: ${request.failure()?.errorText ?? 'request failed'}`)
    }
  })
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`)
    if (response.request().resourceType() === 'font') {
      if (response.status() >= 400) failedFonts.push(`${response.url()}: HTTP ${response.status()}`)
      else loadedFonts.push(response.url())
    }
  })
  return () => {
    assert.deepEqual(errors, [], `browser console/page errors: ${errors.join('; ')}`)
    assert.deepEqual(failedFonts, [], `font request errors: ${failedFonts.join('; ')}`)
    assert.ok(loadedFonts.length > 0, 'Manrope Variable must be served by a successful font request')
  }
}

async function fixtureWrites(page) {
  return page.evaluate(() => window.__taskbarFixture?.preferenceWrites ?? [])
}

async function assertNoOverflowOrOverlap(page, width) {
  const result = await page.evaluate(() => {
    const boxes = (selector) =>
      [...document.querySelectorAll(selector)]
        .filter((element) => element.getClientRects().length)
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return {
            name: element.className?.baseVal ?? element.className ?? element.tagName,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          }
        })
    const bars = boxes('header.topbar, header.phone-header, nav.phone-taskbar')
    const groups = [
      boxes(
        '.application-bar > :is(.app-launcher, .desktop-home, .pinned-applications, .application-separator, .ongoing-tasks, .fixture-background-indicator)',
      ),
      boxes('.pinned-applications > :is(a, button)'),
      boxes('.topbar-right > :is(button, details) > :is(button, summary), .topbar-right > button'),
      boxes('.phone-taskbar > details > summary'),
      boxes('.ongoing-tasks'),
      boxes('.ongoing-row'),
      boxes('.phone-header .topbar-right'),
      boxes('.phone-taskbar .application-bar'),
    ]
    const overlap = groups.flatMap((group) =>
      group.slice(0, -1).flatMap((left, index) =>
        group
          .slice(index + 1)
          .filter(
            (right) =>
              left.left < right.right - 1 &&
              right.left < left.right - 1 &&
              left.top < right.bottom - 1 &&
              right.top < left.bottom - 1,
          )
          .map((right) => `${left.name} overlaps ${right.name}`),
      ),
    )
    return {
      viewport: document.documentElement.clientWidth,
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      bars,
      overflowContainers: boxes(
        '.application-bar, .pinned-applications, .topbar, .phone-header, .phone-taskbar',
      ),
      overlap,
    }
  })
  assert.equal(
    result.document,
    result.viewport,
    `document has horizontal overflow at ${width}px: ${JSON.stringify(result)}`,
  )
  assert.equal(
    result.body,
    result.viewport,
    `body has horizontal overflow at ${width}px: ${JSON.stringify(result)}`,
  )
  assert.deepEqual(
    result.overlap,
    [],
    `toolbar controls overlap at ${width}px: ${JSON.stringify(result.overlap)}`,
  )
  for (const box of result.overflowContainers) {
    assert.ok(
      box.right <= result.viewport + 1,
      `${box.name} crosses viewport edge at ${width}px: ${JSON.stringify(box)}`,
    )
  }
}

async function assertVisibleControlsHaveTargets(page, width) {
  const failures = await page.evaluate(() => {
    const controls = [
      ...document.querySelectorAll(
        '.topbar button, .topbar a, .topbar summary, .phone-header button, .phone-header a, .phone-header summary, .phone-taskbar button, .phone-taskbar a, .phone-taskbar summary',
      ),
    ]
      .filter(
        (element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden',
      )
      .filter((element) => !element.closest('details') || element.matches('summary'))
    return controls.flatMap((element) => {
      const rect = element.getBoundingClientRect()
      const name =
        element.getAttribute('aria-label') ||
        element.getAttribute('title') ||
        element.textContent?.trim() ||
        element.tagName
      if (rect.width < 43.95 || rect.height < 43.95)
        return [`${name} is ${rect.width.toFixed(1)}×${rect.height.toFixed(1)}`]
      if (
        rect.right <= 0 ||
        rect.bottom <= 0 ||
        rect.left >= document.documentElement.clientWidth ||
        rect.top >= document.documentElement.clientHeight
      )
        return []
      const points = [
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
        [rect.left + 2, rect.top + rect.height / 2],
        [rect.right - 2, rect.top + rect.height / 2],
        [rect.left + rect.width / 2, rect.top + 2],
        [rect.left + rect.width / 2, rect.bottom - 2],
      ]
      return points.flatMap(([x, y]) => {
        const target = document.elementFromPoint(x, y)
        return target && (target === element || element.contains(target))
          ? []
          : [`${name} misses hit target at ${Math.round(x)},${Math.round(y)}`]
      })
    })
  })
  assert.deepEqual(failures, [], `toolbar hit-target failures at ${width}px: ${failures.join('; ')}`)
}

async function verifyPinOverflow(page, lang, width) {
  const count = width < 640 ? 3 : 8
  const trigger = page.getByRole('button', { name: overflowLabels[lang], exact: true })
  if (await trigger.isVisible().catch(() => false)) {
    await trigger.click()
    const menu = page.locator('.pinned-overflow-menu')
    await menu.waitFor()
    assert.equal(
      (await page.locator('.pinned-applications > a[data-app-id]').count()) +
        (await menu.locator('a[data-app-id]').count()),
      count,
      `all ${count} pins should be reachable at ${width}px`,
    )
    assert.ok(await menu.locator('a[data-app-id]').first().innerText())
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.pinned-overflow-menu'))
    assert.equal(
      await page.evaluate(() => document.activeElement?.classList.contains('pinned-overflow-trigger')),
      true,
      'Escape should return focus to overflow trigger',
    )
  } else {
    assert.equal(
      await page.locator('.pinned-applications > a[data-app-id]').count(),
      count,
      `all ${count} pins should fit when overflow trigger is absent at ${width}px`,
    )
  }
}

try {
  for (const role of ['admin', 'member']) {
    for (const lang of languages) {
      for (const theme of themes) {
        for (const surface of surfaces) {
          const page = await browser.newPage({
            viewport: { width: 320, height: 900 },
            deviceScaleFactor: 1,
            isMobile: true,
            hasTouch: true,
          })
          const assertRuntimeHealthy = trackRuntime(page)
          await openFixture(page, { role, lang, theme, surface })
          if (role === 'admin') {
            assert.equal(await page.locator('.ongoing-row').count(), 1)
            assert.equal(await page.locator('.ongoing-row-more').innerText(), '+2')
          }
          for (const width of widths) {
            await page.setViewportSize({ width, height: 900 })
            await page.waitForTimeout(80)
            await assertNoOverflowOrOverlap(page, width)
            await assertVisibleControlsHaveTargets(page, width)
            await verifyPinOverflow(page, lang, width)
          }
          assert.deepEqual(
            await fixtureWrites(page),
            [],
            `resize/overflow interaction must not save preferences (${role}/${lang}/${theme}/${surface})`,
          )
          assertRuntimeHealthy()
          await page.close()
        }
      }
    }
  }

  // Verify hidden links remain usable, are selected as the current page, and close on outside click.
  {
    const page = await browser.newPage({ viewport: { width: 640, height: 900 } })
    await openFixture(page, { role: 'admin', lang: 'en' })
    const trigger = page.getByRole('button', { name: overflowLabels.en, exact: true })
    await trigger.click()
    const menu = page.locator('.pinned-overflow-menu')
    const hiddenPin = menu.locator('a[data-app-id]').first()
    const hiddenId = await hiddenPin.getAttribute('data-app-id')
    const hiddenName = await hiddenPin.innerText()
    await hiddenPin.click()
    await page.getByRole('heading', { name: `Destination: ${hiddenName}`, exact: true }).waitFor()
    await page.locator('.pinned-overflow-trigger').click()
    await page.locator(`.pinned-overflow-menu a[data-app-id="${hiddenId}"][aria-current="page"]`).waitFor()
    const viewport = page.viewportSize()
    await page.mouse.click(viewport.width - 3, 4)
    await page.waitForFunction(() => !document.querySelector('.pinned-overflow-menu'))
    await page.close()
  }

  // The overflow, launcher, and Tasks popovers must be mutually exclusive.
  {
    const page = await browser.newPage({ viewport: { width: 640, height: 900 } })
    await openFixture(page, { role: 'admin', lang: 'en' })
    const overflow = page.locator('.pinned-overflow-trigger')
    await overflow.click()
    await page.getByRole('button', { name: 'Sections', exact: true }).click()
    await page.locator('.app-launcher-menu[aria-label="NAS sections"]').waitFor()
    assert.equal(await page.locator('.pinned-overflow-menu').count(), 0)
    await page.locator('.activity-menu summary[aria-label="Tasks"]').click()
    await page.locator('.activity-dropdown[aria-label="Tasks"]').waitFor()
    assert.equal(await page.locator('.app-launcher-menu').count(), 0)
    assert.equal(await page.locator('.pinned-overflow-menu').count(), 0)
    await page.close()
  }

  // A focused hidden pin stays available while the viewport changes; resize itself never writes preferences.
  {
    const page = await browser.newPage({ viewport: { width: 640, height: 900 } })
    await openFixture(page, { role: 'admin', lang: 'en' })
    await page.locator('.pinned-overflow-trigger').click()
    const pin = page.locator('.pinned-overflow-menu a[data-app-id]').first()
    const id = await pin.getAttribute('data-app-id')
    await pin.focus()
    await page.setViewportSize({ width: 768, height: 900 })
    await page.waitForTimeout(100)
    const available = page.locator(`.application-bar a[data-app-id="${id}"]`)
    assert.equal(await available.count(), 1, `focused pin ${id} should remain represented after resize`)
    assert.notEqual(await available.evaluate((node) => getComputedStyle(node).display), 'none')
    await page.waitForFunction(
      (expectedID) => document.activeElement?.getAttribute('data-app-id') === expectedID,
      id,
    )
    assert.deepEqual(await fixtureWrites(page), [])
    await page.close()
  }

  // Keyboard reorder across the visible/overflow boundary persists exactly the changed ordering and keeps focus in the bar.
  {
    const page = await browser.newPage({ viewport: { width: 640, height: 900 } })
    await openFixture(page, { role: 'admin', lang: 'en' })
    await page.waitForFunction(() => window.__taskbarFixture?.preferences?.taskbar?.length === 8)
    const initialOrder = await page.evaluate(() => window.__taskbarFixture.preferences.taskbar)
    const visible = page.locator('.pinned-applications > a[data-app-id]')
    const source = visible.last()
    const sourceId = await source.getAttribute('data-app-id')
    const sourceIndex = Number(
      await source.evaluate((node) =>
        [...node.parentElement.querySelectorAll(':scope > a[data-app-id]')].indexOf(node),
      ),
    )
    await source.focus()
    await page.keyboard.press('Alt+ArrowRight')
    await page.waitForFunction(() => window.__taskbarFixture?.preferenceWrites?.length === 1)
    const writes = await fixtureWrites(page)
    const savedOrder = writes[0].taskbar
    assert.equal(savedOrder[sourceIndex], initialOrder[sourceIndex + 1])
    assert.equal(savedOrder[sourceIndex + 1], sourceId)
    await page.waitForFunction(() =>
      document.querySelector('.application-bar')?.contains(document.activeElement),
    )
    assert.equal(
      await page.locator('.application-bar').evaluate((node) => node.contains(document.activeElement)),
      true,
      'focus should remain in the application bar after reordering',
    )
    await page.close()
  }

  console.log(
    'Taskbar overflow browser checks passed (24 role/locale/theme/surface combinations × 6 widths, plus interaction checks).',
  )
} finally {
  await browser.close()
}
