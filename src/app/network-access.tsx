import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { Button, DialogContent, Notice, WaitingSurface } from '../shared/ui'
import { useDraft } from '../shared/interaction'
import { managed, type Job } from './operations'
import { waitForJob } from '../shared/job-completion'
import { newID } from './dashboard'
import { notify } from './notifications'
import { useRouteTab } from './navigation'
import { tr } from '../i18n'

type Config = {
  enabled: boolean
  adapter: string
  ssid: string
  password: string
  band: string
  delay: number
  onLoss: boolean
  usb: boolean
}
type Device = {
  name: string
  mac: string
  ap: boolean
  kind: string
  reserved: boolean
  bands: string[]
  addresses: string[]
}
export type Access = {
  config: Config
  devices: Device[]
  state: { phase: string; interface?: string; clients: number; error?: string; usbState: string }
  usb: { available: boolean; port: string; reason: string; reboot: boolean }
}
export const accessQuery = {
  queryKey: ['network-access'],
  queryFn: () => managed<Access>('network-access'),
  refetchInterval: 10000,
}
export function NetworkAccessSettings() {
  const data = useQuery(accessQuery)
  if (data.error) return <Notice>{String(data.error)}</Notice>
  if (!data.data) return <p role="status">{tr('access.loading')}</p>
  return <AccessForm incoming={data.data} />
}
function AccessForm({ incoming }: { incoming: Access }) {
  const [tab, setTab] = useRouteTab('/settings/network', ['fallback', 'usb'], 'fallback')
  const { draft: value, setDraft: setValue, dirty, reset } = useDraft(incoming.config)
  const [reveal, setReveal] = useState(false)
  const [confirm, setConfirm] = useState<'save' | 'stop' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const q = useQueryClient()
  const update = <K extends keyof Config>(key: K, v: Config[K]) => setValue({ ...value, [key]: v })
  async function apply(kind: 'save' | 'stop') {
    setBusy(true)
    setError('')
    try {
      const action = 'network.access.' + kind
      const params = kind === 'save' ? value : {}
      const plan = await managed<{ fingerprint: string; confirmation: string }>('plan', { action, params })
      const job = await managed<{ id: string }>('run', {
        id: newID(),
        action,
        params,
        fingerprint: plan.fingerprint,
        confirmation: plan.confirmation,
      })
      await waitForJob(
        async () => (await managed<Job[]>('jobs')).find((j) => j.id === job.id),
        undefined,
        120,
      )
      if (kind === 'save') reset(value)
      setConfirm(null)
      await q.invalidateQueries({ queryKey: ['network-access'] })
      await q.invalidateQueries({ queryKey: ['network'] })
      notify(tr('access.saved'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const addressRows = incoming.devices.filter((d) => d.name === incoming.state.interface || d.kind === 'usb')
  const active = ['access-point', 'restored'].includes(incoming.state.phase)
  const adapters = incoming.devices.filter((d) => d.ap && !d.reserved)
  const selected = adapters.find((d) => d.mac === value.adapter)
  return (
    <WaitingSurface busy={busy && !confirm}>
      <Tabs.Root className="tabbed-page" activationMode="manual" value={tab} onValueChange={setTab}>
        <Tabs.List className="tabs" aria-label={tr('access.title')}>
          <Tabs.Trigger value="fallback">{tr('access.fallback')}</Tabs.Trigger>
          <Tabs.Trigger value="usb">{tr('access.usb')}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="fallback">
          <section className="disk-settings-section">
            <h2>{tr('access.fallback')}</h2>
            <p>{tr('access.help')}</p>
            <p role="status">
              {tr('access.state.' + (incoming.state.phase || 'waiting'))}
              {incoming.state.interface ? ' · ' + incoming.state.interface : ''}
              {active
                ? ' · ' +
                  tr('access.clients') +
                  ': ' +
                  (incoming.state.clients < 0 ? '—' : incoming.state.clients)
                : ''}
            </p>
            {incoming.state.error && <Notice>{incoming.state.error}</Notice>}
            {!adapters.length && <Notice>{tr('access.noAdapter')}</Notice>}
            <label className="check">
              <input
                type="checkbox"
                checked={value.enabled}
                onChange={(e) => update('enabled', e.target.checked)}
                disabled={!adapters.length && !value.enabled}
              />
              {tr('access.enabled')}
            </label>
            <div className="user-form-grid">
              <label className="field">
                {tr('access.adapter')}
                <select value={value.adapter} onChange={(e) => update('adapter', e.target.value)}>
                  <option value="">{tr('access.auto')}</option>
                  {value.adapter && !selected && (
                    <option value={value.adapter}>
                      {value.adapter} · {tr('access.absent')}
                    </option>
                  )}
                  {adapters.map((d) => (
                    <option key={d.mac} value={d.mac}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {tr('access.ssid')}
                <input value={value.ssid} maxLength={32} onChange={(e) => update('ssid', e.target.value)} />
              </label>
              <label className="field">
                {tr('access.password')}
                <input
                  type={reveal ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={value.password}
                  minLength={12}
                  maxLength={63}
                  onChange={(e) => update('password', e.target.value)}
                />
              </label>
              <label className="check">
                <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} />
                {tr('access.reveal')}
              </label>
              <label className="field">
                {tr('access.band')}
                <select value={value.band} onChange={(e) => update('band', e.target.value)}>
                  <option value="auto">{tr('access.auto')}</option>
                  {(['bg', 'a'] as const)
                    .filter((b) => !selected || selected.bands.includes(b))
                    .map((b) => (
                      <option value={b} key={b}>
                        {b === 'bg' ? '2.4 GHz' : '5 GHz'}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                {tr('access.delay')}
                <input
                  type="number"
                  min={30}
                  max={900}
                  value={value.delay}
                  onChange={(e) => update('delay', Number(e.target.value))}
                />
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={value.onLoss}
                onChange={(e) => update('onLoss', e.target.checked)}
              />
              {tr('access.onLoss')}
            </label>
            <p>{tr('access.returnHelp')}</p>
            {active && <Button onClick={() => setConfirm('stop')}>{tr('access.stop')}</Button>}
          </section>
        </Tabs.Content>
        <Tabs.Content value="usb">
          <section className="disk-settings-section">
            <h2>{tr('access.usb')}</h2>
            <p>{tr('access.usbHelp')}</p>
            <p role="status">{tr('access.usbState.' + (incoming.state.usbState || 'disabled'))}</p>
            {incoming.usb.port && (
              <p>
                {tr('access.port')}: <strong>{incoming.usb.port}</strong>
              </p>
            )}
            {!incoming.usb.available && <Notice>{tr('access.usbState.' + incoming.usb.reason)}</Notice>}
            {value.usb && incoming.usb.reboot && <Notice>{tr('access.reboot')}</Notice>}
            <label className="check">
              <input
                type="checkbox"
                checked={value.usb}
                disabled={!incoming.usb.available && !value.usb}
                onChange={(e) => update('usb', e.target.checked)}
              />
              {tr('access.usbEnabled')}
            </label>
            <p>{tr('access.power')}</p>
          </section>
        </Tabs.Content>
      </Tabs.Root>
      <div className="small muted">
        {addressRows.flatMap((d) =>
          (d.addresses ?? [])
            .filter((a) => !a.includes(':'))
            .map((a) => (
              <p key={d.name + a}>
                {tr('access.address')} · {d.name}: <strong>{a.split('/')[0]}</strong>
              </p>
            )),
        )}
      </div>
      {!confirm && error && <Notice error>{error}</Notice>}
      <Button
        className="primary"
        disabled={!dirty || busy}
        onClick={() => (active ? setConfirm('save') : void apply('save'))}
      >
        {tr('access.apply')}
      </Button>
      <Dialog.Root
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent
            variant="compact"
            intent="confirm"
            busy={busy}
            className="dialog compact-confirm"
            header={
              <>
                <Dialog.Title>{tr(confirm === 'stop' ? 'access.stop' : 'access.apply')}</Dialog.Title>
                <Dialog.Description>{tr('access.confirm')}</Dialog.Description>
              </>
            }
            footer={
              <>
                <Button disabled={busy} onClick={() => setConfirm(null)}>
                  {tr('access.cancel')}
                </Button>
                <Button className="primary" disabled={busy} onClick={() => confirm && void apply(confirm)}>
                  {tr('access.apply')}
                </Button>
              </>
            }
          >
            {error && <Notice>{error}</Notice>}
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </WaitingSurface>
  )
}
