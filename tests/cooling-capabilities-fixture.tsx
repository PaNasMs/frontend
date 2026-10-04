import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { CoolingSettings, DiskTelemetrySettings, type CoolingState } from '../src/app/cooling'
import { initializeLanguage } from '../src/i18n'
import '../src/style.css'
import '../src/home/components.css'
const query = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
function select(supported: boolean, available = true) {
  query.setQueryData<CoolingState>(['cooling'], {
    capabilities: { cpu: supported, disk: supported },
    available,
    config: {
      cpuProfile: 'balanced',
      profile: 'balanced',
      sampleSeconds: 60,
      hardwareMode: 'none',
      controlGPIO: 27,
      tachGPIO: null,
    },
    status: { dutyPercent: 0, reason: 'disabled', observedAt: 0, profile: 'balanced', disks: [] },
  })
}
select(false)
function Fixture() {
  return (
    <main className="general-settings">
      <nav>
        <button onClick={() => select(false)}>Virtual machine</button>
        <button onClick={() => select(true)}>Supported hardware</button>
        <button onClick={() => select(true, false)}>Controller unavailable</button>
      </nav>
      <CoolingSettings kind="cpu" className="surface" />
      <CoolingSettings kind="disk" className="disk-settings-section" />
      <CoolingSettings kind="disk" advanced className="disk-settings-section" />
      <DiskTelemetrySettings />
    </main>
  )
}
await initializeLanguage()
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={query}>
    <RouterProvider router={createMemoryRouter([{ path: '*', element: <Fixture /> }])} />
  </QueryClientProvider>,
)
