import { PageError } from './shared/page-error'
import { TooltipLayer } from './shared/tooltip'
import { useExclusivePopover, DirtyFormsProvider } from './shared/interaction'
import packageInfo from '../package.json'
import { tr } from './i18n/index'
import { useWallpaper, wallpaperURL } from './app/wallpaper'
import { PowerMenu } from './app/power-menu'
import { ApplicationBar } from './app/application-bar'
import { registerShortcuts } from './app/desktop-layout'
import { StrictMode, Suspense, lazy, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Outlet, Link, Navigate, useLocation } from 'react-router-dom'
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { mdiLogout, mdiAccountOutline } from '@mdi/js'
import { request, APIError, type Identity, type Preferences } from './api/client'
import { Button, Icon, Notice } from './shared/ui'
import './app/pages'
import { modules, settingsSections, setModuleAccess } from './app/module-registry'
import { Dashboard, HistoryPage } from './app/dashboard'
import './app/storage'
import { ProfilePage } from './app/profile'
import { ActivityMenus } from './app/activity-menus'
import { RemovableMenu } from './app/removable'
import { NotificationToasts } from './app/notifications'
import { ModuleManager } from './app/module-manager'
import { loadInstalledModules, moduleErrors } from './app/module-loader'
import './app/sharing'
import './app/system'
import './app/network'
import { Settings } from './app/settings'
import { useEvents } from './app/events'
import './style.css'
import './design-system.css'
const query = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10000,
      retry: (count, e) => !(e instanceof APIError && e.status === 401) && count < 1,
    },
  },
})
const Login = lazy(() => import('./app/login'))
function Shell() {
  const routeLocation = useLocation()
  const avatar = useQuery({
    queryKey: ['avatar'],
    queryFn: () => request<{ version: string }>('avatar'),
    retry: false,
  })
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => request<Identity>('session'),
    retry: false,
    refetchInterval: 30000,
  })
  const q = useQueryClient()
  const menu = useRef<HTMLDetailsElement>(null)
  useExclusivePopover(menu)
  useEffect(() => {
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [routeLocation.pathname])
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) menu.current.open = false
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menu.current?.open) {
        menu.current.open = false
        menu.current.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  const wallpaper = useWallpaper(!!session.data)
  const status = useEvents(!!session.data)
  const prefs = useQuery({
    queryKey: ['preferences'],
    queryFn: () => request<Preferences>('preferences'),
    enabled: !!session.data,
  })
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.data?.theme ?? 'dark'
  }, [prefs.data])
  const logout = useMutation({
    mutationFn: () => request('logout', 'POST'),
    onSuccess: () => {
      q.clear()
      location.assign('/')
    },
  })
  if (session.isPending)
    return (
      <main className="loading">
        <div className="wordmark">PaNasMs</div>
        <p>{tr('connecting_to_nas_28b61ede')}</p>
      </main>
    )
  if (session.error instanceof APIError && session.error.status === 401) return <Login />
  if (session.error && !session.data)
    return (
      <main className="loading">
        <Notice error>{session.error.message}</Notice>
        <Button onClick={() => void session.refetch()}>{tr('retry_9e506acb')}</Button>
      </main>
    )
  return (
    <>
      <a className="skip-link" href="#main-content">
        {tr('ui.skip')}
      </a>
      <TooltipLayer />
      <header className="topbar">
        <ApplicationBar />
        <div className="topbar-right">
          {session.data?.role === 'admin' && <RemovableMenu />}
          <ActivityMenus />
          <details className="profile-menu" ref={menu}>
            <summary
              className="user-avatar"
              aria-label={tr('user_menu_fe38d8c6')}
              title={session.data?.username}
            >
              {avatar.data?.version ? (
                <img src={`/api/v1/avatar/image?v=${avatar.data.version}`} alt="" />
              ) : (
                session.data?.username.slice(0, 1).toUpperCase()
              )}
            </summary>
            <div className="profile-dropdown">
              <strong>{session.data?.name || session.data?.username}</strong>
              <Link
                to="/profile"
                onClick={() => {
                  if (menu.current) menu.current.open = false
                }}
              >
                <Icon path={mdiAccountOutline} size={18} />
                {tr('my_profile_88060502')}
              </Link>
              <button
                aria-label={tr('sign_out_026abb1e')}
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
              >
                <Icon path={mdiLogout} size={18} />
                {tr('sign_out_026abb1e')}
              </button>
              {session.data?.role === 'admin' && <PowerMenu />}
            </div>
          </details>
        </div>
      </header>
      <NotificationToasts />
      <main
        id="main-content"
        tabIndex={-1}
        className={`workspace ${wallpaper.data?.version ? 'has-wallpaper' : ''}`}
      >
        {wallpaper.data?.version && (
          <div
            className="desktop-wallpaper"
            aria-hidden="true"
            style={{ backgroundImage: `url("${wallpaperURL(wallpaper.data.version)}")` }}
          />
        )}
        {status === 'offline' && (
          <Notice error>{tr('connection_lost_displayed_data_may_be_out_of_date__ad507a22')}</Notice>
        )}
        {logout.error && <Notice error>{logout.error.message}</Notice>}
        {moduleErrors.map((error) => (
          <Notice error key={error}>
            {error}
          </Notice>
        ))}
        {session.data?.role !== 'admin' &&
        !['/', '/profile', '/history'].includes(routeLocation.pathname) &&
        !routeLocation.pathname.startsWith('/files') &&
        !routeLocation.pathname.startsWith('/profile/') ? (
          <Navigate to="/" replace />
        ) : (
          <DirtyFormsProvider>
            <Outlet />
          </DirtyFormsProvider>
        )}
      </main>
      <footer className="app-footer">PaNasMs · {packageInfo.version}</footer>
    </>
  )
}
async function boot() {
  try {
    setModuleAccess((await request<Identity>('session')).role === 'admin')
  } catch {
    setModuleAccess(false)
  }
  await loadInstalledModules()
  registerShortcuts()
  const router = createBrowserRouter([
    {
      element: <Shell />,
      errorElement: <PageError />,
      children: [
        {
          element: <Outlet />,
          errorElement: <PageError />,
          children: [
            ...modules().flatMap((m) =>
              [m.path, ...(m.routes ?? []).map((route) => `${m.path}/${route}`)].map((path) => ({
                path,
                element: <m.component />,
                errorElement: <PageError />,
              })),
            ),
            { path: '/settings/cpu', element: <Navigate to="/settings/general" replace /> },
            { path: '/modules/:moduleId', element: <ModuleManager /> },
            { path: '/', element: <Dashboard /> },
            ...[
              '/settings',
              '/settings/general',
              ...settingsSections().flatMap((s) => [
                `/settings/${s.id}`,
                ...(s.routes ?? []).map((route) => `/settings/${s.id}/${route}`),
              ]),
            ].map((path) => ({ path, element: <Settings /> })),
            ...['/profile', '/profile/:section'].map((path) => ({
              path,
              element: <ProfilePage />,
              errorElement: <PageError />,
            })),
            { path: '/jobs', element: <Navigate to="/?panel=jobs" replace /> },
            { path: '/history', element: <HistoryPage /> },
            { path: '/notifications', element: <Navigate to="/?panel=notifications" replace /> },
            {
              path: '*',
              element: (
                <>
                  <h1>{tr('page_not_found_b8a96047')}</h1>
                  <Link to="/">{tr('go_to_desktop_487f0618')}</Link>
                </>
              ),
            },
          ],
        },
      ],
    },
  ])
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={query}>
        <Suspense fallback={<main className="loading">{tr('loading_interface_f69ec4bd')}</main>}>
          <RouterProvider router={router} />
        </Suspense>
      </QueryClientProvider>
    </StrictMode>,
  )
}
void boot()
