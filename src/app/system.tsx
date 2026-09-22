import { ExternalSettings } from './external-connections'
import { useRouteTab, useQueryValue } from './navigation'
import { useNavigate, useLocation } from 'react-router-dom'
import { tr, locale } from '../i18n/index'
import { registerModule } from './module-registry'
import {
  mdiServer,
  mdiChip,
  mdiClockOutline,
  mdiMemory,
  mdiFan,
  mdiPower,
  mdiDotsHorizontal,
  mdiTextBoxSearchOutline,
  mdiRefresh,
  mdiDownload,
} from '@mdi/js'
import { SystemUpdates } from './system-updates'
import { WebSettings } from './web-settings'
import { CoolingSettings } from './cooling'
import { ClockWidget, CoolingWidget, CpuWidget, MemoryWidget, UptimeWidget } from './system-widgets'
import * as Tabs from '@radix-ui/react-tabs'
import { useQuery } from '@tanstack/react-query'
import { managed, OperationButton } from './operations'
import { Notice, Icon } from '../shared/ui'
export function SystemPage() {
  const [tab, setTab] = useRouteTab('/system', ['services', 'journal', 'updates'], 'services')
  const [filter, setFilter] = useQueryValue('filter')
  const [state, setState] = useQueryValue('state')
  const stateText = (value: string) => tr('ui.state.' + value, { defaultValue: value })
  const navigate = useNavigate()
  const location = useLocation()
  const [unit, setUnit] = useQueryValue('unit')
  const [since, setSince] = useQueryValue('since', '24h', ['1h', '24h', '7d', 'all'])
  const [priorityValue, setPriorityValue] = useQueryValue('priority', '7', ['7', '4', '3'])
  const priority = Number(priorityValue)
  const setPriority = (value: number) => setPriorityValue(String(value))
  const [boot, setBoot] = useQueryValue('boot', 'all', ['all', 'current', 'previous'])
  const services = useQuery({
    queryKey: ['services'],
    queryFn: () =>
      managed<{
        services: {
          unit: string
          description: string
          active: string
          sub: string
          enabled: string
        }[]
      }>('services'),
    enabled: tab === 'services' || tab === 'journal',
    refetchInterval: 10000,
  })
  const journal = useQuery({
    queryKey: ['journal', unit, since, priority, boot],
    queryFn: () =>
      managed<{
        entries: {
          time: string
          unit: string
          priority: string
          message: unknown
        }[]
      }>('journal', undefined, JSON.stringify({ unit, since, priority, boot })),
    enabled: tab === 'journal',
    refetchInterval: 5000,
  })
  const updates = useQuery({
    queryKey: ['updates'],
    queryFn: () =>
      managed<{
        packages: string[]
        packageDetails?: {
          name: string
          installed: string
          available: string
          source: string
          action: string
        }[]
        rebootRequired: boolean
      }>('updates'),
    enabled: tab === 'updates',
  })
  return (
    <>
      <h1>{tr('system_3ac98f27')}</h1>
      <Tabs.Root className="tabbed-page" activationMode="manual" value={tab} onValueChange={setTab}>
        <Tabs.List className="tabs">
          <Tabs.Trigger value="services">{tr('services_578702de')}</Tabs.Trigger>
          <Tabs.Trigger value="journal">{tr('logs_67ade741')}</Tabs.Trigger>
          <Tabs.Trigger value="updates">{tr('updates_13920906')}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="services">
          <div className="filter-bar">
            <input
              type="search"
              aria-label={tr('ui.searchServices')}
              placeholder={tr('ui.searchServices')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <select
              aria-label={tr('state_81e4bb36')}
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="">{tr('all_fd08da7a')}</option>
              {['active', 'inactive', 'failed'].map((v) => (
                <option key={v} value={v}>
                  {stateText(v)}
                </option>
              ))}
            </select>
          </div>
          {services.isPending && <Notice>{tr('loading_interface_f69ec4bd')}</Notice>}
          {services.error && <Notice error>{services.error.message}</Notice>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tr('service_62ef4613')}</th>
                  <th>{tr('state_81e4bb36')}</th>
                  <th>{tr('startup_fcd8fe4f')}</th>
                  <th>{tr('actions_9978ac34')}</th>
                </tr>
              </thead>
              <tbody>
                {services.data?.services
                  .filter(
                    (s) =>
                      (!state || s.active === state) &&
                      `${s.unit} ${s.description}`.toLowerCase().includes(filter.toLowerCase()),
                  )
                  .map((s) => (
                    <tr key={s.unit}>
                      <td>
                        {s.unit}
                        <div className="small muted">{s.description}</div>
                      </td>
                      <td>
                        <span className={`status-label ${s.active}`}>{stateText(s.active)}</span>
                        <div className="small muted">{stateText(s.sub)}</div>
                      </td>
                      <td>{stateText(s.enabled)}</td>
                      <td>
                        <OperationButton
                          icon={mdiDotsHorizontal}
                          label={tr('actions_9978ac34') + ' · ' + s.unit}
                          actions={[
                            'service.start',
                            'service.stop',
                            'service.restart',
                            'service.enable',
                            'service.disable',
                          ]}
                          initial={{ target: s.unit }}
                        />
                        <button
                          className="button"
                          title={tr('logs_67ade741') + ' · ' + s.unit}
                          aria-label={tr('logs_67ade741') + ' · ' + s.unit}
                          onClick={() => {
                            const params = new URLSearchParams(location.search)
                            params.set('unit', s.unit)
                            void navigate({ pathname: '/system/journal', search: params.toString() })
                          }}
                        >
                          <Icon path={mdiTextBoxSearchOutline} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Tabs.Content>
        <Tabs.Content value="journal">
          <label className="field">
            {tr('service_62ef4613')}
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">{tr('all_services_9ad124ff')}</option>
              {services.data?.services.map((s) => (
                <option key={s.unit}>{s.unit}</option>
              ))}
            </select>
          </label>
          <div className="actions">
            <label className="field">
              {tr('period_b2822e2b')}
              <select value={since} onChange={(e) => setSince(e.target.value)}>
                <option value="1h">{tr('hour_9ce65a67')}</option>
                <option value="24h">{tr('day_c91ce69e')}</option>
                <option value="7d">{tr('week_9207563d')}</option>
                <option value="all">{tr('all_available_e5dd9936')}</option>
              </select>
            </label>
            <label className="field">
              {tr('severity_22a07704')}
              <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                <option value={7}>{tr('all_fd08da7a')}</option>
                <option value={4}>{tr('warnings_and_errors_42b04b26')}</option>
                <option value={3}>{tr('errors_681b5ae3')}</option>
              </select>
            </label>
            <label className="field">
              {tr('os_boot_599a6000')}
              <select value={boot} onChange={(e) => setBoot(e.target.value)}>
                <option value="all">{tr('all_fd08da7a')}</option>
                <option value="current">{tr('current_71e8b656')}</option>
                <option value="previous">{tr('previous_1bc0670e')}</option>
              </select>
            </label>
          </div>
          {journal.error && <Notice error>{journal.error.message}</Notice>}
          <div className="journal">
            {journal.data?.entries.map((e, i) => (
              <div key={e.time + ':' + i}>
                <time>{new Date(Number(e.time) / 1000).toLocaleString(locale())}</time>
                <strong>{e.unit}</strong>
                <pre>{typeof e.message === 'string' ? e.message : JSON.stringify(e.message)}</pre>
              </div>
            ))}
          </div>
        </Tabs.Content>
        <Tabs.Content value="updates">
          <div className="actions">
            <OperationButton
              icon={mdiRefresh}
              label={tr('check_for_updates_fa7bfc55')}
              actions={['updates.refresh']}
            />
            <OperationButton
              icon={mdiDownload}
              label={tr('install_updates_0eda9206')}
              actions={['updates.install']}
            />
          </div>
          {updates.error && <Notice error>{updates.error.message}</Notice>}
          {updates.data?.rebootRequired && (
            <Notice>{tr('the_os_reports_that_a_restart_is_required_7e5c66a2')}</Notice>
          )}
          {updates.isPending && <Notice>{tr('loading_interface_f69ec4bd')}</Notice>}
          {updates.data && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{tr('ui.package')}</th>
                    <th>{tr('ui.installedVersion')}</th>
                    <th>{tr('ui.availableVersion')}</th>
                    <th>{tr('ui.source')}</th>
                  </tr>
                </thead>
                <tbody>
                  {updates.data.packageDetails?.map((p) => (
                    <tr key={p.name}>
                      <td>
                        <strong>{p.name}</strong>
                      </td>
                      <td>{p.installed || '—'}</td>
                      <td>{p.available || '—'}</td>
                      <td>{p.source || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {updates.data.packages.length === 0 && (
                <p className="notice">{tr('no_updates_available_613848c9')}</p>
              )}
              <details className="diagnostic-details">
                <summary>{tr('ui.details')}</summary>
                <pre>{updates.data.packages.join('\n')}</pre>
              </details>
            </div>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </>
  )
}
registerModule({
  id: 'system',
  title: tr('system_3ac98f27'),
  path: '/system',
  routes: ['services', 'journal', 'updates'],
  icon: mdiServer,
  component: SystemPage,
  settings: [
    { id: 'connections', title: tr('external.title'), icon: mdiServer, component: ExternalSettings },
    { id: 'updates', title: tr('up.title'), icon: mdiDownload, component: SystemUpdates },
    {
      id: 'general',
      title: tr('web.general'),
      icon: mdiServer,
      component: () => (
        <div className="general-settings">
          <WebSettings />
          <section className="surface">
            <CoolingSettings kind="cpu" />
          </section>
        </div>
      ),
    },
  ],
  widgets: {
    clock: {
      title: tr('time_and_date_da69af01'),
      width: 2,
      height: 1,
      module: tr('system_3ac98f27'),
      icon: mdiClockOutline,
      component: ClockWidget,
      bare: true,
    },
    cpu: {
      title: tr('processor_ef345abf'),
      width: 2,
      height: 2,
      module: tr('system_3ac98f27'),
      icon: mdiChip,
      component: CpuWidget,
      history: true,
    },
    memory: {
      title: tr('memory_f63c10e0'),
      width: 2,
      height: 2,
      module: tr('system_3ac98f27'),
      icon: mdiMemory,
      component: MemoryWidget,
      history: true,
    },
    cooling: {
      title: tr('cpu_cooling_da67e28f'),
      width: 2,
      height: 2,
      module: tr('system_3ac98f27'),
      icon: mdiFan,
      component: CoolingWidget,
    },
    system: {
      title: tr('uptime_51919283'),
      width: 2,
      height: 2,
      module: tr('system_3ac98f27'),
      icon: mdiPower,
      component: UptimeWidget,
    },
  },
})
