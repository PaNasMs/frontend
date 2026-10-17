import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router-dom'
import { OLEDSettings } from '../src/app/oled'
import { DirtyFormsProvider } from '../src/shared/interaction'
import { initializeLanguage } from '../src/i18n'
import '../src/style.css'
import '../src/design-system.css'
import '../src/home/components.css'
const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const params = new URLSearchParams(location.search)
await initializeLanguage(params.get('lang') ?? 'en')
document.documentElement.dataset.theme = params.get('theme') ?? 'dark'
function Layout() {
  return (
    <DirtyFormsProvider>
      <main className="section-layout settings-page">
        <div className="settings-content">
          <div role="tabpanel">
            <div className="general-settings">
              <Link to="/other">Leave settings</Link>
              <Outlet />
            </div>
          </div>
        </div>
      </main>
    </DirtyFormsProvider>
  )
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={query}>
    <RouterProvider
      router={createMemoryRouter([
        {
          element: <Layout />,
          children: [
            { path: '/', element: <OLEDSettings /> },
            { path: '/other', element: <p>Other page</p> },
          ],
        },
      ])}
    />
  </QueryClientProvider>,
)
