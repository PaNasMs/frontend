import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ExternalSettings, LinkedAccounts, ProviderConnect } from '../src/app/external-connections'
import { initializeLanguage } from '../src/i18n'
import '../src/style.css'
import '../src/design-system.css'
await initializeLanguage(new URLSearchParams(location.search).get('language') ?? 'en')
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>
      <main className="settings-content" style={{ padding: 24 }}>
        <ExternalSettings />
        <LinkedAccounts />
        <div data-testid="login">
          <ProviderConnect providerId="google" />
          <ProviderConnect providerId="github" />
          <ProviderConnect providerId="dropbox" />
        </div>
      </main>
    </MemoryRouter>
  </QueryClientProvider>,
)
