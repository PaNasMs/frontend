import type { components } from '../api/schema'
import { FolderField } from '../shared/folder-picker'
import { WaitingSurface } from '../shared/ui'
import { DialogContent } from '../shared/ui'
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { mdiFolderMoveOutline, mdiRestore } from '@mdi/js'
import { request, type Identity } from '../api/client'
import { tr } from '../i18n'
import { Button, Icon, Notice } from '../shared/ui'
import { managed, type Job } from './operations'
import { newID } from './dashboard'

type Homes = components['schemas']['HomeLocations']
type Blocker = {
  title: string
  kind: string
  user: string
  unit: string
  reason: string
  processes: { name: string; pid: number }[]
}
type Plan = { details: string[]; fingerprint: string; confirmation: string }
export function HomeSettings() {
  const session = useQuery({ queryKey: ['session'], queryFn: () => request<Identity>('session') })
  const admin = session.data?.role === 'admin'
  const q = useQueryClient()
  const data = useQuery({
    queryKey: ['homes'],
    queryFn: () => managed<Homes>('homes'),
    enabled: admin,
    refetchInterval: (query) => (query.state.data?.recovery ? 2000 : false),
  })
  const [destination, setDestination] = useState('')
  useEffect(() => {
    if (data.data?.path) setDestination(data.data.path)
  }, [data.data?.path])
  const [review, setReview] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [jobID, setJobID] = useState('')
  const jobs = useQuery({
    queryKey: ['jobs'],
    queryFn: () => managed<Job[]>('jobs'),
    enabled: admin,
    refetchInterval: 2000,
  })
  const job = jobs.data?.find((j) => j.id === jobID)
  const running = jobs.data?.some(
    (j) => ['homes.move', 'homes.recover'].includes(j.action) && ['queued', 'running'].includes(j.status),
  )
  useEffect(() => {
    if (!job || ['queued', 'running'].includes(job.status)) return
    void q.invalidateQueries({ queryKey: ['homes'] })
    void q.invalidateQueries({ queryKey: ['users'] })
    void q.invalidateQueries({ queryKey: ['files'] })
    void q.invalidateQueries({ queryKey: ['file-places'] })
  }, [job?.status, q])
  async function prepare() {
    setBusy(true)
    setError('')
    setJobID('')
    setBlockers([])
    setReview(null)
    try {
      const result = await managed<Plan | { blockers: Blocker[] }>('homes-check', undefined, destination)
      if ('blockers' in result) {
        setBlockers(result.blockers)
        setError(tr('homes.busyDescription'))
      } else setReview(result)
    } catch (e) {
      setReview(null)
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function run(recover = false) {
    setBusy(true)
    setError('')
    setBlockers([])
    try {
      const action = recover ? 'homes.recover' : 'homes.move'
      const params = recover ? {} : { destination }
      const plan = recover ? await managed<Plan>('plan', { action, params }) : review!
      const result = await managed<{ id: string }>('run', {
        id: newID(),
        action,
        params,
        fingerprint: plan.fingerprint,
        confirmation: plan.confirmation,
      })
      setJobID(result.id)
      setReview(null)
      await q.invalidateQueries({ queryKey: ['jobs'] })
    } catch (e) {
      setReview(null)
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  if (!admin) return <Notice>{tr('homes.admin')}</Notice>
  return (
    <WaitingSurface busy={busy && !review}>
      <h2>{tr('homes.title')}</h2>
      <p className="muted">{tr('homes.description')}</p>
      {data.error && <Notice error>{data.error.message}</Notice>}
      {data.data && (
        <>
          {data.data.recovery && !running && !jobs.isPending ? (
            <Notice error>
              {tr('homes.recovery')}{' '}
              <Button
                disabled={busy || running}
                title={tr('homes.recover')}
                aria-label={tr('homes.recover')}
                onClick={() => void run(true)}
              >
                <Icon path={mdiRestore} />
              </Button>
            </Notice>
          ) : (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void prepare()
                }}
              >
                <FolderField
                  label={tr('homes.destination')}
                  value={destination}
                  policy="home"
                  newFolder
                  disabled={busy || running}
                  onChange={(value) => {
                    setDestination(value)
                    setReview(null)
                  }}
                />
                <Button
                  disabled={busy || running || !destination || destination === data.data.path}
                  title={tr('homes.move')}
                  aria-label={tr('homes.move')}
                >
                  <Icon path={mdiFolderMoveOutline} />
                </Button>
              </form>
            </>
          )}
        </>
      )}
      {running && <Notice>{tr('homes.running')}</Notice>}
      {job?.status === 'succeeded' && <Notice>{tr('homes.done')}</Notice>}
      {job && ['failed', 'interrupted', 'cancelled'].includes(job.status) && (
        <Notice error>{String(job.result?.error || tr('homes.failed'))}</Notice>
      )}
      <Dialog.Root
        open={!!review || !!error}
        onOpenChange={(v) => {
          if (!v && !busy) {
            setReview(null)
            setError('')
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent
            busy={busy}
            className="settings-dialog"
            header={
              <>
                {' '}
                <Dialog.Title>{tr(error ? 'homes.blocked' : 'homes.move')}</Dialog.Title>
                <Dialog.Description>{error || tr('homes.confirm')}</Dialog.Description>{' '}
              </>
            }
            footer={
              <div className="actions">
                <Dialog.Close asChild>
                  <Button disabled={busy} data-dialog-cancel>
                    {tr(error ? 'homes.close' : 'homes.cancel')}
                  </Button>
                </Dialog.Close>
                {!error && (
                  <Button disabled={busy} onClick={() => void run()}>
                    {tr('homes.confirmButton')}
                  </Button>
                )}
              </div>
            }
            variant="form"
            intent="confirm"
            dirty={false}
          >
            {error && blockers.length > 0 && (
              <ul className="home-blockers">
                {blockers.map((item, index) => (
                  <li key={index}>
                    <strong>
                      {['cloudSync', 'terminal', 'files', 'ssh', 'session'].includes(item.kind)
                        ? tr('homes.app.' + item.kind)
                        : item.title}
                    </strong>
                    <p>{tr('homes.blockerUser', { user: item.user })}</p>
                    <p>{tr('homes.reason.' + item.reason)}</p>
                    <details>
                      <summary>{tr('homes.technical')}</summary>
                      {item.unit && <p>{item.unit}</p>}
                      <ul>
                        {item.processes.map((process) => (
                          <li key={process.pid}>
                            {process.name} · PID {process.pid}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            )}

            {!error && review && (
              <>
                <p>
                  <strong>{review.details[0]}</strong>
                </p>
                <h3>{tr('homes.affected')}</h3>
                {review.details.length > 1 ? (
                  <ul>
                    {review.details.slice(1).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{tr('homes.noUsers')}</p>
                )}
              </>
            )}
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </WaitingSurface>
  )
}
