import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { SystemUpdates } from '../src/app/system-updates'
import { DirtyFormsProvider } from '../src/shared/interaction'
import { initializeLanguage } from '../src/i18n'
import '../src/style.css'
import '../src/design-system.css'
import '../src/home/components.css'
const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const params = new URLSearchParams(location.search)
await initializeLanguage(params.get('lang') ?? 'en')
document.documentElement.dataset.theme = params.get('theme') ?? 'light'
document.documentElement.dataset.surface = params.get('material') ?? 'solid'
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={query}>
    <RouterProvider
      router={createMemoryRouter([
        {
          path: '/',
          element: (
            <DirtyFormsProvider>
              <main className="settings-content">
                <button onClick={() => void query.invalidateQueries({ queryKey: ['system-updates'] })}>
                  Refresh test data
                </button>
                <SystemUpdates />
              </main>
            </DirtyFormsProvider>
          ),
        },
      ])}
    />
  </QueryClientProvider>,
)
