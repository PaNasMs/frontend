import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { mdiCheck } from '@mdi/js'
import { request, type Identity } from '../api/client'
import { tr } from '../i18n'
import { Button, Icon, Notice, DialogContent } from '../shared/ui'
import { managed, type Job } from './operations'
import { newID } from './dashboard'
import { waitForJob } from '../shared/job-completion'

type Access = { port: number; pending: boolean; error: string }
export function WebSettings() {
  const session = useQuery({ queryKey: ['session'], queryFn: () => request<Identity>('session') })
  const admin = session.data?.role === 'admin'
  const data = useQuery({
    queryKey: ['web-access'],
    queryFn: () => managed<Access>('web-access'),
    enabled: admin,
  })
  const [port, setPort] = useState('80')
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (data.data) setPort(String(data.data.port))
  }, [data.data?.port])
  const valid = /^\d+$/.test(port) && Number(port) >= 1 && Number(port) <= 65535
  const address = new URL(window.location.href)
  address.protocol = 'http:'
  address.port = valid ? String(Number(port)) : ''
  address.pathname = '/settings/general'
  address.search = ''
  address.hash = ''
  async function save() {
    setBusy(true)
    setError('')
    try {
      const action = 'system.web-port'
      const params = { port: Number(port) }
      const plan = await managed<{ fingerprint: string; confirmation: string }>('plan', { action, params })
      const job = await managed<{ id: string }>('run', {
        id: newID(),
        action,
        params,
        fingerprint: plan.fingerprint,
        confirmation: plan.confirmation,
      })
      await waitForJob(async () => (await managed<Job[]>('jobs')).find((item) => item.id === job.id))
      await new Promise((resolve) => setTimeout(resolve, 8000))
      for (let attempt = 0; attempt < 12; attempt++) {
        try {
          const response = await fetch(new URL('/api/v1/health', address), {
            credentials: 'omit',
            cache: 'no-store',
            signal: AbortSignal.timeout(1500),
          })
          const health = await response.json()
          if (response.ok && health.status === 'ok' && health.product === 'PaNasMs') {
            window.location.assign(address.href)
            return
          }
        } catch {
          /* The new listener may not be ready yet. */
        }
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
      setReady(true)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
      void data.refetch()
    }
  }
  if (!admin) return <Notice>{tr('homes.admin')}</Notice>
  return (
    <section className="surface">
      <h2>{tr('web.title')}</h2>
      <p className="muted">{tr('web.description')}</p>
      {data.error && <Notice error>{data.error.message}</Notice>}
      {data.data?.error && <Notice error>{data.data.error}</Notice>}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          setError('')
          setReady(false)
          setOpen(true)
        }}
      >
        <label className="field">
          {tr('web.port')}
          <input
            type="number"
            min={1}
            max={65535}
            step={1}
            required
            value={port}
            onChange={(event) => setPort(event.target.value)}
            style={{ maxWidth: '12rem' }}
          />
        </label>
        <p className="muted small">{tr('web.default')}</p>
        <Button
          type="submit"
          className="primary"
          disabled={!valid || !data.data || data.data.pending || Number(port) === data.data.port}
        >
          <Icon path={mdiCheck} />
          {tr('apply_768af677')}
        </Button>
      </form>
      <Dialog.Root
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent
            className="settings-dialog power-dialog"
            busy={busy}
            message={tr('web.waiting')}
            header={
              <>
                {' '}
                <Dialog.Title>{tr('web.confirm')}</Dialog.Title>
                <Dialog.Description>{tr(ready ? 'web.openNew' : 'web.restart')}</Dialog.Description>{' '}
              </>
            }
            footer={
              <div className="actions">
                <Button onClick={() => setOpen(false)} data-dialog-cancel>
                  {tr('cancel_0ec753be')}
                </Button>
                {ready ? (
                  <a className="button primary" href={address.href}>
                    {tr('web.open')}
                  </a>
                ) : (
                  <Button className="primary" onClick={() => void save()}>
                    {tr('apply_768af677')}
                  </Button>
                )}
              </div>
            }
            variant="compact"
            intent="confirm"
            dirty={false}
          >
            <p>
              <a href={address.href}>{address.href}</a>
            </p>
            {error && <Notice error>{error}</Notice>}
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
