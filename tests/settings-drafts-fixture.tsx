import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router-dom'
import { ExternalSettings } from '../src/app/external-connections'
import { HostnameSettings } from '../src/app/hostname-settings'
import { NotificationPreferences, NotificationSettings } from '../src/app/notification-settings'
import { SystemUpdates } from '../src/app/system-updates'
import { WebSettings } from '../src/app/web-settings'
import { DirtyFormsProvider } from '../src/shared/interaction'
import { initializeLanguage } from '../src/i18n'
import '../src/style.css'
import '../src/design-system.css'
import '../src/home/components.css'

declare global {
  interface Window {
    settingsDraftFixture: {
      refresh: (keys: string[][]) => Promise<void>
      navigate: (path: string) => Promise<void>
    }
  }
}

const params = new URLSearchParams(location.search)
await initializeLanguage(params.get('lang') ?? 'en')
document.documentElement.dataset.theme = params.get('theme') ?? 'light'
document.documentElement.dataset.surface = params.get('surface') ?? 'solid'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

function FixtureLayout() {
  window.settingsDraftFixture = {
    refresh: async (keys) => {
      await Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: key })))
    },
    navigate: async (path) => router.navigate(path),
  }
  return (
    <DirtyFormsProvider>
      <nav className="actions" aria-label="Settings draft test pages">
        <Link className="button" to="/system/hostname">
          Hostname
        </Link>
        <Link className="button" to="/system/web">
          Web
        </Link>
        <Link className="button" to="/settings/notifications">
          Notifications
        </Link>
        <Link className="button" to="/profile/notifications">
          Preferences
        </Link>
        <Link className="button" to="/settings/connections/google">
          Google provider
        </Link>
        <Link className="button" to="/system/updates">
          System updates
        </Link>
      </nav>
      <main className="settings-content">
        <Outlet />
      </main>
    </DirtyFormsProvider>
  )
}

const router = createMemoryRouter(
  [
    {
      path: '/',
      element: <FixtureLayout />,
      children: [
        { path: 'system/hostname', element: <HostnameSettings /> },
        { path: 'system/web', element: <WebSettings /> },
        { path: 'settings/notifications', element: <NotificationSettings /> },
        { path: 'profile/notifications', element: <NotificationPreferences /> },
        { path: 'settings/connections/:provider', element: <ExternalSettings /> },
        { path: 'system/updates', element: <SystemUpdates /> },
        { path: 'settings/general', element: <p>Mocked panel redirected at the selected port.</p> },
      ],
    },
  ],
  { initialEntries: [params.get('path') ?? '/system/hostname'] },
)

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
)
