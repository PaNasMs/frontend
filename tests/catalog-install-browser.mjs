import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH })
try {
  for (const obsolete of ['submission', 'job']) {
    const page = await browser.newPage()
    const operation = { action: 'module.catalog-install', params: { target: 'notes', version: '2.0' } }
    const plans = [],
      runs = []
    const stale = 'State has changed. Review a new operation plan.'
    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url())
      const view = url.searchParams.get('view') ?? url.pathname.split('/').pop()
      const reply = (json) => route.fulfill({ json })
      if (view === 'plan') {
        assert.deepEqual(route.request().postDataJSON(), operation)
        const n = plans.length + 1
        const plan = {
          target: 'Notes',
          details: ['Install: Notes 2.0', `Install: Parser 1.${n}`],
          fingerprint: `opaque:${n}`,
          confirmation: ` Confirm ${n}! `,
        }
        plans.push(plan)
        return reply(plan)
      }
      if (view === 'run') {
        const body = route.request().postDataJSON()
        runs.push(body)
        if (runs.length === 1 && obsolete === 'submission')
          return route.fulfill({ status: 409, json: { error: stale } })
        return reply({ id: body.id })
      }
      const values = {
        session: { username: 'operator', role: 'admin' },
        preferences: { language: 'en', taskbar: [], taskbarMobile: [] },
        notifications: [],
        modules: { installed: [] },
        'module-catalog': {
          available: [{ id: 'notes', title: 'Notes listing', version: '2.0', requiredBy: [] }],
        },
        jobs: runs.map(({ id }, index) => ({
          id,
          status: index === 0 ? 'failed' : 'succeeded',
          stage: index === 0 ? stale : 'Done',
        })),
      }
      return Object.hasOwn(values, view)
        ? reply(values[view])
        : route.fulfill({ status: 404, json: { error: 'Unavailable in fixture' } })
    })
    await page.goto((process.env.FRONTEND_TEST_URL ?? 'http://127.0.0.1:5173') + '/modules')
    const install = page.getByRole('button', { name: 'Install 2.0', exact: true })
    const dialog = page.getByRole('dialog', { name: 'Install modules' })
    const confirm = dialog.getByRole('button', { name: 'Confirm', exact: true })
    await install.click()
    await expect(dialog.getByText('Install: Notes 2.0')).toBeVisible()
    await expect(dialog.getByText('Install: Parser 1.1')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    assert.equal(runs.length, 0)
    await install.click()
    await expect(dialog.getByText('Install: Parser 1.2')).toBeVisible()
    await confirm.click()
    await expect(dialog.getByText('Install: Parser 1.3')).toBeVisible()
    await expect(dialog.getByText('Install: Parser 1.2')).toHaveCount(0)
    assert.equal(runs.length, 1)
    await confirm.click()
    await expect.poll(() => runs.length).toBe(2)
    for (const [i, { id, ...payload }] of runs.entries()) {
      assert.ok(id)
      const { fingerprint, confirmation } = plans[i + 1]
      assert.deepEqual(payload, { ...operation, fingerprint, confirmation })
    }
    await page.close()
  }
  console.log('PASS catalog install: cancel, confirm, review replacement after submission or job rejection')
} finally {
  await browser.close()
}
