import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { DirtyFormsProvider } from '../src/shared/interaction'
import { initializeLanguage } from '../src/i18n'
import '../src/style.css'
import '../src/design-system.css'
import '../src/home/components.css'

type KeyItem = {
  id: string
  type: string
  fingerprint: string
  comment: string
}
type PanelSession = {
  id: string
  user: string
  address: string
  device: string
  created: number
  expires: number
  current: boolean
  kind: 'panel'
}
type SSHSession = {
  id: string
  user: string
  uid: string
  kind: 'ssh'
  address: string
  leader: string
  state: string
  created: string
}
type Profile = {
  role: 'admin' | 'user'
  username: string
  name: string
  uid: string
  home: string
  groups: string[]
  keys: KeyItem[]
}
type Write = { path: string; method: string; body?: unknown }
type FixtureState = {
  keys: KeyItem[]
  panelSessions: PanelSession[]
  sshSessions: SSHSession[]
  deviceIDs: string[]
  telegram: {
    linked: boolean
    name: string
    enabled: boolean
    pending: { ready: boolean; name: string; expires: number }
  }
  writes: Write[]
  failedResponses: string[]
  keyWriteMode: 'success' | 'hold' | 'fail'
  releaseKeyWrite?: () => void
  deviceWriteMode: 'success' | 'hold' | 'fail'
  releaseDeviceWrite?: () => void
  telegramWriteMode: 'success' | 'hold' | 'fail'
  releaseTelegramWrite?: () => void
  navigate: (path: string) => Promise<void>
  refresh: (views?: string[]) => Promise<void>
}

declare global {
  interface Window {
    accessConfirmationFixture: FixtureState
  }
}

const query = new URLSearchParams(location.search)
const lang = query.get('lang') ?? 'en'
await initializeLanguage(lang)
document.documentElement.dataset.theme = query.get('theme') ?? 'light'
document.documentElement.dataset.surface = query.get('surface') ?? 'solid'

const keys: KeyItem[] = [
  {
    id: 'key-fixture-laptop-001',
    type: 'ssh-ed25519',
    fingerprint: 'SHA256:fixtureFingerprintAlpha1111111111111111111111111111',
    comment: 'Studio laptop',
  },
  {
    id: 'key-fixture-laptop-002',
    type: 'ssh-ed25519',
    fingerprint: 'SHA256:fixtureFingerprintBravo2222222222222222222222222222',
    comment: 'Studio laptop backup for the upstairs home office workstation',
  },
]
const panelSessions: PanelSession[] = [
  {
    id: 'panel-session-fixture-current',
    user: 'fixture',
    address: '192.0.2.41',
    device: 'Studio laptop · Chrome profile in the upstairs home office',
    created: 1794650000,
    expires: 1794736400,
    current: true,
    kind: 'panel',
  },
  {
    id: 'panel-session-fixture-other',
    user: 'fixture',
    address: '192.0.2.42',
    device: 'Studio laptop · Chrome profile in the upstairs home office',
    created: 1794650300,
    expires: 1794736700,
    current: false,
    kind: 'panel',
  },
]
const sshSessions: SSHSession[] = [
  {
    id: 'ssh-session-fixture-one',
    user: 'fixture',
    uid: '1000',
    kind: 'ssh',
    address: '192.0.2.51',
    leader: '1101',
    state: 'active',
    created: '2026-11-14T09:00:00Z',
  },
  {
    id: 'ssh-session-fixture-two',
    user: 'fixture',
    uid: '1000',
    kind: 'ssh',
    address: '192.0.2.52',
    leader: '1102',
    state: 'active',
    created: '2026-11-14T09:02:00Z',
  },
]
const deviceIDs = ['abcd1234' + '1'.repeat(56), 'abcd1234' + '2'.repeat(56)]

const fixture: FixtureState = {
  keys,
  panelSessions,
  sshSessions,
  deviceIDs,
  telegram: {
    linked: true,
    name: 'Studio Telegram account for the upstairs home office',
    enabled: true,
    pending: { ready: false, name: '', expires: 0 },
  },
  writes: [],
  failedResponses: [],
  keyWriteMode: 'success',
  deviceWriteMode: 'success',
  telegramWriteMode: 'success',
  navigate: async () => undefined,
  refresh: async () => undefined,
}
window.accessConfirmationFixture = fixture

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})
fixture.refresh = async (
  views = ['profile', 'account-sessions', 'notification-profile', 'telegram-link'],
) => {
  await Promise.all(views.map((view) => queryClient.invalidateQueries({ queryKey: [view] })))
}

const apiPath = (input: RequestInfo | URL) => {
  const inputURL = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  return new URL(inputURL, location.href)
}
const profile: Profile = {
  role: 'user',
  username: 'fixture',
  name: 'Fixture Person',
  uid: '1000',
  home: '/home/fixture',
  groups: ['users'],
  keys: [],
}

window.fetch = async (input, init) => {
  const url = apiPath(input)
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined

  if (!url.pathname.startsWith('/api/v1/'))
    return Response.json({ error: 'Unexpected fixture request' }, { status: 404 })

  if (url.pathname === '/api/v1/preferences' && method === 'GET')
    return Response.json({ language: lang, theme: 'light' })

  if (url.pathname === '/api/v1/profile') {
    if (method === 'GET') return Response.json({ ...profile, keys: structuredClone(fixture.keys) })
    fixture.writes.push({ path: url.pathname, method, body })
    if (fixture.keyWriteMode === 'hold') {
      await new Promise<void>((resolve) => {
        fixture.releaseKeyWrite = resolve
      })
      fixture.keyWriteMode = 'success'
    } else if (fixture.keyWriteMode === 'fail') {
      fixture.keyWriteMode = 'success'
      fixture.failedResponses.push('/api/v1/profile:503')
      return Response.json({ error: 'Fixture key removal rejected' }, { status: 503 })
    }
    if (body?.action === 'delete')
      fixture.keys.splice(0, fixture.keys.length, ...fixture.keys.filter((key) => key.id !== body.id))
    return new Response(null, { status: 204 })
  }

  if (url.pathname === '/api/v1/security-history' && method === 'GET') return Response.json([])

  if (url.pathname === '/api/v1/sessions') {
    if (method === 'GET') return Response.json(structuredClone(fixture.panelSessions))
    fixture.writes.push({ path: url.pathname + url.search, method, body })
    fixture.panelSessions.splice(
      0,
      fixture.panelSessions.length,
      ...fixture.panelSessions.filter((session) => session.id !== body?.id),
    )
    return new Response(null, { status: 204 })
  }

  if (url.pathname === '/api/v1/manage') {
    const view = url.searchParams.get('view')
    if (method === 'GET' && view === 'account-sessions')
      return Response.json(structuredClone(fixture.sshSessions))
    if (method === 'GET' && view === 'jobs') return Response.json([])
    if (view === 'plan') {
      fixture.writes.push({ path: url.pathname + '?view=plan', method, body })
      const action = String(body?.action ?? '')
      const params = (body?.params ?? {}) as Record<string, unknown>
      return Response.json({
        target: params.target ?? 'fixture',
        details: ['Reviewed ' + action + ' for fixture session.'],
        fingerprint: 'fixture-fingerprint:' + action,
        confirmation: 'fixture-confirmation:' + action,
      })
    }
    if (view === 'run') {
      fixture.writes.push({ path: url.pathname + '?view=run', method, body })
      return Response.json({ id: 'fixture-job' })
    }
    return Response.json({})
  }

  if (url.pathname === '/api/v1/notification-profile') {
    if (method === 'GET')
      return Response.json({
        preferences: {
          enabled: true,
          email: '',
          chatId: '',
          routes: { info: [], warning: [], error: ['email'], critical: ['telegram'] },
        },
        publicKey: 'fixture-public-key',
        devices: [...fixture.deviceIDs],
        available: { email: true, telegram: true, push: true },
        history: [],
      })
    fixture.writes.push({ path: url.pathname, method, body })
    return new Response(null, { status: 204 })
  }

  if (url.pathname === '/api/v1/notification-push') {
    fixture.writes.push({ path: url.pathname, method, body })
    if (fixture.deviceWriteMode === 'hold') {
      await new Promise<void>((resolve) => {
        fixture.releaseDeviceWrite = resolve
      })
      fixture.deviceWriteMode = 'success'
    } else if (fixture.deviceWriteMode === 'fail') {
      fixture.deviceWriteMode = 'success'
      fixture.failedResponses.push('/api/v1/notification-push:503')
      return Response.json({ error: 'Fixture device removal rejected' }, { status: 503 })
    }
    if (method === 'DELETE')
      fixture.deviceIDs.splice(
        0,
        fixture.deviceIDs.length,
        ...fixture.deviceIDs.filter((id) => id !== body?.id),
      )
    return new Response(null, { status: 204 })
  }

  if (url.pathname === '/api/v1/notification-telegram-link') {
    if (method === 'GET') return Response.json(structuredClone(fixture.telegram))
    fixture.writes.push({ path: url.pathname, method, body })
    if (method === 'DELETE' && fixture.telegramWriteMode === 'hold') {
      await new Promise<void>((resolve) => {
        fixture.releaseTelegramWrite = resolve
      })
      fixture.telegramWriteMode = 'success'
    } else if (method === 'DELETE' && fixture.telegramWriteMode === 'fail') {
      fixture.telegramWriteMode = 'success'
      fixture.failedResponses.push('/api/v1/notification-telegram-link:503')
      return Response.json({ error: 'Fixture Telegram unlink rejected' }, { status: 503 })
    }
    if (method === 'DELETE') {
      fixture.telegram.linked = false
      fixture.telegram.name = ''
      fixture.telegram.pending = { ready: false, name: '', expires: 0 }
      return new Response(null, { status: 204 })
    }
    return Response.json({})
  }

  return Response.json({ error: 'Unexpected fixture view' }, { status: 404 })
}

const { ProfilePage } = await import('../src/app/profile')
const initialPath = query.get('path') ?? '/profile/security'
const router = createMemoryRouter(
  [
    {
      path: '/profile/*',
      element: (
        <DirtyFormsProvider>
          <ProfilePage />
        </DirtyFormsProvider>
      ),
    },
  ],
  { initialEntries: [initialPath] },
)
fixture.navigate = async (path) => {
  await router.navigate(path)
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
)
