import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { request, type Identity } from '../api/client'
import { tr } from '../i18n'
import { Button, Notice } from '../shared/ui'
import { WaitingSurface } from '../shared/waiting'
import { managed, type Job } from './operations'
import { newID } from './dashboard'
import { waitForJob } from '../shared/job-completion'
import { notify } from './notifications'

type Hostname = { hostname: string; networkName: string; state: string; port: number; scheme: string }
export function HostnameSettings() {
  const session = useQuery({ queryKey: ['session'], queryFn: () => request<Identity>('session') })
  const admin = session.data?.role === 'admin'
  const data = useQuery({
    queryKey: ['hostname'],
    queryFn: () => managed<Hostname>('hostname'),
    enabled: admin,
    refetchInterval: 10000,
  })
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (data.data) setName(data.data.hostname)
  }, [data.data?.hostname])
  const valid = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name) && name !== 'localhost'
  const dirty = name !== data.data?.hostname
  const host = dirty ? `${name}.local` : data.data?.networkName || `${name}.local`
  const address = data.data && valid ? new URL(`${data.data.scheme}://${host}:${data.data.port}/`).href : ''
  async function save() {
    setBusy(true)
    setError('')
    try {
      const action = 'system.hostname',
        params = { hostname: name }
      const plan = await managed<{ fingerprint: string; confirmation: string }>('plan', { action, params })
      const job = await managed<{ id: string }>('run', {
        id: newID(),
        action,
        params,
        fingerprint: plan.fingerprint,
        confirmation: plan.confirmation,
      })
      await waitForJob(async () => (await managed<Job[]>('jobs')).find((item) => item.id === job.id))
      notify(tr('hostname.saved'))
      await data.refetch()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }
  if (!admin) return null
  return (
    <WaitingSurface busy={busy}>
      <section className="surface">
        <h2>{tr('hostname.title')}</h2>
        {data.error && <Notice error>{data.error.message}</Notice>}
        {error && <Notice error>{error}</Notice>}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (valid && dirty) void save()
          }}
        >
          <label className="field">
            {tr('hostname.label')}
            <input
              value={name}
              onChange={(event) => setName(event.target.value.toLowerCase())}
              maxLength={63}
              required
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby="hostname-help hostname-address"
              disabled={!data.data}
              style={{ maxWidth: '24rem' }}
            />
          </label>
          <p id="hostname-help" className="muted small">
            {tr('hostname.help')}
          </p>
          <p id="hostname-address" className="small">
            {tr(dirty ? 'hostname.preview' : 'hostname.address')}{' '}
            {address &&
              (dirty || data.data?.state !== 'ready' ? (
                <span>{address}</span>
              ) : (
                <a href={address} target="_blank" rel="noreferrer">
                  {address}
                </a>
              ))}
          </p>
          <p className="muted small">{tr('hostname.localOnly')}</p>
          {data.data?.state !== 'ready' && data.data && <Notice>{tr('hostname.unavailable')}</Notice>}
          {data.data?.scheme === 'https' && <p className="muted small">{tr('hostname.tls')}</p>}
          <Button type="submit" className="primary" disabled={!data.data || !valid || !dirty}>
            {tr('apply_768af677')}
          </Button>
        </form>
      </section>
    </WaitingSurface>
  )
}
