import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Link, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { mdiFolderOutline } from '@mdi/js'
import { ApplicationBar } from '../src/app/application-bar'
import { ActivityMenus } from '../src/app/activity-menus'
import { OngoingTasks } from '../src/app/ongoing-tasks'
import { RemovableMenu } from '../src/app/removable'
import { modules, registerModule, setModuleAccess } from '../src/app/module-registry'
import { operations } from '../src/app/operations'
import { usePhone } from '../src/home/screen'
import { initializeLanguage } from '../src/i18n'
import { Icon } from '../src/shared/ui'
import { mdiSync } from '@mdi/js'
import '../src/style.css'
import '../src/design-system.css'
import '../src/home/components.css'

const moduleIDs = [
  'users',
  'storage',
  'files',
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'zeta',
  'eta',
  'theta',
  'iota',
]
const params = new URLSearchParams(location.search)
const language = params.get('lang') ?? 'en'
const localizedTitles: Record<string, Record<string, string>> = {
  en: {
    users: 'Users and groups',
    storage: 'Storage',
    files: 'Files',
    'fixture-job': 'System update check',
    alpha: 'Additional section with a long name Alpha',
    beta: 'Additional section with a long name Beta',
    gamma: 'Additional section with a long name Gamma',
    delta: 'Additional section with a long name Delta',
    epsilon: 'Additional section with a long name Epsilon',
    zeta: 'Additional section with a long name Zeta',
    eta: 'Additional section with a long name Eta',
    theta: 'Additional section with a long name Theta',
    iota: 'Additional section with a long name Iota',
    'sync-indicator': 'Sync monitor',
  },
  ru: {
    users: 'Пользователи и группы',
    storage: 'Хранилище',
    files: 'Файлы',
    'fixture-job': 'Проверка обновлений системы',
    alpha: 'Дополнительный раздел с длинным названием Альфа',
    beta: 'Дополнительный раздел с длинным названием Бета',
    gamma: 'Дополнительный раздел с длинным названием Гамма',
    delta: 'Дополнительный раздел с длинным названием Дельта',
    epsilon: 'Дополнительный раздел с длинным названием Эпсилон',
    zeta: 'Дополнительный раздел с длинным названием Дзета',
    eta: 'Дополнительный раздел с длинным названием Эта',
    theta: 'Дополнительный раздел с длинным названием Тета',
    iota: 'Дополнительный раздел с длинным названием Йота',
    'sync-indicator': 'Синхронизация',
  },
  uk: {
    users: 'Користувачі та групи',
    storage: 'Сховище',
    files: 'Файли',
    'fixture-job': 'Перевірка оновлень системи',
    alpha: 'Додатковий розділ із довгою назвою Альфа',
    beta: 'Додатковий розділ із довгою назвою Бета',
    gamma: 'Додатковий розділ із довгою назвою Гамма',
    delta: 'Додатковий розділ із довгою назвою Дельта',
    epsilon: 'Додатковий розділ із довгою назвою Епсилон',
    zeta: 'Додатковий розділ із довгою назвою Дзета',
    eta: 'Додатковий розділ із довгою назвою Ета',
    theta: 'Додатковий розділ із довгою назвою Тета',
    iota: 'Додатковий розділ із довгою назвою Йота',
    'sync-indicator': 'Синхронізація',
  },
}
const titles = localizedTitles[language] ?? localizedTitles.en

function Destination() {
  const location = useLocation()
  const id = location.pathname.slice(1)
  return <h1>{id ? `Destination: ${titles[id] ?? id}` : 'Desktop'}</h1>
}

function BackgroundIndicator() {
  return (
    <button
      type="button"
      className="topbar-action fixture-background-indicator"
      aria-label={titles['sync-indicator']}
      title={titles['sync-indicator']}
    >
      <Icon path={mdiSync} />
    </button>
  )
}

for (const id of moduleIDs) {
  registerModule({
    id,
    title: titles[id],
    path: `/${id}`,
    icon: mdiFolderOutline,
    memberAccess: true,
    component: Destination,
  })
}
registerModule({
  id: 'sync-indicator',
  title: titles['sync-indicator'],
  path: '/sync-indicator',
  icon: mdiFolderOutline,
  memberAccess: true,
  component: Destination,
  backgroundIndicator: BackgroundIndicator,
})

const role = params.get('role') === 'member' ? 'member' : 'admin'
setModuleAccess(role === 'admin')
await initializeLanguage(language)
operations['fixture.background'] = { label: titles['fixture-job'], fields: [] }
document.documentElement.dataset.theme = params.get('theme') ?? 'dark'
document.documentElement.dataset.surface = params.get('surface') ?? 'solid'
history.replaceState({}, '', '/')

const desktopPins = ['users', 'storage', 'files', 'alpha', 'beta', 'gamma', 'delta', 'epsilon']
const phonePins = ['alpha', 'beta', 'gamma']
let preferences = {
  language,
  theme: params.get('theme') === 'light' ? 'light' : 'dark',
  taskbar: desktopPins,
  taskbarMobile: phonePins,
  layouts: { wide: [], medium: [], mobile: [] },
  desktopLayouts: {},
}
const jobs = ['alpha', 'beta', 'gamma'].map((name, index) => ({
  id: `fixture-job-${index + 1}`,
  user: 'fixture',
  action: 'fixture.background',
  target: `fixture ${name} update channel`,
  stage: 'Checking for updates',
  percent: 42 + index,
  status: 'running',
  created: '2026-11-14T00:00:00.000Z',
  updated: '2026-11-14T00:01:00.000Z',
  result: {},
  canCancel: true,
  cancelRequested: false,
  needsReview: false,
}))
const removableDevices = [
  {
    path: '/dev/sdb',
    type: 'disk',
    tran: 'usb',
    model: 'Fixture USB',
    name: 'Fixture USB',
    size: 8 * 1024 * 1024 * 1024,
    ejectable: true,
    mountpoints: [],
  },
  {
    path: '/dev/sdb1',
    parent: '/dev/sdb',
    type: 'part',
    fstype: 'ext4',
    uuid: 'fixture-uuid',
    name: 'Fixture volume',
    size: 8 * 1024 * 1024 * 1024,
    mountpoints: [],
  },
]
const fixtureState = {
  preferences,
  holdPreferenceWrites: false,
  releasePreferenceWrite: null as (() => void) | null,
  preferenceWrites: [] as Record<string, unknown>[],
}
;(window as Window & { __taskbarFixture?: typeof fixtureState }).__taskbarFixture = fixtureState
const originalFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const rawURL = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const url = new URL(rawURL, location.origin)
  if (!url.pathname.startsWith('/api/v1/')) return originalFetch(input, init)
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
  let value: unknown = {}
  if (url.pathname === '/api/v1/preferences') {
    if (method === 'PUT') {
      if (fixtureState.holdPreferenceWrites)
        await new Promise<void>((resolve) => {
          fixtureState.releasePreferenceWrite = resolve
        })
      const next = JSON.parse(String(init?.body ?? '{}')) as typeof preferences
      fixtureState.preferences = next
      fixtureState.preferenceWrites.push(structuredClone(next))
    }
    value = fixtureState.preferences
  } else if (url.pathname === '/api/v1/session') {
    value = { username: 'fixture', name: 'Fixture user', role }
  } else if (url.pathname === '/api/v1/storage') {
    value = { devices: [], mounts: [], arrays: [], observedAt: new Date().toISOString() }
  } else if (url.pathname === '/api/v1/notifications') {
    value = []
  } else if (url.pathname === '/api/v1/manage' && url.searchParams.get('view') === 'jobs') {
    value = jobs
  } else if (url.pathname === '/api/v1/manage' && url.searchParams.get('view') === 'storage-options') {
    value = { devices: removableDevices }
  } else if (url.pathname === '/api/v1/avatar') {
    value = { version: '' }
  } else {
    return new Response(JSON.stringify({ error: `Unexpected fixture endpoint: ${url.pathname}` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function Shell() {
  const phone = usePhone()
  const admin = role === 'admin'
  const Indicator = modules().find((module) => module.backgroundIndicator)?.backgroundIndicator
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {phone ? (
        <header className="phone-header">
          <span className="phone-title" aria-hidden="true">
            Desktop
          </span>
          <div className="topbar-right">
            {Indicator && <Indicator />}
            {admin && <RemovableMenu />}
            <ActivityMenus only="notifications" />
            <details className="profile-menu">
              <summary className="user-avatar" aria-label="User menu">
                P
              </summary>
              <div className="profile-dropdown">
                <strong>Fixture user</strong>
                <Link to="/profile">Profile</Link>
              </div>
            </details>
          </div>
        </header>
      ) : (
        <header className="topbar">
          <ApplicationBar />
          <div className="topbar-right">
            {admin && <RemovableMenu />}
            <ActivityMenus />
            <details className="profile-menu">
              <summary className="user-avatar" aria-label="User menu">
                P
              </summary>
              <div className="profile-dropdown">
                <strong>Fixture user</strong>
                <Link to="/profile">Profile</Link>
              </div>
            </details>
          </div>
        </header>
      )}
      <main id="main-content" tabIndex={-1} className="workspace">
        <button type="button" data-testid="outside-toolbar">
          Outside toolbar
        </button>
        <Outlet />
      </main>
      {phone && (
        <div className="phone-dock">
          <OngoingTasks row />
          <nav className="topbar phone-taskbar" aria-label="Sections">
            <ApplicationBar phone />
            <ActivityMenus only="jobs" />
          </nav>
        </div>
      )}
    </>
  )
}

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Destination /> },
      { path: '/:section', element: <Destination /> },
      { path: '/:section/:subsection', element: <Destination /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
)
