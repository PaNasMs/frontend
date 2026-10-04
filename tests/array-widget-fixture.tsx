import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ArrayWidget } from '../src/app/storage-widgets'
import type { CoolingState } from '../src/app/cooling'
import type { Storage } from '../src/api/client'
import { initializeLanguage } from '../src/i18n'
import '../src/style.css'
import '../src/home/components.css'
const query = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
const disk = (kname: string) => ({ name: kname, kname, path: '/dev/' + kname, type: 'disk', size: 1e12 })
query.setQueryData<Storage>(['storage'], {
  devices: ['sda', 'sdb', 'sdc', 'sdd'].map(disk),
  mounts: [],
  arrays: [
    {
      name: 'disk',
      level: 'raid5',
      state: 'clean',
      degraded: '0',
      members: ['sda', 'sdb', 'sdc', 'sdd'],
      sync: 'idle',
      progress: '',
      device: '/dev/md127',
      uuid: 'test',
      size: 3e12,
    },
  ],
  observedAt: '',
} as Storage)
function telemetry(available: boolean) {
  query.setQueryData<CoolingState>(['cooling'], {
    capabilities: { cpu: true, disk: true },
    available,
    config: {
      cpuProfile: 'balanced',
      profile: 'balanced',
      sampleSeconds: 60,
      hardwareMode: 'none',
      controlGPIO: 27,
      tachGPIO: null,
    },
    status: {
      dutyPercent: 0,
      reason: '',
      observedAt: 0,
      profile: 'balanced',
      disks: [
        { device: '/dev/sda', temperature: 35, stale: false, state: 'active' },
        { device: '/dev/sdb', temperature: 52, stale: true, state: 'active' },
        { device: '/dev/sdc', temperature: 38, stale: false, state: 'sleeping' },
        { device: '/dev/sdd', temperature: null, stale: false, state: 'active' },
      ],
    },
  } as CoolingState)
}
telemetry(true)
await initializeLanguage()
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={query}>
    <button onClick={() => telemetry(false)}>Telemetry unavailable</button>
    <section className="desktop-widget" style={{ width: 340, padding: 18 }}>
      <ArrayWidget />
    </section>
  </QueryClientProvider>,
)
