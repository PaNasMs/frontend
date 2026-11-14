import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { useRef, useState } from 'react'
import { NetworkAccessSettings } from '../src/app/network-access'
import { AccessPointDialog } from '../src/app/network-access-point'
import { WifiControls, type WifiData, type WifiRadio } from '../src/app/wifi'
import { Button } from '../src/shared/ui'
import { initializeLanguage } from '../src/i18n'
import '../src/style.css'
import '../src/design-system.css'
import '../src/home/components.css'

type Fixture = {
  runMode: 'fail' | 'hold' | 'success'
  writes: { action: string; params: Record<string, unknown> }[]
  refresh: () => Promise<void>
  setRunMode: (mode: 'fail' | 'hold' | 'success') => void
  releaseRun: () => void
}
declare global {
  interface Window {
    networkDraftFixture: Fixture
  }
}

const params = new URLSearchParams(location.search)
await initializeLanguage(params.get('lang') ?? 'en')
document.documentElement.dataset.theme = params.get('theme') ?? 'light'
document.documentElement.dataset.surface = params.get('surface') ?? 'solid'

const wifi: WifiData = {
  enabled: true,
  hardwareEnabled: true,
  networks: [
    {
      id: 'fixture-ap-selected-001',
      ssid: 'Synthetic selected network',
      ssidHex: '53796E7468657469632053656C6563746564',
      security: 'wpa2',
      signal: 82,
      frequency: 2412,
    },
  ],
  saved: [],
  activeAP: '',
}
const radio: WifiRadio = { present: true, enabled: true, hardwareEnabled: true }
const group = {
  id: 'synthetic-sharing-group-001',
  name: 'Synthetic access point',
  source: 'eth-fixture0',
  outputs: ['wlan-fixture0'],
  mode: 'nat',
  wifi: { 'wlan-fixture0': { ssid: 'Synthetic access point name', band: 'bg', channel: 1 } },
  enabled: true,
} as never
const iface = {
  name: 'eth-fixture0',
  kind: 'ethernet',
  profile: '',
  nmState: 100,
  sharing: { available: true, ap: true, bands: ['bg', 'a'], channels: { bg: [1, 6, 11], a: [36, 40] } },
  wifi,
} as never
const router = createMemoryRouter(
  [{ path: '/settings/network/fallback', element: <NetworkAccessSettings /> }],
  { initialEntries: ['/settings/network/fallback'] },
)

function FixtureApp() {
  const queryClient = useQueryClient()
  const [runMode, setRunMode] = useState<'fail' | 'hold' | 'success'>('success')
  const releaseRef = useRef<(() => void) | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [accessPointOpen, setAccessPointOpen] = useState(false)
  const fixture: Fixture = window.networkDraftFixture ?? {
    runMode,
    writes: [],
    refresh: async () => undefined,
    setRunMode,
    releaseRun: () => undefined,
  }
  fixture.runMode = runMode
  fixture.setRunMode = setRunMode
  fixture.refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['network-access'] })
  }
  fixture.releaseRun = () => releaseRef.current?.()
  window.networkDraftFixture = fixture

  async function run(action: string, actionParams: Record<string, unknown>) {
    fixture.writes.push({ action, params: actionParams })
    setBusy(true)
    setError('')
    if (fixture.runMode === 'hold')
      await new Promise<void>((resolve) => {
        releaseRef.current = resolve
      })
    releaseRef.current = null
    const success = fixture.runMode !== 'fail'
    setBusy(false)
    if (!success) setError('Synthetic operation rejected; no network change was made.')
    else setError('')
    return success
  }

  return (
    <div className="settings-stack">
      <div className="actions">
        <Button type="button" onClick={() => void fixture.refresh()}>
          Refresh managed access
        </Button>
        <Button type="button" onClick={() => setAccessPointOpen(true)}>
          Open synthetic access point
        </Button>
        <Button type="button" onClick={() => setError('')}>
          Clear operation error
        </Button>
      </div>
      <RouterProvider router={router} />
      <section className="disk-settings-section">
        <h2>Mock Wi-Fi controls</h2>
        <WifiControls
          name="wlan-fixture0"
          wifi={wifi}
          radio={radio}
          connected={false}
          disabled={busy}
          busy={busy}
          run={run}
          error={error}
        />
      </section>
      {accessPointOpen && (
        <AccessPointDialog
          name="wlan-fixture0"
          group={group}
          iface={iface}
          radio={radio}
          busy={busy}
          disabled={busy}
          error={error}
          run={run}
          close={() => setAccessPointOpen(false)}
        />
      )}
      {error && <p role="status">{error}</p>}
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <FixtureApp />
  </QueryClientProvider>,
)
