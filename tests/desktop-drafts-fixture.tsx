import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Link, Outlet, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Dashboard } from '../src/app/dashboard'
import { registerModule, type WidgetDefinition } from '../src/app/module-registry'
import { DirtyFormsProvider } from '../src/shared/interaction'
import { initializeLanguage } from '../src/i18n'
import '../src/style.css'
import '../src/design-system.css'
import '../src/home/components.css'

function TestWidget({ kind }: { kind: string }) {
  return <span>{kind}</span>
}

function TestConfiguration({
  value,
  onChange,
}: {
  value: Record<string, string>
  onChange: (value: Record<string, string>) => void
}) {
  return (
    <label>
      Widget label
      <input
        value={value.label ?? ''}
        onChange={(event) => onChange({ ...value, label: event.target.value })}
      />
    </label>
  )
}

const definitions: Record<string, WidgetDefinition> = {
  'test-alpha': {
    title: 'Alpha widget',
    width: 1,
    height: 1,
    module: 'Desktop test',
    component: TestWidget,
  },
  'test-beta': {
    title: 'Beta widget',
    width: 1,
    height: 1,
    module: 'Desktop test',
    component: TestWidget,
    configure: TestConfiguration,
  },
  'test-gamma': {
    title: 'Gamma widget',
    width: 1,
    height: 1,
    module: 'Desktop test',
    component: TestWidget,
  },
}
registerModule({ id: 'desktop-drafts-fixture', title: 'Desktop test', icon: '', widgets: definitions })

const params = new URLSearchParams(location.search)
await initializeLanguage(params.get('lang') ?? 'en')
document.documentElement.dataset.theme = params.get('theme') ?? 'dark'
document.documentElement.dataset.surface = params.get('surface') ?? 'solid'
history.replaceState({}, '', `/other${location.search}`)

function OtherPage() {
  return <Link to="/">Open dashboard</Link>
}

function Layout() {
  return (
    <DirtyFormsProvider>
      <nav aria-label="Fixture navigation">
        <Link to="/other">Leave dashboard</Link>
      </nav>
      <main id="main-content" tabIndex={-1} className="workspace">
        <Outlet />
      </main>
    </DirtyFormsProvider>
  )
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/other', element: <OtherPage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <RouterProvider router={router} fallbackElement={<p>Loading</p>} />
  </QueryClientProvider>,
)
