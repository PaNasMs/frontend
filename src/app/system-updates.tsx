import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { mdiRefresh, mdiDownload, mdiUpdate, mdiRestore, mdiCheck, mdiClose } from '@mdi/js'
import { tr, locale } from '../i18n'
import { Button, Icon, Notice, DialogContent, WaitingOverlay } from '../shared/ui'
import { managed, type Job } from './operations'
import { newID } from './desktop-layout'
import { waitForJob } from '../shared/job-completion'
import { isAdministrator } from './module-registry'
import { notify } from './notifications'
import type { ActiveTask } from './active-tasks'

type Settings = { channel: 'stable' | 'testing'; mode: 'notify' | 'download' | 'auto'; hour: number }
type State = { id?: string; phase?: string; error?: string; version?: string; startedAt?: string; finishedAt?: string }
type UpdateInfo = { settings: Settings; installed: Record<string, string>; candidate: { version: string; run: string; createdAt: string } | null; available: boolean; busy: boolean; rollbackAvailable: boolean; checkedAt?: string; state: State; history: State[] }
export function useSystemUpdates() {
  return useQuery({ queryKey: ['system-updates'], queryFn: () => managed<UpdateInfo>('system-updates'), enabled: isAdministrator(), refetchInterval: 5000, retry: false })
}
export function useUpdateTask(): ActiveTask[] {
  const { data } = useSystemUpdates()
  return data?.busy ? [{ id: 'system-update', title: tr('up.title'), target: data.state.version ?? '', stage: tr('up.phase.' + data.state.phase), paused: false, href: '/settings/updates' }] : []
}
export function SystemUpdates() {
  const query = useSystemUpdates()
  const q = useQueryClient()
  const data = query.data
  const [settings, setSettings] = useState<Settings>({ channel: 'stable', mode: 'notify', hour: 3 })
  const [operation, setOperation] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const installing = useRef(false)
  useEffect(() => { if (data) setSettings(data.settings) }, [data?.settings.channel, data?.settings.mode, data?.settings.hour])
  useEffect(() => {
    if (data?.busy && ['installing', 'verifying'].includes(data.state.phase ?? '')) installing.current = true
    if (installing.current && data && !data.busy && ['complete', 'rolled-back'].includes(data.state.phase ?? '')) window.location.reload()
  }, [data?.busy, data?.state.phase])
  async function apply(action: string, params: Record<string, unknown> = {}) {
    setBusy(true); setError('')
    try {
      const plan = await managed<{ fingerprint: string; confirmation: string }>('plan', { action, params })
      const job = await managed<{ id: string }>('run', { id: newID(), action, params, fingerprint: plan.fingerprint, confirmation: plan.confirmation })
      await waitForJob(async () => (await managed<Job[]>('jobs')).find((item) => item.id === job.id))
      await q.invalidateQueries({ queryKey: ['system-updates'] })
      setOperation(null)
      if (action.endsWith('settings')) notify(tr('up.saved'))
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const working = busy || !!data?.busy
  return <div className="update-settings">
    <div className="page-heading"><h2>{tr('up.title')}</h2><div className="actions">
      <Button title={tr('up.check')} disabled={working} onClick={() => void apply('system.update.check')}><Icon path={mdiRefresh} /></Button>
      <Button title={tr('up.download')} disabled={working || !data?.available} onClick={() => void apply('system.update.download')}><Icon path={mdiDownload} /></Button>
      <Button title={tr('up.install')} disabled={working || !data?.available} onClick={() => {setError('');setOperation('install')}}><Icon path={mdiUpdate} /></Button>
      <Button title={tr('up.rollback')} disabled={working || !data?.rollbackAvailable} onClick={() => {setError('');setOperation('rollback')}}><Icon path={mdiRestore} /></Button>
    </div></div>
    {error && !operation && <Notice error>{error}</Notice>}
    {query.error && !working && <Notice error>{query.error.message}</Notice>}
    {data?.state.error && <Notice error>{data.state.error}</Notice>}
    <dl className="update-summary"><dt>{tr('up.current')}</dt><dd>{data?.installed['panasms-prototype'] ?? '—'}</dd><dt>{tr('up.available')}</dt><dd>{data?.available ? data.candidate?.version : tr('up.none')}</dd><dt>{tr('up.checked')}</dt><dd>{data?.checkedAt ? new Date(data.checkedAt).toLocaleString(locale()) : '—'}</dd></dl>
    {data?.candidate && <a href={data.candidate.run} target="_blank" rel="noreferrer">{tr('up.changes')}</a>}
    <form className="update-preferences waiting-surface" onSubmit={(e) => {e.preventDefault();void apply('system.update.settings', settings)}}>
      <h3>{tr('up.preferences')}</h3>
      <label className="field">{tr('up.channel')}<select value={settings.channel} onChange={(e) => setSettings({...settings,channel:e.target.value as Settings['channel']})}><option value="stable">Stable</option><option value="testing">Testing</option></select></label>
      <label className="field">{tr('up.mode')}<select value={settings.mode} onChange={(e) => setSettings({...settings,mode:e.target.value as Settings['mode']})}><option value="notify">{tr('up.notify')}</option><option value="download">{tr('up.autoDownload')}</option><option value="auto">{tr('up.autoInstall')}</option></select></label>
      {settings.mode==='auto' && <label className="field">{tr('up.hour')}<select value={settings.hour} onChange={(e) => setSettings({...settings,hour:Number(e.target.value)})}>{Array.from({length:24},(_,h)=><option key={h} value={h}>{String(h).padStart(2,'0')}:00–{String(h).padStart(2,'0')}:59</option>)}</select></label>}
      <p className="small muted">{tr('up.policy')}</p>
      <Button type="submit" title={tr('apply_768af677')} disabled={working || JSON.stringify(settings)===JSON.stringify(data?.settings)}><Icon path={mdiCheck} /></Button>
      {busy && !operation && <WaitingOverlay />}
    </form>
    <h3>{tr('up.history')}</h3>
    {data?.history.length ? <div className="table-wrap"><table><thead><tr><th>{tr('up.date')}</th><th>{tr('up.version')}</th><th>{tr('up.result')}</th></tr></thead><tbody>{data.history.map((row)=><tr key={row.id}><td>{new Date(row.finishedAt ?? row.startedAt ?? '').toLocaleString(locale())}</td><td>{row.version ?? '—'}</td><td>{tr('up.phase.'+row.phase)}{row.error && <p className="small">{row.error}</p>}</td></tr>)}</tbody></table></div> : <p className="muted">{tr('up.empty')}</p>}
    <Dialog.Root open={!!operation || !!data?.busy} onOpenChange={(open)=>{if(!open && !working)setOperation(null)}}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><DialogContent className="settings-dialog power-dialog" busy={working} message={tr('up.phase.'+(data?.state.phase ?? 'queued'))} hint={tr('up.wait')}>
      <div className="dialog-heading"><Dialog.Title>{tr(operation==='rollback'?'up.rollback':'up.install')}</Dialog.Title><Dialog.Close asChild><Button title={tr('close_4ae50d30')}><Icon path={mdiClose}/></Button></Dialog.Close></div>
      <Dialog.Description>{tr(operation==='rollback'?'up.rollbackHint':'up.installHint')}</Dialog.Description>
      {error && <Notice error>{error}</Notice>}
      <div className="actions"><Dialog.Close asChild><Button>{tr('cancel_0ec753be')}</Button></Dialog.Close><Button className="primary" onClick={()=>void apply('system.update.'+operation)}>{tr('homes.confirmButton')}</Button></div>
    </DialogContent></Dialog.Portal></Dialog.Root>
  </div>
}
