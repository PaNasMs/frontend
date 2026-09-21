import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  mdiShareVariant,
  mdiPlus,
  mdiPencil,
  mdiDeleteOutline,
  mdiShieldKeyOutline,
  mdiRefresh,
  mdiCheck,
  mdiClose,
  mdiAccountCheck,
  mdiAccountOff,
} from '@mdi/js'
import { tr } from '../i18n'
import { request, type Accounts } from '../api/client'
import { managed, OperationButton, type Job } from './operations'
import { Button, Icon, Notice, DialogContent } from '../shared/ui'
import { waitForJob } from '../shared/job-completion'
import { newID } from './dashboard'
import { notify } from './notifications'
import { registerModule } from './module-registry'

type Share = {
  name: string
  path: string
  smb: boolean
  nfs: boolean
  readers: string[]
  writers: string[]
  clients: string[]
  readOnly: boolean
}
type State = {
  shares: Share[]
  accounts: Record<string, { enabled: boolean; status: string; uid: number }>
  drift: boolean
  recovery: boolean
  smbAvailable: boolean
  services: Record<string, string>
  sessions: {
    sessions?: Record<string, { username: string; remote_machine: string; hostname?: string }>
    tcons?: Record<string, { service: string; machine: string }>
    error?: string
  }
}
const empty: Share = {
  name: '',
  path: '/srv/',
  smb: true,
  nfs: false,
  readers: [],
  writers: [],
  clients: [],
  readOnly: false,
}

export function SharingPage() {
  const cache = useQueryClient()
  const [search, setSearch] = useSearchParams()
  const tab = search.get('tab') ?? 'folders'
  const [editing, setEditing] = useState<Share | null>(null)
  const data = useQuery({
    queryKey: ['sharing'],
    queryFn: () => managed<State>('sharing'),
    refetchInterval: 10000,
  })
  const users = useQuery({ queryKey: ['users'], queryFn: () => request<Accounts>('users') })
  const legacy = useQuery({
    queryKey: ['nfs'],
    queryFn: () => managed<{ exports: { path: string; clients: string[]; readOnly: boolean }[] }>('nfs'),
  })
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ['sharing'] })
    void cache.invalidateQueries({ queryKey: ['nfs'] })
  }
  const choices = {
    owner: (users.data?.users ?? [])
      .filter((u) => u.category !== 'service')
      .map((u) => ({ id: u.username, label: u.username })),
    group: (users.data?.groups ?? []).map((g) => ({ id: g.name, label: g.name })),
  }
  return (
    <>
      <div className="page-heading">
        <h1>{tr('shared_folders_5800977d')}</h1>
        <div className="row">
          <Button title={tr('shares.add')} aria-label={tr('shares.add')} onClick={() => setEditing(empty)}>
            <Icon path={mdiPlus} />
          </Button>
          <Button title={tr('refresh_c2f668e5')} onClick={refresh}>
            <Icon path={mdiRefresh} />
          </Button>
        </div>
      </div>
      <nav className="sharing-tabs">
        {['folders', 'accounts', 'connections'].map((t) => (
          <Button key={t} className={t === tab ? 'active' : ''} onClick={() => setSearch({ tab: t })}>
            {tr('shares.' + t)}
          </Button>
        ))}
      </nav>
      {data.error && <Notice error>{data.error.message}</Notice>}
      {(data.data?.drift || data.data?.recovery) && (
        <Notice error>
          {tr('shares.drift')}
          <OperationButton actions={['share.recover']} initial={{}} fields={[]} autoReview onDone={refresh} />
        </Notice>
      )}
      {data.data && (
        <p className="small muted">
          SMB: {tr('shares.service.' + data.data.services.smbd)} · NFS:{' '}
          {tr('shares.service.' + data.data.services['nfs-kernel-server'])}
        </p>
      )}
      {tab === 'folders' && (
        <>
          <p className="muted">{tr('shares.permissionsHint')}</p>
          <div className="sharing-grid">
            {data.data?.shares.map((s) => (
              <article className="surface sharing-card" key={s.name}>
                <div className="user-section-heading">
                  <h2>
                    <Icon path={mdiShareVariant} /> {s.name}
                  </h2>
                  <div className="row">
                    <Button
                      title={tr('shares.edit')}
                      aria-label={tr('shares.edit')}
                      onClick={() => setEditing(s)}
                    >
                      <Icon path={mdiPencil} />
                    </Button>
                    <OperationButton
                      label={tr('shares.permissions')}
                      icon={mdiShieldKeyOutline}
                      actions={['folder.permissions']}
                      initial={{ target: s.path }}
                      choices={choices}
                      fields={[
                        { key: 'owner', label: tr('owner_username_6137717d'), type: 'select' },
                        { key: 'group', label: tr('group_ae8ad7b5'), type: 'select' },
                        {
                          key: 'mode',
                          label: tr('unix_folder_permissions_076ccf72'),
                          type: 'select',
                          options: ['0700', '0750', '0770', '0755', '0775', '2770', '2775'],
                          value: '2770',
                        },
                      ]}
                    />
                    <OperationButton
                      label={tr('shares.remove')}
                      icon={mdiDeleteOutline}
                      actions={['share.remove']}
                      initial={{ target: s.name }}
                      fields={[]}
                      autoReview
                      onDone={refresh}
                    />
                  </div>
                </div>
                <p className="sharing-path">{s.path}</p>
                <p>
                  {[s.smb && 'SMB', s.nfs && 'NFS'].filter(Boolean).join(' · ') || tr('shares.unpublished')}
                </p>
                {s.smb && (
                  <p className="small">
                    {tr('shares.readers')}: {s.readers.join(', ') || '—'}
                    <br />
                    {tr('shares.writers')}: {s.writers.join(', ') || '—'}
                  </p>
                )}
                {s.nfs && (
                  <p className="small">
                    NFS: {s.clients.join(', ')} ·{' '}
                    {tr(s.readOnly ? 'read_only_c5eb2661' : 'read_and_write_823409cc')}
                  </p>
                )}
              </article>
            ))}
          </div>
          {data.data?.shares.length === 0 && <Notice>{tr('no_folders_shared_yet_0db807d5')}</Notice>}
          {legacy.data?.exports.map((s) => (
            <article className="surface sharing-card" key={s.path}>
              <h2>NFS · {s.path}</h2>
              <p>{s.clients.join(', ')}</p>
              <OperationButton
                actions={['nfs.export', 'nfs.export-remove']}
                initial={{ target: s.path, clients: s.clients.join(','), readOnly: s.readOnly }}
                onDone={refresh}
              />
            </article>
          ))}
        </>
      )}
      {tab === 'accounts' && (
        <>
          <p className="muted">{tr('shares.accountHint')}</p>
          <div className="sharing-grid">
            {users.data?.users
              .filter((u) => u.category !== 'service')
              .map((u) => {
                const a = data.data?.accounts[u.username]
                return (
                  <article className="surface sharing-card" key={u.username}>
                    <div className="user-section-heading">
                      <strong>{u.username}</strong>
                      <OperationButton
                        actions={['share.account']}
                        label={tr(a?.enabled ? 'shares.disable' : 'shares.enable')}
                        icon={a?.enabled ? mdiAccountOff : mdiAccountCheck}
                        initial={{ target: u.username, enabled: !a?.enabled }}
                        fields={[]}
                        autoReview
                        onDone={refresh}
                      />
                    </div>
                    <p>{tr('shares.' + (a?.status ?? 'disabled'))}</p>
                  </article>
                )
              })}
          </div>
        </>
      )}
      {tab === 'connections' && (
        <>
          <p className="muted">{tr('shares.connectionsHint')}</p>
          {data.data?.sessions.error && <Notice error>{data.data.sessions.error}</Notice>}
          <div className="sharing-grid">
            {Object.entries(data.data?.sessions.sessions ?? {}).map(([id, s]) => (
              <article className="surface sharing-card" key={id}>
                <div className="user-section-heading">
                  <strong>{s.username}</strong>
                  <OperationButton
                    actions={['share.disconnect']}
                    label={tr('shares.disconnect')}
                    icon={mdiClose}
                    initial={{ target: s.username }}
                    fields={[]}
                    autoReview
                    onDone={refresh}
                  />
                </div>
                <p>{s.remote_machine || s.hostname}</p>
              </article>
            ))}
          </div>
          {!Object.keys(data.data?.sessions.sessions ?? {}).length && (
            <Notice>{tr('shares.noConnections')}</Notice>
          )}
        </>
      )}
      {editing && (
        <ShareEditor
          original={editing}
          accounts={users.data}
          close={() => setEditing(null)}
          done={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
    </>
  )
}
function ShareEditor({
  original,
  accounts,
  close,
  done,
}: {
  original: Share
  accounts?: Accounts
  close: () => void
  done: () => void
}) {
  const [value, setValue] = useState({ ...original, clients: original.clients.join(',') })
  const [step, setStep] = useState(0)
  const update = (key: string, v: unknown) => setValue((s) => ({ ...s, [key]: v }))
  const save = useMutation({
    mutationFn: async () => {
      const params = { ...value, target: original.name }
      const p = await managed<{ fingerprint: string; confirmation: string }>('plan', {
        action: 'share.save',
        params,
      })
      const job = await managed<{ id: string }>('run', { id: newID(), action: 'share.save', params, ...p })
      await waitForJob(async () => (await managed<Job[]>('jobs')).find((j) => j.id === job.id))
    },
    onSuccess: () => {
      notify(tr('shares.saved'))
      done()
    },
  })
  const entries = [
    ...(accounts?.users ?? [])
      .filter((u) => u.category !== 'service')
      .map((u) => ({ id: u.username, label: u.username })),
    ...(accounts?.groups ?? [])
      .filter(
        (g) =>
          (g.gid >= 1000 && g.gid < 65534) ||
          ['sudo', 'users'].includes(g.name) ||
          [...value.readers, ...value.writers].includes('@' + g.name),
      )
      .map((g) => ({ id: '@' + g.name, label: '@' + g.name })),
  ]
  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o && !save.isPending) close()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <DialogContent
          className="settings-dialog sharing-dialog"
          busy={save.isPending}
          message={tr('applying_changes_and_refreshing_data_2f929fed')}
        >
          <div className="dialog-heading">
            <Dialog.Title>{tr(original.name ? 'shares.edit' : 'shares.add')}</Dialog.Title>
            <Button title={tr('close_4ae50d30')} onClick={close} disabled={save.isPending}>
              <Icon path={mdiClose} />
            </Button>
          </div>
          <Dialog.Description>{tr('shares.step' + step)}</Dialog.Description>
          {step === 0 && (
            <>
              <label className="field">
                {tr('shares.name')}
                <input value={value.name} onChange={(e) => update('name', e.target.value)} />
              </label>
              <label className="field">
                {tr('shares.path')}
                <input value={value.path} onChange={(e) => update('path', e.target.value)} />
              </label>
              <div className="row">
                {(['smb', 'nfs'] as const).map((k) => (
                  <label className="check" key={k}>
                    <input type="checkbox" checked={value[k]} onChange={(e) => update(k, e.target.checked)} />
                    {k.toUpperCase()}
                  </label>
                ))}
              </div>
            </>
          )}
          {step === 1 && (
            <>
              {value.smb && (
                <>
                  <div className="sharing-permissions">
                    {entries.map((o) => (
                      <label key={o.id}>
                        <span>{o.label}</span>
                        <select
                          aria-label={o.label}
                          value={
                            value.writers.includes(o.id)
                              ? 'write'
                              : value.readers.includes(o.id)
                                ? 'read'
                                : 'none'
                          }
                          onChange={(e) =>
                            setValue((s) => ({
                              ...s,
                              readers: [
                                ...s.readers.filter((v) => v !== o.id),
                                ...(e.target.value === 'read' ? [o.id] : []),
                              ],
                              writers: [
                                ...s.writers.filter((v) => v !== o.id),
                                ...(e.target.value === 'write' ? [o.id] : []),
                              ],
                            }))
                          }
                        >
                          <option value="none">{tr('shares.noAccess')}</option>
                          <option value="read">{tr('read_only_c5eb2661')}</option>
                          <option value="write">{tr('read_and_write_823409cc')}</option>
                        </select>
                      </label>
                    ))}
                  </div>
                  <p className="small muted">{tr('shares.permissionsHint')}</p>
                </>
              )}
              {value.nfs && (
                <>
                  <label className="field">
                    {tr('shares.clients')}
                    <input
                      value={value.clients}
                      onChange={(e) => update('clients', e.target.value)}
                      placeholder="192.168.1.0/24"
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={value.readOnly}
                      onChange={(e) => update('readOnly', e.target.checked)}
                    />
                    {tr('read_only_c5eb2661')}
                  </label>
                  <p className="small muted">{tr('shares.nfsHint')}</p>
                </>
              )}
            </>
          )}
          {save.error && <Notice error>{save.error.message}</Notice>}
          <div className="dialog-actions">
            {step > 0 && <Button onClick={() => setStep(0)}>{tr('shares.back')}</Button>}
            <Button
              onClick={() => (step === 0 ? setStep(1) : save.mutate())}
              disabled={save.isPending || !value.name || !value.path}
            >
              <Icon path={mdiCheck} />
              {tr(step === 0 ? 'shares.next' : 'shares.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
registerModule({
  id: 'sharing',
  title: tr('shared_folders_5800977d'),
  path: '/sharing',
  icon: mdiShareVariant,
  component: SharingPage,
})
