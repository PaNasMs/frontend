import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Link, Outlet, RouterProvider, useLocation, useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Dashboard } from '../src/app/dashboard'
import { WifiControls, type WifiData, type WifiRadio } from '../src/app/wifi'
import { registerModule } from '../src/app/module-registry'
import { Button, DialogContent } from '../src/shared/ui'
import { DirtyFormsProvider } from '../src/shared/interaction'
import { initializeLanguage } from '../src/i18n'
import '../src/style.css'
import '../src/design-system.css'
import '../src/home/components.css'

declare global {
  interface Window {
    dirtyDialogsFixture: {
      back: () => Promise<void>
      navigate: (path: string) => Promise<void>
      writes: { action: string; params?: unknown }[]
      releasePending: () => void
    }
  }
}

const query = new URLSearchParams(location.search)
await initializeLanguage(query.get('lang') ?? 'en')
document.documentElement.dataset.theme = query.get('theme') ?? 'light'
document.documentElement.dataset.surface = query.get('surface') ?? 'solid'
const writes: { action: string; params?: unknown }[] = []
let pendingRelease: (() => void) | null = null
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

const widgetKey = 'synthetic-config-widget'
function SyntheticWidget() {
  return <p>Mock widget content</p>
}
function SyntheticConfigure({
  value,
  onChange,
}: {
  value: Record<string, string>
  onChange: (value: Record<string, string>) => void
}) {
  const [childOpen, setChildOpen] = useState(false)
  return (
    <>
      <label className="field">
        Mock endpoint
        <input
          value={value.endpoint ?? 'synthetic-baseline-endpoint'}
          onChange={(event) => onChange({ ...value, endpoint: event.target.value })}
        />
      </label>
      <Dialog.Root open={childOpen} onOpenChange={setChildOpen}>
        <Dialog.Trigger asChild>
          <Button type="button">Open child picker</Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent
            intent="inspect"
            dirty={false}
            className="settings-dialog"
            header={
              <>
                <Dialog.Title>Mock child picker</Dialog.Title>
                <Dialog.Description>Choose a synthetic option.</Dialog.Description>
              </>
            }
          >
            <Button type="button" onClick={() => setChildOpen(false)}>
              Choose synthetic option
            </Button>
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
registerModule({
  id: 'dirty-dialogs-fixture',
  title: 'Dialog fixture',
  icon: '',
  widgets: {
    [widgetKey]: {
      title: 'Synthetic configurable widget',
      module: 'Synthetic fixture',
      width: 1,
      height: 1,
      component: SyntheticWidget,
      configure: SyntheticConfigure,
    },
  },
})

function FormDialogPage() {
  const [open, setOpen] = useState(true)
  const [value, setValue] = useState('synthetic baseline value')
  const [busy, setBusy] = useState(false)
  const pendingRef = useRef<(() => void) | null>(null)
  const [childOpen, setChildOpen] = useState(false)
  return (
    <section className="surface">
      <h1>Mock form dialog test</h1>
      {!open && (
        <Button
          onClick={() => {
            setValue('synthetic baseline value')
            setOpen(true)
          }}
        >
          Open dialog
        </Button>
      )}
      <Dialog.Root open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent
            className="settings-dialog"
            busy={busy}
            dirty={value !== 'synthetic baseline value'}
            header={
              <>
                <Dialog.Title>Synthetic settings dialog</Dialog.Title>
                <Dialog.Description>Edits remain local to this fixture.</Dialog.Description>
              </>
            }
            footer={
              <div className="actions">
                <Dialog.Close asChild>
                  <Button type="button" data-dialog-cancel>
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button
                  type="button"
                  className="primary"
                  onClick={() => {
                    writes.push({ action: 'fixture.save', params: { value } })
                    setOpen(false)
                  }}
                >
                  Save
                </Button>
              </div>
            }
          >
            <label className="field">
              Mock value
              <input value={value} onChange={(event) => setValue(event.target.value)} />
            </label>
            <Button type="button" onClick={() => setChildOpen(true)}>
              Open child picker
            </Button>
            <Dialog.Root open={childOpen} onOpenChange={setChildOpen}>
              <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <DialogContent
                  intent="inspect"
                  dirty={false}
                  className="settings-dialog"
                  header={
                    <>
                      <Dialog.Title>Mock child picker</Dialog.Title>
                      <Dialog.Description>Select a synthetic option.</Dialog.Description>
                    </>
                  }
                  footer={
                    <Button type="button" onClick={() => setChildOpen(false)}>
                      Use synthetic option
                    </Button>
                  }
                >
                  <p>Mock folder picker contents</p>
                </DialogContent>
              </Dialog.Portal>
            </Dialog.Root>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void new Promise<void>((resolve) => {
                  const release = () => {
                    resolve()
                    setBusy(false)
                    pendingRef.current = null
                    pendingRelease = null
                  }
                  pendingRef.current = release
                  pendingRelease = release
                })
              }}
            >
              Start pending operation
            </Button>
            <output data-testid="mock-value">{value}</output>
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
      <Button
        type="button"
        onClick={() => {
          pendingRef.current?.()
          pendingRef.current = null
          setBusy(false)
        }}
      >
        Release pending operation
      </Button>
    </section>
  )
}

const wifi: WifiData = {
  enabled: true,
  hardwareEnabled: true,
  networks: [
    {
      id: 'synthetic-network-1',
      ssid: 'Synthetic secure network',
      ssidHex: '53796E746865746963',
      security: 'wpa2',
      signal: 75,
      frequency: 2412,
    },
  ],
  saved: [],
  activeAP: '',
}
const radio: WifiRadio = { present: true, enabled: true, hardwareEnabled: true }
function WifiPage() {
  const [busy, setBusy] = useState(false)
  const run = async (action: string, params: Record<string, unknown>) => {
    writes.push({ action, params })
    setBusy(false)
    return true
  }
  return (
    <section className="surface">
      <h1>Mock Wi-Fi test</h1>
      <WifiControls
        name="wlan-fixture0"
        wifi={wifi}
        radio={radio}
        connected={false}
        disabled={busy}
        busy={busy}
        run={run}
        error=""
      />
    </section>
  )
}

function FixtureLayout() {
  const location = useLocation()
  window.dirtyDialogsFixture = {
    back: async () => {
      await router.navigate(-1)
    },
    navigate: async (path) => {
      await router.navigate(path)
    },
    writes,
    releasePending: () => pendingRelease?.(),
  }
  return (
    <DirtyFormsProvider>
      <nav className="actions" aria-label="Dialog fixture routes">
        <Link className="button" to="/start">
          Start page
        </Link>
        <Link className="button" to="/dialog">
          Form dialog
        </Link>
        <Link className="button" to="/wifi">
          Wi-Fi dialog
        </Link>
        <Link className="button" to="/desktop">
          Desktop configuration
        </Link>
        <Link className="button" to="/unhosted">
          Unhosted dialog
        </Link>
        <Button type="button" onClick={() => void router.navigate(-1)}>
          Router Back
        </Button>
        <span data-testid="current-route">{location.pathname}</span>
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
        {
          path: 'start',
          element: (
            <section>
              <h1>Fixture start page</h1>
              <Link to="/dialog">Open dialog</Link>
            </section>
          ),
        },
        { path: 'dialog', element: <FormDialogPage /> },
        { path: 'wifi', element: <WifiPage /> },
        { path: 'desktop', element: <Dashboard /> },
        { path: 'settings/general', element: <p>Mock route destination.</p> },
      ],
    },
    { path: '/unhosted', element: <FormDialogPage /> },
  ],
  { initialEntries: ['/start', query.get('path') ?? '/dialog'], initialIndex: 1 },
)

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
)
