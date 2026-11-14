import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { initializeLanguage } from '../src/i18n'
import '../src/style.css'
import '../src/design-system.css'
import '../src/home/components.css'

type View = 'storage' | 'cooling' | 'metrics' | 'storage-options' | 'preferences' | 'smart'
type FixtureState = {
  failures: Partial<Record<View, boolean>>
  reads: Record<string, number>
  writes: unknown[]
}
declare global {
  interface Window {
    storageFreshnessFixture: FixtureState
  }
}

const params = new URLSearchParams(location.search)
const failures: Partial<Record<View, boolean>> = {}
for (const failure of (params.get('fail') ?? '').split(',').filter(Boolean)) failures[failure as View] = true
const state: FixtureState = { failures, reads: {}, writes: [] }
window.storageFreshnessFixture = state
const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })

const disk = {
  name: 'sda',
  kname: 'sda',
  path: '/dev/sda',
  type: 'disk',
  size: 1000000000000,
  model: 'Fixture SATA Disk',
  serial: 'FIXTURE-001',
  tran: 'sata',
  rota: true,
  mountpoints: [null],
  children: [
    {
      name: 'sda1',
      kname: 'sda1',
      path: '/dev/sda1',
      type: 'part',
      size: 900000000000,
      fstype: 'ext4',
      uuid: 'fixture-volume-001',
      label: 'Fixture volume',
      pkname: 'sda',
      start: 1048576,
      mountpoints: ['/mnt/fixture'],
    },
  ],
}

const payloads: Record<View, unknown> = {
  storage: {
    devices: [disk],
    mounts: [
      {
        source: '/dev/sda1',
        target: '/mnt/fixture',
        fstype: 'ext4',
        options: 'rw,relatime',
        size: 900000000000,
        used: 250000000000,
        avail: 650000000000,
      },
    ],
    arrays: [],
    observedAt: '2026-11-14T10:00:00Z',
  },
  cooling: {
    configured: true,
    available: true,
    config: { cpuProfile: 'balanced', profile: 'balanced', sampleSeconds: 60, hardwareMode: 'external-pwm' },
    status: {
      dutyPercent: 35,
      reason: 'fixture',
      observedAt: 1794650400,
      profile: 'balanced',
      disks: [
        {
          path: '/dev/sda',
          device: '/dev/sda',
          state: 'active',
          temperature: 34,
          observedAt: 1794650400,
          health: 'warning',
          stale: false,
          smartObservedAt: 1794650400,
          smartStale: false,
          warnings: ['UDMA_CRC_Error_Count'],
          attributes: [
            {
              id: 199,
              name: 'UDMA_CRC_Error_Count',
              raw: { value: 5, string: '5' },
            },
          ],
        },
      ],
    },
  },
  metrics: {
    systemTotal: 8000000000,
    systemAvailable: 4000000000,
    disks: { sda: { read: 0, write: 0 } },
    network: {},
    hostname: 'fixture-nas',
    cpu: 2,
    memoryTotal: 8000000000,
    memoryUsed: 4000000000,
    uptime: 3600,
    cpuTemperature: null,
    cpuFanRpm: null,
    observedAt: '2026-11-14T10:00:00Z',
  },
  'storage-options': {
    sleepSettings: null,
    devices: [
      {
        path: '/dev/sda',
        kname: 'sda',
        type: 'disk',
        size: 1000000000000,
        protectedReason: '',
        layoutReason: '',
        busyReason: '',
        raidReason: 'Fixture partitioned drive',
        raidEligible: false,
        ejectable: false,
      },
      {
        path: '/dev/sda1',
        kname: 'sda1',
        type: 'part',
        fstype: 'ext4',
        uuid: 'fixture-volume-001',
        mountpoints: ['/mnt/fixture'],
        mountSettings: { point: '/mnt/fixture', automount: true, readOnly: false, mountPolicy: 'boot' },
        protectedReason: '',
        layoutReason: '',
        busyReason: '',
        raidReason: 'Fixture partitioned drive',
        raidEligible: false,
        ejectable: false,
      },
    ],
    formats: ['ext4'],
  },
  preferences: {
    language: (params.get('lang') ?? 'en') as 'en' | 'ru' | 'uk',
    theme: 'light',
    layouts: {},
    smartCrcBaselines: { 'Fixture SATA Disk:FIXTURE-001': 2 },
  },
  smart: {},
}

window.fetch = async (input, init) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    location.href,
  )
  if (!url.pathname.startsWith('/api/v1/')) return new Response('', { status: 404 })
  const key = url.pathname.slice('/api/v1/'.length)
  const view = key === 'manage' ? (url.searchParams.get('view') as View) : (key as View)
  if (init?.method && init.method !== 'GET') {
    state.writes.push({ path: url.pathname, view, method: init.method, body: init.body })
    return Response.json({ id: 'fixture-job' }, { status: 405 })
  }
  state.reads[view] = (state.reads[view] ?? 0) + 1
  if (state.failures[view]) return Response.json({ error: `Fixture ${view} read failed` }, { status: 503 })
  return Response.json(payloads[view] ?? {})
}

await initializeLanguage(params.get('lang') ?? 'en')
document.documentElement.dataset.theme = params.get('theme') ?? 'light'
document.documentElement.dataset.surface = params.get('material') ?? 'solid'
const { StoragePage } = await import('../src/app/storage')

function FixtureControls() {
  const [, setRevision] = useState(0)
  const toggle = (view: View) => {
    state.failures[view] = !state.failures[view]
    setRevision((current) => current + 1)
    void query.invalidateQueries({ queryKey: view === 'storage-options' ? ['management-storage'] : [view] })
  }
  const recover = () => {
    state.failures = {}
    setRevision((current) => current + 1)
    for (const key of ['storage', 'cooling', 'metrics', 'management-storage', 'preferences'])
      void query.invalidateQueries({ queryKey: [key] })
  }
  return (
    <nav aria-label="Fixture controls">
      <button onClick={() => toggle('cooling')}>Toggle cooling read failure</button>
      <button onClick={() => toggle('storage-options')}>Toggle storage options failure</button>
      <button onClick={() => toggle('storage')}>Toggle storage read failure</button>
      <button
        onClick={() => {
          state.failures = {}
          setRevision((current) => current + 1)
        }}
      >
        Allow retry without refreshing
      </button>
      <button onClick={recover}>Recover all reads</button>
      <output hidden data-testid="storage-fixture-state">
        {JSON.stringify({ failures: state.failures, reads: state.reads, writes: state.writes })}
      </output>
    </nav>
  )
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={query}>
    <RouterProvider
      router={createMemoryRouter([
        {
          path: '*',
          element: (
            <>
              <FixtureControls />
              <main className="settings-content">
                <StoragePage />
              </main>
            </>
          ),
        },
      ])}
    />
  </QueryClientProvider>,
)
