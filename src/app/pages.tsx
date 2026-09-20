import { useRouteTab, useQueryValue } from './navigation'
import { tr, locale } from '../i18n/index'
import { registerModule } from './module-registry'
import { HomeSettings } from './home-settings'
import { OperationButton } from './operations'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as Tabs from '@radix-ui/react-tabs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  mdiChip,
  mdiMemory,
  mdiThermometer,
  mdiClockOutline,
  mdiAccountGroupOutline,
  mdiHarddisk,
  mdiRefresh,
  mdiDrag,
  mdiArrowRight,
} from '@mdi/js'
import { request, type Accounts, type Metrics, type Preferences } from '../api/client'
import { Button, Icon, Notice, bytes } from '../shared/ui'
const defaults = ['cpu', 'memory', 'cooling', 'system', 'users', 'storage']
const names: Record<string, string> = {
  cpu: tr('processor_ef345abf'),
  memory: tr('memory_f63c10e0'),
  cooling: tr('cpu_cooling_da67e28f'),
  system: tr('system_3ac98f27'),
  users: tr('users_0f0b8f55'),
  storage: tr('storage_5347bdf6'),
}
const icons: Record<string, string> = {
  cpu: mdiChip,
  memory: mdiMemory,
  cooling: mdiThermometer,
  system: mdiClockOutline,
  users: mdiAccountGroupOutline,
  storage: mdiHarddisk,
}
function mode() {
  return innerWidth < 640 ? 'mobile' : innerWidth < 1100 ? 'medium' : 'wide'
}
export function Dashboard() {
  const query = useQueryClient()
  const metrics = useQuery({ queryKey: ['metrics'], queryFn: () => request<Metrics>('metrics') })
  const prefs = useQuery({ queryKey: ['preferences'], queryFn: () => request<Preferences>('preferences') })
  const [layoutMode, setMode] = useState(mode)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(defaults)
  const [drag, setDrag] = useState<string>()
  useEffect(() => {
    const resize = () => {
      setMode(mode())
      setEditing(false)
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  const saved = prefs.data?.layouts[layoutMode] ?? defaults
  const tiles = editing ? draft : saved
  const save = useMutation({
    mutationFn: () =>
      request<Preferences>('preferences', 'PUT', {
        ...prefs.data,
        layouts: { ...prefs.data?.layouts, [layoutMode]: draft },
      }),
    onSuccess: (p) => {
      query.setQueryData(['preferences'], p)
      setEditing(false)
    },
  })
  const m = metrics.data
  const values: Record<string, string> = {
    cpu: m?.cpu == null ? '—' : `${m.cpu.toFixed(1)} %`,
    memory: m ? bytes(m.memoryUsed) : '—',
    cooling: m?.cpuTemperature == null ? '—' : `${m.cpuTemperature.toFixed(1)} °C`,
    system: m
      ? tr('h_min_83738759', { v0: Math.floor(m.uptime / 3600), v1: Math.floor((m.uptime % 3600) / 60) })
      : '—',
  }
  function move(from: string, to: string) {
    const d = [...draft]
    const i = d.indexOf(from),
      j = d.indexOf(to)
    if (i < 0 || j < 0) return
    d.splice(i, 1)
    d.splice(j, 0, from)
    setDraft(d)
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{tr('your_personal_nas_01da18fc')}</span>
          <h1>{tr('desktop_651d54bb')}</h1>
          <p className="muted">{tr('everything_important_in_its_place_2b105f14')}</p>
        </div>
        <div className="actions">
          {editing ? (
            <>
              <Button onClick={() => setEditing(false)}>{tr('cancel_0ec753be')}</Button>
              <Button className="primary" disabled={save.isPending} onClick={() => save.mutate()}>
                {tr('save_4864057d')}
              </Button>
            </>
          ) : (
            <Button
              disabled={!prefs.data}
              onClick={() => {
                setDraft(saved)
                setEditing(true)
              }}
            >
              <Icon path={mdiDrag} />
              {tr('configure_8960ddc3')}
            </Button>
          )}
        </div>
      </div>
      {editing && <Notice>{tr('drag_a_tile_or_use_the_arrows_the_layout_is_saved__383083ca')}</Notice>}
      {save.error && <Notice error>{save.error.message}</Notice>}
      {metrics.error && <Notice error>{metrics.error.message}</Notice>}
      <div className="desktop-grid">
        {tiles.map((id, index) => (
          <article
            key={id}
            className={`tile ${id === 'users' || id === 'storage' ? 'shortcut' : 'metric'} ${editing ? 'editing' : ''}`}
            draggable={editing}
            onDragStart={() => setDrag(id)}
            onDragOver={(e) => editing && e.preventDefault()}
            onDrop={() => {
              if (drag) move(drag, id)
              setDrag(undefined)
            }}
          >
            {editing && (
              <div className="tile-controls">
                <button
                  aria-label={tr('move_left_26b3a213', { v0: names[id] })}
                  disabled={index === 0}
                  onClick={() => move(id, tiles[index - 1])}
                >
                  ←
                </button>
                <button
                  aria-label={tr('move_right_7b39de41', { v0: names[id] })}
                  disabled={index === tiles.length - 1}
                  onClick={() => move(id, tiles[index + 1])}
                >
                  →
                </button>
              </div>
            )}
            {id === 'users' || id === 'storage' ? (
              <Link to={`/${id}`} onClick={(e) => editing && e.preventDefault()} className="shortcut-link">
                <div className={`icon-box ${id}`}>
                  <Icon path={icons[id]} size={34} />
                </div>
                <span>{names[id]}</span>
              </Link>
            ) : (
              <>
                <div className="tile-title">
                  <Icon path={icons[id]} />
                  <span>{names[id]}</span>
                </div>
                <div className="metric-value">{values[id]}</div>
                <div className="muted small">
                  {id === 'memory' && m
                    ? tr('of_9e4a72ce', { v0: bytes(m.memoryTotal) })
                    : id === 'cooling'
                      ? m?.cpuFanRpm == null
                        ? tr('temperature_fan_speed_unavailable_ea6355c1')
                        : tr('cpu_fan_rpm_7a9960c7', { v0: m.cpuFanRpm })
                      : id === 'system'
                        ? tr('since_startup_b957e3dc')
                        : tr('current_usage_40e0a9cf')}
                </div>
                {id === 'cpu' && m?.cpu != null && (
                  <progress max={100} value={m.cpu} aria-label={tr('cpu_usage_15e14e4f')} />
                )}
                {id === 'memory' && m && (
                  <progress
                    max={m.memoryTotal}
                    value={m.memoryUsed}
                    aria-label={tr('memory_usage_acc37dbb')}
                  />
                )}
              </>
            )}
          </article>
        ))}
      </div>
      <div className="desktop-footer">
        {m
          ? tr('measured_a1a8fafb', { v0: new Date(m.observedAt).toLocaleTimeString(locale()) })
          : tr('waiting_for_system_data_dcc39d01')}
        <Link to="/storage">
          {tr('open_storage_abae2f84') + ' '}
          <Icon path={mdiArrowRight} size={17} />
        </Link>
      </div>
    </>
  )
}
export function Users() {
  const data = useQuery({ queryKey: ['users'], queryFn: () => request<Accounts>('users') })
  const [tab, setTab] = useRouteTab('/users', ['accounts', 'groups'], 'accounts')
  const [serviceFilter, setServiceFilter] = useQueryValue('service', '0', ['0', '1'])
  const services = serviceFilter === '1'
  const setServices = (value: boolean) => setServiceFilter(value ? '1' : '0')
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{tr('access_management_859ab59b')}</span>
          <h1>{tr('users_and_groups_37ba925b')}</h1>
          <p className="muted">{tr('linux_system_accounts_95294f0c')}</p>
        </div>
        <div className="actions">
          <OperationButton
            label={tr('users_and_groups_37ba925b')}
            actions={['user.create', 'group.create', 'group.edit', 'group.delete']}
          />
          <Button onClick={() => void data.refetch()} disabled={data.isFetching}>
            <Icon path={mdiRefresh} />
            {tr('refresh_c2f668e5')}
          </Button>
        </div>
      </div>
      <Tabs.Root activationMode="manual" value={tab} onValueChange={setTab}>
        <Tabs.List className="tabs" aria-label={tr('users_and_groups_37ba925b')}>
          <Tabs.Trigger value="accounts">{tr('users_0f0b8f55')}</Tabs.Trigger>
          <Tabs.Trigger value="groups">{tr('groups_1cb3d2d6')}</Tabs.Trigger>
        </Tabs.List>
        {data.error && <Notice error>{data.error.message}</Notice>}
        {data.isPending && <Notice>{tr('reading_linux_users_b3897663')}</Notice>}
        <Tabs.Content value="accounts">
          <label className="check">
            <input type="checkbox" checked={services} onChange={(e) => setServices(e.target.checked)} />
            {tr('show_service_accounts_738af3e6')}
          </label>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tr('user_51aff185')}</th>
                  <th>{tr('category_19c85838')}</th>
                  <th>UID / GID</th>
                  <th>{tr('home_folder_f76b7ba1')}</th>
                  <th>{tr('groups_1cb3d2d6')}</th>
                  <th>{tr('actions_9978ac34')}</th>
                </tr>
              </thead>
              <tbody>
                {data.data?.users
                  .filter((u) => services || u.category !== 'service')
                  .map((u) => (
                    <tr key={u.uid + u.username}>
                      <td>
                        <strong>{u.username}</strong>
                        <div className="muted small">{u.name}</div>
                      </td>
                      <td>
                        <span className={`badge ${u.category === 'admin' ? 'accent' : ''}`}>
                          {
                            (
                              {
                                admin: tr('administrator_36d00fd7'),
                                user: tr('user_51aff185'),
                                service: tr('service_account_13f16b3d'),
                              } as Record<string, string>
                            )[u.category]
                          }
                        </span>
                      </td>
                      <td>
                        {u.uid} / {u.gid}
                      </td>
                      <td className="mono">{u.home}</td>
                      <td>{u.groups.join(', ')}</td>
                      <td>
                        {u.category !== 'service' && (
                          <OperationButton
                            actions={['user.edit', 'user.password', 'user.home', 'user.delete']}
                            initial={{ target: u.username, name: u.name, groups: u.groups, home: u.home }}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Tabs.Content>
        <Tabs.Content value="groups">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tr('group_ae8ad7b5')}</th>
                  <th>GID</th>
                  <th>{tr('members_including_primary_group_membership_547c8435')}</th>
                </tr>
              </thead>
              <tbody>
                {data.data?.groups.map((g) => (
                  <tr key={g.gid + g.name}>
                    <td>{g.name}</td>
                    <td>{g.gid}</td>
                    <td>{g.members.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </>
  )
}
registerModule({
  id: 'users',
  title: tr('users_0f0b8f55'),
  path: '/users',
  routes: ['accounts', 'groups'],
  icon: mdiAccountGroupOutline,
  component: Users,
  settings: [
    { id: 'users', title: tr('users_0f0b8f55'), icon: mdiAccountGroupOutline, component: HomeSettings },
  ],
  widgets: {
    users: { title: tr('users_0f0b8f55'), width: 1, height: 1, module: tr('users_0f0b8f55'), href: '/users' },
  },
})
