import { chromium, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const base = process.env.FRONTEND_TEST_URL ?? 'http://127.0.0.1:5173'
const fileDrop = await readFile(
  process.env.FILE_DROP_UI ?? new URL('../../modules/file-drop/dist/ui/index.js', import.meta.url),
  'utf8',
)
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox'],
})
const installed = ['file-drop', 'member-workspace', 'files'].map((id) => ({
  id,
  title: id,
  version: '0.1.7',
  enabled: true,
  files: { 'ui/index.js': 'fixture' },
}))
const retainedModule = `
  const { runtime, react, router } = PaNasMsSDK;
  function Page() {
    const { pathname } = router.useLocation();
    return react.createElement('h1', null, 'Member workspace ' + pathname);
  }
  runtime.registerModule({ id: 'member-workspace', title: 'Member workspace',
    path: '/member-workspace', routes: ['items/:id'], icon: '', memberAccess: true,
    keepAlive: true, component: Page });
  runtime.registerModule({ id: 'files', title: 'Files', path: '/files',
    routes: ['*'], icon: '', component: () => react.createElement('h1', null, 'Files fixture') });
`
const languages = {
  en: {
    sections: 'Sections',
    receive: 'Receive',
    transfers: 'Transfers',
    folder: 'My folder',
    users: 'Users and groups',
  },
  ru: {
    sections: 'Разделы',
    receive: 'Приём',
    transfers: 'Передачи',
    folder: 'Моя папка',
    users: 'Пользователи и группы',
  },
  uk: {
    sections: 'Розділи',
    receive: 'Отримання',
    transfers: 'Передавання',
    folder: 'Моя тека',
    users: 'Користувачі та групи',
  },
}

try {
  for (const [language, labels] of Object.entries(languages)) {
    for (const role of ['user', 'admin']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.route('**/api/v1/**', (route) => {
        const url = new URL(route.request().url())
        if (url.pathname.includes('/module-assets/')) {
          const id = url.pathname.split('/')[4]
          return route.fulfill({
            contentType: 'text/javascript',
            body: id === 'file-drop' ? fileDrop : id === 'member-workspace' ? retainedModule : '',
          })
        }
        const values = {
          session: { username: 'operator', role },
          preferences: { language, theme: 'dark-glass', taskbar: [], taskbarMobile: [] },
          avatar: {},
          wallpaper: {},
          notifications: [],
          modules: { installed },
          jobs: [],
          state: { busy: false, history: [], inbox: '/home/operator/Inbox', defaultInbox: true },
        }
        const key = url.searchParams.get('view') ?? url.pathname.split('/').pop()
        return Object.hasOwn(values, key)
          ? route.fulfill({ json: values[key] })
          : route.fulfill({ status: 503, json: { error: 'Unavailable in fixture' } })
      })

      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(base)
        await page.getByRole('button', { name: labels.sections, exact: true }).click()
        await page.getByRole('link', { name: 'File Drop', exact: true }).click()
        await expect(page.getByRole('heading', { level: 2, name: labels.receive, exact: true })).toHaveCount(
          1,
        )

        for (const [part, title] of [
          ['receive', labels.receive],
          ['transfers', labels.transfers],
          ['folder', labels.folder],
        ]) {
          await page.goto(`${base}/file-drop/${part}`)
          const heading = page.getByRole('heading', { level: 2, name: title, exact: true })
          await expect(heading).toHaveCount(1)
          await expect(page).toHaveURL(`${base}/file-drop/${part}`)
          await page.reload()
          await expect(heading).toHaveCount(1)
        }
        await page.goto(`${base}/member-workspace/items/42`)
        await expect(
          page.getByRole('heading', { name: 'Member workspace /member-workspace/items/42' }),
        ).toHaveCount(1)
        await page.reload()
        await expect(
          page.getByRole('heading', { name: 'Member workspace /member-workspace/items/42' }),
        ).toHaveCount(1)
        await page.goto(`${base}/files/nested/folder`)
        await expect(page.getByRole('heading', { name: 'Files fixture' })).toHaveCount(1)
        await page.goto(`${base}/profile/security/keys`)
        await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveCount(1)
        await expect(page).toHaveURL(`${base}/profile/security/keys`)
        if (role === 'user') {
          for (const path of [
            '/users/accounts',
            '/settings/general',
            '/modules',
            '/files-admin',
            '/file-drop/unknown',
          ]) {
            await page.goto(base + path)
            await expect(page).toHaveURL(base + '/')
          }
        } else {
          await page.goto(base + '/users/accounts')
          await expect(
            page.getByRole('main').getByRole('heading', { level: 1, name: labels.users, exact: true }),
          ).toHaveCount(1)
          await expect(page).toHaveURL(base + '/users/accounts')
        }
      }
      await page.close()
      console.log(`${language} ${role}: passed desktop and phone routes`)
    }
  }
} finally {
  await browser.close()
}
