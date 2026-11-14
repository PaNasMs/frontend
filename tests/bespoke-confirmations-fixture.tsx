import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { initializeLanguage } from '../src/i18n'
import { SharingLayout } from '../src/app/network-sharing'
import { WifiControls } from '../src/app/wifi'
import { SystemUpdates } from '../src/app/system-updates'
import { ModuleManager } from '../src/app/module-manager'
import { modules } from '../src/app/module-registry'
import { DirtyFormsProvider } from '../src/shared/interaction'
import '../src/style.css'
import '../src/design-system.css'
import '../src/home/components.css'

const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const params = new URLSearchParams(location.search)
await initializeLanguage(params.get('lang') ?? 'en')
document.documentElement.dataset.theme = params.get('theme') ?? 'light'
document.documentElement.dataset.surface = params.get('material') ?? 'solid'

declare global {
  interface Window {
    bespokeRuns: { action: string; params: Record<string, unknown> }[]
  }
}
window.bespokeRuns = []
const run = async (action: string, params: Record<string, unknown>) => {
  window.bespokeRuns.push({ action, params })
  return true
}
const wired = {
  name: 'enp2s0',
  kind: 'ethernet',
  profile: '',
  nmState: 100,
  sharing: { available: true, ap: false, bands: [] },
}
const group = {
  id: 'sharing-fixture',
  name: 'Workshop network · North wing · "Guest devices" · Dedicated Wi-Fi access',
  source: wired.name,
  outputs: ['enp3s0'],
  mode: 'nat' as const,
  wifi: {},
  enabled: true,
  autostart: false,
  bridge: 'br-fixture',
  status: 'active' as const,
  addresses: [],
}
const stoppedGroup = {
  ...group,
  id: 'stopped-sharing-fixture',
  name: 'Workshop backup network',
  source: 'enp3s0',
  enabled: false,
  status: 'stopped' as const,
}
const wifi = {
  enabled: true,
  hardwareEnabled: true,
  networks: [],
  saved: [],
  activeAP: '',
}

function Fixture() {
  return (
    <DirtyFormsProvider>
      <main className="settings-content" style={{ padding: 24 }}>
        <h1>Bespoke confirmation fixture</h1>
        <section aria-label="Sharing confirmations">
          <h2>Sharing</h2>
          <SharingLayout
            interfaces={[wired, { ...wired, name: 'enp3s0' }]}
            sharing={{ groups: [group, stoppedGroup], ready: true }}
            renderCard={(item, _group, actions) => (
              <article className="network-card">
                <header>
                  <strong>{item.name}</strong>
                  <span className="network-card-actions">{actions}</span>
                </header>
              </article>
            )}
            busy={false}
            error=""
            run={run}
          />
        </section>
        <section aria-label="Wi-Fi confirmations">
          <h2>Wi-Fi</h2>
          <WifiControls
            name="wlan-fixture"
            wifi={wifi}
            radio={{ present: true, enabled: true, hardwareEnabled: true }}
            connected
            run={run}
            disabled={false}
            busy={false}
            error=""
          />
          <WifiControls
            name="wlan-offline-fixture"
            wifi={{ ...wifi, enabled: false }}
            radio={{ present: true, enabled: false, hardwareEnabled: true }}
            connected={false}
            run={run}
            disabled={false}
            busy={false}
            error=""
          />
        </section>
        <section aria-label="System update confirmations">
          <h2>System updates</h2>
          <SystemUpdates />
        </section>
        <section aria-label="Module confirmations">
          <h2>Module manager</h2>
          <ModuleManager />
        </section>
      </main>
    </DirtyFormsProvider>
  )
}

if (params.get('module') === 'containers') {
  const stylesheet = document.createElement('link')
  stylesheet.rel = 'stylesheet'
  stylesheet.href = '/api/v1/module-assets/containers/index.css'
  document.head.append(stylesheet)
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = '/api/v1/module-assets/containers/index.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Containers fixture bundle failed to load'))
    document.head.append(script)
  })
  const ModuleComponent = modules().find((item) => item.id === 'containers')?.component
  if (!ModuleComponent) throw new Error('Containers fixture module did not register')
  createRoot(document.getElementById('root')!).render(
    <QueryClientProvider client={query}>
      <RouterProvider
        router={createMemoryRouter([{ path: '*', element: <ModuleComponent /> }], {
          initialEntries: ['/containers/containers'],
        })}
      />
    </QueryClientProvider>,
  )
} else {
  createRoot(document.getElementById('root')!).render(
    <QueryClientProvider client={query}>
      <RouterProvider
        router={createMemoryRouter([{ path: '*', element: <Fixture /> }], { initialEntries: ['/modules'] })}
      />
    </QueryClientProvider>,
  )
}
