import { DialogContent } from '../shared/ui'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  mdiLan,
  mdiWifiCog,
  mdiPencilOutline,
  mdiRefresh,
  mdiPlus,
  mdiDeleteOutline,
  mdiClose,
  mdiInformationOutline,
} from '@mdi/js'
import { registerModule } from './module-registry'
import { useRouteTab } from './navigation'
import { newID } from './dashboard'
import { managed, type Job } from './operations'
import { waitForJob } from '../shared/job-completion'
import { Button, Icon, Notice } from '../shared/ui'
import { request, type Identity } from '../api/client'
import { tr } from '../i18n'
import { NetworkWidget } from './system-widgets'
import { WifiControls, type WifiData, type WifiRadio } from './wifi'

import { SharingLayout, type Sharing, type ShareGroup, type ShareInterface } from './network-sharing'
import { notify } from './notifications'
import { networkAppearance } from './network-state'
import { AccessPointDialog } from './network-access-point'
import { connectionNetwork } from './network-details'

type Route = { destination: string; gateway: string; metric: number }
type IPConfig = {
  method: string
  addresses: string[]
  gateway: string
  dns: string[]
  ignoreAutoDns: boolean
  neverDefault: boolean
  metric: number
  routes: Route[]
}
type Config = { ipv4: IPConfig; ipv6: IPConfig; mtu: number }
type Interface = ShareInterface & {
  name: string
  kind: string
  mac: string
  mtu: number
  state: string
  adminUp?: boolean
  carrier?: boolean
  managed?: boolean
  nmState?: number
  addresses: string[]
  dns: string[]
  editable: boolean
  profile: string
  config: Config | null
  wifi?: WifiData
}
type Change = {
  id: string
  interface: string
  user: string
  status: string
  deadline: number
  addresses: string[]
}
type Network = {
  sharing: Sharing
  wifi: WifiRadio | null
  backend: string
  interfaces: Interface[]
  routes: {
    family: number
    dst?: string
    gateway?: string
    dev?: string
    metric?: number
    table?: string | number
    protocol?: string
    type?: string
  }[]
  change: Change | null
  serverTime: number
  timeout: number
}

async function operation(action: string, params: Record<string, unknown>) {
  const plan = await managed<{ fingerprint: string; confirmation: string }>('plan', { action, params })
  const result = await managed<{ id: string }>('run', {
    id: newID(),
    action,
    params,
    fingerprint: plan.fingerprint,
    confirmation: plan.confirmation,
  })
  await waitForJob(async () => (await managed<Job[]>('jobs')).find((j) => j.id === result.id), undefined, 240)
}

function IPFields({
  family,
  value,
  onChange,
}: {
  family: number
  value: IPConfig
  onChange: (value: IPConfig) => void
}) {
  const [routeEditor, setRouteEditor] = useState(false)
  const active = ['auto', 'manual'].includes(value.method)
  const set = <K extends keyof IPConfig>(key: K, next: IPConfig[K]) => onChange({ ...value, [key]: next })
  return (
    <fieldset className="network-ip-fields">
      <legend>IPv{family}</legend>
      <label className="field">
        {tr('network.method')}
        <select
          value={value.method}
          onChange={(e) => {
            const method = e.target.value
            onChange(
              ['auto', 'manual'].includes(method)
                ? { ...value, method }
                : { ...value, method, addresses: [], dns: [], routes: [], gateway: '' },
            )
          }}
        >
          {(family === 4
            ? ['auto', 'manual', 'link-local', 'disabled']
            : ['auto', 'manual', 'link-local', 'ignore', 'disabled']
          ).map((method) => (
            <option key={method} value={method}>
              {tr('network.method.' + method)}
            </option>
          ))}
        </select>
      </label>
      {active && (
        <>
          <label className="field">
            {tr('network.addresses')}
            <textarea
              rows={2}
              value={value.addresses.join('\n')}
              placeholder={family === 4 ? '192.168.1.100/24' : '2001:db8::10/64'}
              onChange={(e) => set('addresses', e.target.value.split('\n'))}
            />
          </label>
          <label className="field">
            {tr('network.gateway')}
            <input
              value={value.gateway}
              disabled={value.neverDefault}
              onChange={(e) => set('gateway', e.target.value)}
            />
          </label>
          <label className="field">
            {tr('network.dns')}
            <textarea
              rows={2}
              value={value.dns.join('\n')}
              onChange={(e) => set('dns', e.target.value.split('\n'))}
            />
          </label>
          <label className="network-check">
            <input
              type="checkbox"
              checked={value.ignoreAutoDns}
              onChange={(e) => set('ignoreAutoDns', e.target.checked)}
            />
            {tr('network.manualDns')}
          </label>
          <details open={routeEditor} onToggle={(e) => setRouteEditor(e.currentTarget.open)}>
            <summary>{tr('network.routing')}</summary>
            <label className="network-check">
              <input
                type="checkbox"
                checked={value.neverDefault}
                onChange={(e) =>
                  onChange({
                    ...value,
                    neverDefault: e.target.checked,
                    gateway: e.target.checked ? '' : value.gateway,
                  })
                }
              />
              {tr('network.localOnly')}
            </label>
            <label className="field">
              {tr('network.metric')}
              <input
                type="number"
                min={-1}
                max={4294967295}
                value={value.metric}
                onChange={(e) => set('metric', Number(e.target.value))}
              />
            </label>
            <div className="network-routes-editor">
              {value.routes.map((route, i) => (
                <div className="network-route-editor" key={i}>
                  <label className="field">
                    {tr('network.destination')}
                    <input
                      value={route.destination}
                      placeholder={family === 4 ? '10.0.0.0/24' : '2001:db8:1::/64'}
                      onChange={(e) =>
                        set(
                          'routes',
                          value.routes.map((r, j) => (i === j ? { ...r, destination: e.target.value } : r)),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    {tr('network.gateway')}
                    <input
                      value={route.gateway}
                      onChange={(e) =>
                        set(
                          'routes',
                          value.routes.map((r, j) => (i === j ? { ...r, gateway: e.target.value } : r)),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    {tr('network.metric')}
                    <input
                      type="number"
                      min={-1}
                      max={4294967295}
                      value={route.metric}
                      onChange={(e) =>
                        set(
                          'routes',
                          value.routes.map((r, j) =>
                            i === j ? { ...r, metric: Number(e.target.value) } : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    title={tr('network.removeRoute')}
                    aria-label={tr('network.removeRoute')}
                    onClick={() =>
                      set(
                        'routes',
                        value.routes.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Icon path={mdiDeleteOutline} size={18} />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                title={tr('network.addRoute')}
                aria-label={tr('network.addRoute')}
                disabled={value.routes.length >= 64}
                onClick={() => set('routes', [...value.routes, { destination: '', gateway: '', metric: -1 }])}
              >
                <Icon path={mdiPlus} size={18} />
              </Button>
            </div>
          </details>
        </>
      )}
    </fieldset>
  )
}

function NetworkPage() {
  const [tab, setTab] = useRouteTab('/network', ['interfaces', 'routes'], 'interfaces')
  const session = useQuery({ queryKey: ['session'], queryFn: () => request<Identity>('session') })
  const admin = session.data?.role === 'admin'
  const q = useQueryClient()
  const data = useQuery({
    queryKey: ['network'],
    queryFn: () => managed<Network>('network'),
    enabled: admin,
    refetchInterval: 5000,
  })
  const [details, setDetails] = useState<string | null>(null)
  const detailed = data.data?.interfaces.find((i) => i.name === details)
  const detailNetwork = detailed
    ? connectionNetwork(detailed, data.data?.interfaces ?? [], data.data?.sharing?.groups ?? [])
    : undefined
  const [removePort, setRemovePort] = useState<{ group: ShareGroup; name: string } | null>(null)
  const [wifiDetails, setWifiDetails] = useState<string | null>(null)
  const wifiInterface = data.data?.interfaces.find((i) => i.name === wifiDetails)
  const wifiGroup = data.data?.sharing?.groups.find((g) => !!g.wifi[wifiDetails ?? ''])
  const [edit, setEdit] = useState<Interface | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)
  const change = data.data?.change
  const pending = change && ['pending', 'applying'].includes(change.status) ? change : null
  useEffect(() => {
    if (!pending || !data.data) return
    const received = Date.now()
    const remaining = pending.deadline - data.data.serverTime
    const tick = () => setSeconds(Math.max(0, Math.ceil(remaining - (Date.now() - received) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [pending, data.dataUpdatedAt])
  const previousChange = useRef<Change | null>(null)
  useEffect(() => {
    const previous = previousChange.current
    if (
      change &&
      previous?.id === change.id &&
      ['pending', 'applying'].includes(previous.status) &&
      !['pending', 'applying'].includes(change.status)
    )
      notify(tr('network.status.' + change.status))
    previousChange.current = change ?? null
  }, [change])
  async function run(action: string, params: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      await operation(action, params)
      setEdit(null)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setBusy(false)
      void q.invalidateQueries({ queryKey: ['network'] })
      void q.invalidateQueries({ queryKey: ['jobs'] })
    }
  }
  if (!admin) return <Notice>{tr('network.admin')}</Notice>
  return (
    <>
      <div className="network-heading">
        <h1>{tr('network.title')}</h1>
        <Button
          title={tr('network.refresh')}
          aria-label={tr('network.refresh')}
          disabled={data.isFetching}
          onClick={() => void data.refetch()}
        >
          <Icon path={mdiRefresh} />
        </Button>
      </div>
      {data.error && <Notice error>{data.error.message}</Notice>}
      {error && !edit && !removePort && <Notice error>{error}</Notice>}
      {data.data?.backend === 'readonly' && <Notice>{tr('network.readonly')}</Notice>}
      {pending && (
        <Dialog.Root open>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <DialogContent
              busy={busy}
              className="settings-dialog share-confirm"
              onEscapeKeyDown={(e) => e.preventDefault()}
              onPointerDownOutside={(e) => e.preventDefault()}
            >
              <Dialog.Title>{tr('network.title')}</Dialog.Title>
              <strong>{tr('network.pending', { interface: pending.interface, seconds })}</strong>
              <Dialog.Description>{tr('network.confirmHint')}</Dialog.Description>
              {error && <Notice error>{error}</Notice>}
              {pending.addresses.length > 0 && (
                <div className="network-new-addresses">
                  {pending.addresses.map((address) => {
                    const ip = address.split('/')[0]
                    const host = ip.includes(':') ? `[${ip}]` : ip
                    return (
                      <a
                        key={address}
                        href={`${location.protocol}//${host}${location.port ? ':' + location.port : ''}/network/interfaces`}
                      >
                        {ip}
                      </a>
                    )
                  })}
                </div>
              )}
              {pending.user === session.data?.username ? (
                <div className="actions">
                  <Button
                    disabled={busy || !seconds || pending.status !== 'pending'}
                    onClick={() => void run('network.confirm', { id: pending.id })}
                  >
                    {tr('network.keep')}
                  </Button>
                  <Button
                    disabled={busy || !seconds || pending.status !== 'pending'}
                    onClick={() => void run('network.rollback', { id: pending.id })}
                  >
                    {tr('network.rollback')}
                  </Button>
                </div>
              ) : (
                <p>{tr('network.pendingUser', { user: pending.user })}</p>
              )}
            </DialogContent>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="tabs">
          <Tabs.Trigger value="interfaces">{tr('network.interfaces')}</Tabs.Trigger>
          <Tabs.Trigger value="routes">{tr('network.routes')}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="interfaces">
          {data.isPending && <p>{tr('network.loading')}</p>}
          {data.data && (
            <SharingLayout
              interfaces={data.data.interfaces}
              sharing={data.data.sharing ?? { groups: [], ready: false }}
              busy={busy || !!pending}
              error={error}
              run={run}
              renderCard={(item: Interface, group?: ShareGroup, actions?: ReactNode) => {
                const appearance = networkAppearance(
                  { ...item, sharingPort: !!group?.enabled },
                  data.data?.wifi,
                )
                return (
                  <article
                    className={`network-card network-status-card network-${appearance.state}`}
                    key={item.name}
                  >
                    <header>
                      <span
                        className="network-state-icon"
                        role="img"
                        aria-label={appearance.title}
                        title={appearance.title}
                      >
                        <Icon path={appearance.icon} size={36} />
                      </span>

                      <div>
                        <strong>{item.name}</strong>
                        <div className="small muted">
                          {tr(
                            'network.kind.' +
                              (['ethernet', 'wifi', 'bridge', 'bond', 'vlan', 'loopback'].includes(item.kind)
                                ? item.kind
                                : 'virtual'),
                          )}
                        </div>
                      </div>
                      <span className="network-card-actions">
                        {group && (
                          <Button
                            title={tr('share.details')}
                            aria-label={tr('share.details') + ' ' + item.name}
                            onClick={() => setDetails(item.name)}
                          >
                            <Icon path={mdiInformationOutline} size={20} />
                          </Button>
                        )}
                        {actions}
                        {!group && item.wifi && data.data?.wifi && (
                          <WifiControls
                            busy={busy}
                            name={item.name}
                            wifi={item.wifi}
                            radio={data.data.wifi}
                            connected={item.nmState === 100}
                            disabled={busy || !!pending}
                            run={run}
                            error={error}
                          />
                        )}
                        {!group && item.editable && (
                          <Button
                            title={tr('network.edit')}
                            aria-label={tr('network.edit') + ' ' + item.name}
                            disabled={busy || !!pending}
                            onClick={() => {
                              setEdit(item)
                              setConfig(structuredClone(item.config))
                              setError('')
                            }}
                          >
                            <Icon path={mdiPencilOutline} size={20} />
                          </Button>
                        )}
                      </span>
                    </header>
                    {!group && (
                      <dl>
                        <dt>{tr('network.profile')}</dt>
                        <dd>{item.profile || '—'}</dd>
                        <dt>IP</dt>
                        <dd>
                          {item.addresses.length
                            ? item.addresses.map((address) => <div key={address}>{address}</div>)
                            : '—'}
                        </dd>
                        <dt>DNS</dt>
                        <dd>{item.dns.join(', ') || '—'}</dd>
                        <dt>MAC</dt>
                        <dd>{item.mac || '—'}</dd>
                        <dt>MTU</dt>
                        <dd>{item.mtu}</dd>
                      </dl>
                    )}
                    {group && (
                      <>
                        <div className="network-sharing-caption">
                          <strong title={group.name}>{group.name}</strong>
                          <span className="small muted">
                            {tr('share.mode.' + group.mode)} · {tr('share.status.' + group.status)}
                          </span>
                        </div>
                        <div className="network-recipients" aria-label={tr('share.destinations')}>
                          {group.outputs.map((name) => {
                            const recipient = data.data?.interfaces.find((i) => i.name === name)
                            const state = recipient
                              ? networkAppearance(
                                  { ...recipient, sharingPort: group.enabled },
                                  data.data?.wifi,
                                )
                              : null
                            const title = [
                              name,
                              state?.title || tr('share.missing'),
                              group.wifi[name]?.ssid,
                              recipient?.wifi?.clients != null
                                ? tr('share.clients', { count: recipient.wifi.clients })
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')
                            return (
                              <div
                                key={name}
                                className={`network-recipient network-status-card network-${state?.state || 'off'}`}
                                title={title}
                              >
                                <span className="network-state-icon">
                                  <Icon path={state?.icon || mdiLan} size={32} />
                                </span>
                                <span className="network-recipient-label">
                                  <strong>{name}</strong>
                                  {group.wifi[name] && <small>{group.wifi[name].ssid}</small>}
                                </span>
                                <span className="network-recipient-actions">
                                  {group.wifi[name] && (
                                    <Button
                                      title={tr('network.wifiSettings')}
                                      aria-label={tr('network.wifiSettings') + ' ' + name}
                                      disabled={!recipient}
                                      onClick={() => {
                                        setError('')
                                        setWifiDetails(name)
                                      }}
                                    >
                                      <Icon path={mdiWifiCog} size={20} />
                                    </Button>
                                  )}
                                  <Button
                                    title={tr('share.removePort')}
                                    aria-label={tr('share.removePort') + ' ' + name}
                                    disabled={busy || !!pending}
                                    onClick={() => { setError(''); setRemovePort({ group, name }) }}
                                  >
                                    <Icon path={mdiDeleteOutline} size={20} />
                                  </Button>
                                  <Button
                                    title={tr('share.details')}
                                    aria-label={tr('share.details') + ' ' + name}
                                    disabled={!recipient}
                                    onClick={() => setDetails(name)}
                                  >
                                    <Icon path={mdiInformationOutline} size={20} />
                                  </Button>
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}
                    {!group && !item.editable && !item.wifi && (
                      <p className="small muted">{tr('network.viewOnly')}</p>
                    )}
                  </article>
                )
              }}
            />
          )}
        </Tabs.Content>
        <Tabs.Content value="routes">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tr('network.destination')}</th>
                  <th>{tr('network.gateway')}</th>
                  <th>{tr('network.interface')}</th>
                  <th>{tr('network.metricShort')}</th>
                  <th>{tr('network.routeTable')}</th>
                </tr>
              </thead>
              <tbody>
                {data.data?.routes.map((route, i) => (
                  <tr key={i}>
                    <td>
                      {route.dst || 'default'} <span className="small muted">IPv{route.family}</span>
                    </td>
                    <td>{route.gateway || '—'}</td>
                    <td>{route.dev || '—'}</td>
                    <td>{route.metric ?? '—'}</td>
                    <td>{route.table ?? 'main'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">{tr('network.routeHint')}</p>
        </Tabs.Content>
      </Tabs.Root>
      <Dialog.Root open={!!removePort} onOpenChange={(open) => { if (!open && !busy) setRemovePort(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent busy={busy} className="settings-dialog share-confirm">
            <Dialog.Title>{tr('share.removePort')}</Dialog.Title>
            <Dialog.Description>
              {tr('share.removePortQuestion', { name: removePort?.name ?? '' })}
              {removePort?.group.outputs.length === 1 && ' ' + tr('share.removeLastPort')}
            </Dialog.Description>
            {error && <Notice error>{error}</Notice>}
            <div className="actions">
              <Button disabled={busy} onClick={async () => {
                if (removePort && await run('network.share.remove-port', { id: removePort.group.id, interface: removePort.name })) setRemovePort(null)
              }}>{tr('share.removePortYes')}</Button>
              <Button disabled={busy} onClick={() => setRemovePort(null)}>{tr('share.cancel')}</Button>
            </div>
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={!!details}
        onOpenChange={(open) => {
          if (!open) setDetails(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent busy={busy} className="settings-dialog network-details-dialog">
            <div className="share-wizard-heading">
              <Dialog.Title>{tr('share.details')} · {details}</Dialog.Title>
              <Dialog.Close asChild>
                <Button title={tr('share.cancel')} aria-label={tr('share.cancel')}>
                  <Icon path={mdiClose} />
                </Button>
              </Dialog.Close>
            </div>
            <Dialog.Description hidden>{details}</Dialog.Description>

            {detailed ? (
              <dl>
                <dt>{tr('network.profile')}</dt>
                <dd>{detailNetwork?.profile || detailed.profile || '—'}</dd>
                <dt>{tr('network.stateLabel')}</dt>
                <dd>{networkAppearance({ ...detailed, sharingPort: detailNetwork?.name !== detailed.name }, data.data?.wifi).title}</dd>
                {detailNetwork?.name !== detailed.name && (
                  <>
                    <dt>{tr('network.sharedNetwork')}</dt>
                    <dd>
                      {detailNetwork?.name}
                      <p className="small muted">{tr('network.bridgeAddressHint')}</p>
                    </dd>
                  </>
                )}
                <dt>IP</dt>
                <dd>
                  {detailNetwork?.addresses.length
                    ? detailNetwork.addresses.map((address) => <div key={address}>{address}</div>)
                    : '—'}
                </dd>
                <dt>DNS</dt>
                <dd>{detailNetwork?.dns.join(' · ') || '—'}</dd>
                <dt>{tr('network.gateway')}</dt>
                <dd>
                  {data.data?.routes
                    .filter((r) => r.dev === detailNetwork?.name && (!r.dst || r.dst === 'default'))
                    .map((r) => r.gateway)
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </dd>
                <dt>MAC</dt>
                <dd>{detailed.mac || '—'}</dd>
                <dt>MTU</dt>
                <dd>{detailed.mtu}</dd>
              </dl>
            ) : (
              <Notice>{tr('share.missing')}</Notice>
            )}
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
      {wifiDetails && wifiInterface && wifiGroup && (
        <AccessPointDialog
          key={wifiDetails}
          name={wifiDetails}
          group={wifiGroup}
          iface={wifiInterface}
          radio={data.data?.wifi ?? undefined}
          busy={busy}
          disabled={!!pending}
          error={error}
          run={run}
          close={() => setWifiDetails(null)}
        />
      )}
      <Dialog.Root
        open={!!edit}
        onOpenChange={(open) => {
          if (!open && !busy) setEdit(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent busy={busy} className="settings-dialog network-dialog">
            <Dialog.Title>
              {tr('network.edit')} · {edit?.name}
            </Dialog.Title>
            <Dialog.Description>{tr('network.editHint')}</Dialog.Description>
            {error && <Notice error>{error}</Notice>}
            {config && (
              <div className="network-new-addresses">
                {[...config.ipv4.addresses, ...config.ipv6.addresses].filter(Boolean).map((address) => {
                  const host = address.split('/')[0].trim()
                  const url = new URL(window.location.href)
                  url.hostname = host.includes(':') ? `[${host}]` : host
                  return (
                    <a key={address} href={url.href}>
                      {host}
                    </a>
                  )
                })}
              </div>
            )}
            {config && edit && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const normalized = structuredClone(config)
                  for (const key of ['ipv4', 'ipv6'] as const) {
                    normalized[key].addresses = normalized[key].addresses.map((s) => s.trim()).filter(Boolean)
                    normalized[key].dns = normalized[key].dns.map((s) => s.trim()).filter(Boolean)
                    normalized[key].gateway = normalized[key].gateway.trim()
                  }
                  void run('network.configure', { interface: edit.name, config: normalized })
                }}
              >
                <fieldset disabled={busy} className="network-form-body">
                  <div className="network-ip-grid">
                    <IPFields
                      family={4}
                      value={config.ipv4}
                      onChange={(ipv4) => setConfig({ ...config, ipv4 })}
                    />
                    <IPFields
                      family={6}
                      value={config.ipv6}
                      onChange={(ipv6) => setConfig({ ...config, ipv6 })}
                    />
                  </div>
                  <details>
                    <summary>{tr('network.advanced')}</summary>
                    <label className="field">
                      {tr('network.mtu')}
                      <input
                        type="number"
                        min={0}
                        max={9000}
                        value={config.mtu}
                        onChange={(e) => setConfig({ ...config, mtu: Number(e.target.value) })}
                      />
                    </label>
                  </details>
                </fieldset>
                <div className="actions">
                  <Button disabled={busy || !!pending}>{tr('network.apply')}</Button>
                  <Dialog.Close asChild>
                    <Button type="button" disabled={busy}>
                      {tr('homes.cancel')}
                    </Button>
                  </Dialog.Close>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

registerModule({
  id: 'network',
  title: tr('network.title'),
  path: '/network',
  routes: ['interfaces', 'routes'],
  icon: mdiLan,
  component: NetworkPage,
  widgets: {
    network: {
      title: tr('network.title'),
      width: 2,
      height: 2,
      module: tr('network.title'),
      icon: mdiLan,
      component: NetworkWidget,
      history: true,
      href: '/network/interfaces',
    },
  },
})
