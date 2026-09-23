import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { mdiSourceRepository, mdiPlus, mdiDeleteOutline, mdiClose } from '@mdi/js'
import { tr } from '../i18n'
import { Button, Icon, Notice, DialogContent } from '../shared/ui'
import { managed, type Job } from './operations'
import { waitForJob } from '../shared/job-completion'
import { newID } from './desktop-layout'

type Source = { id: string; url: string; official: boolean; fingerprint?: string; signers: string[] }
type Plan = {
  target: string
  details: string[]
  fingerprint: string
  confirmation: string
  publisherFingerprint?: string
}
export function ModuleSources() {
  const [open, setOpen] = useState(false)
  const [url, setURL] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [review, setReview] = useState<{ action: string; params: Record<string, string>; plan: Plan } | null>(
    null,
  )
  const query = useQueryClient()
  const data = useQuery({
    queryKey: ['module-sources'],
    queryFn: () => managed<{ sources: Source[] }>('module-sources'),
    enabled: open,
  })
  async function prepare(action: string, params: Record<string, string>) {
    setBusy(true)
    setError('')
    try {
      const plan = await managed<Plan>('plan', { action, params })
      if (plan.publisherFingerprint) params = { ...params, keyFingerprint: plan.publisherFingerprint }
      setReview({ action, params, plan })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function apply() {
    if (!review) return
    setBusy(true)
    setError('')
    try {
      const { action, params, plan } = review
      const job = await managed<{ id: string }>('run', {
        id: newID(),
        action,
        params,
        fingerprint: plan.fingerprint,
        confirmation: plan.confirmation,
      })
      await waitForJob(async () => (await managed<Job[]>('jobs')).find((item) => item.id === job.id))
      setReview(null)
      setURL('')
      await query.invalidateQueries({ queryKey: ['module-sources'] })
      await query.invalidateQueries({ queryKey: ['module-catalog'] })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value)
          setReview(null)
          setError('')
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button title={tr('repos.title')}>
          <Icon path={mdiSourceRepository} />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <DialogContent
          className="settings-dialog"
          busy={busy}
          dirty={!!url}
          header={
            <>
              {' '}
              <div className="dialog-heading">
                <Dialog.Title>{tr('repos.title')}</Dialog.Title>
              </div>
              <Dialog.Description>
                {tr(
                  review
                    ? review.action === 'module.source-add'
                      ? 'repos.trust'
                      : 'repos.removeHint'
                    : 'repos.description',
                )}
              </Dialog.Description>{' '}
            </>
          }
          footer={
            <div className="actions">
              {review ? (
                <>
                  <Button onClick={() => setReview(null)}>{tr('cancel_0ec753be')}</Button>
                  <Button className="primary" onClick={() => void apply()}>
                    {tr('homes.confirmButton')}
                  </Button>
                </>
              ) : (
                <Dialog.Close asChild>
                  <Button data-dialog-cancel>{tr('close_4ae50d30')}</Button>
                </Dialog.Close>
              )}
            </div>
          }
          variant="form"
          intent="edit"
        >
          {error && <Notice error>{error}</Notice>}
          {data.error && <Notice error>{data.error.message}</Notice>}
          {review ? (
            <div className="repository-review">
              {review.plan.details.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : (
            <>
              {data.data?.sources.map((source) => (
                <div className="repository-row" key={source.id}>
                  <div>
                    <strong>{source.official ? tr('repos.official') : source.id}</strong>
                    <small>{source.url}</small>
                  </div>
                  <Button
                    title={tr('repos.remove')}
                    onClick={() => void prepare('module.source-remove', { target: source.id })}
                  >
                    <Icon path={mdiDeleteOutline} />
                  </Button>
                </div>
              ))}
              {data.data?.sources.length === 0 && <p className="muted">{tr('repos.empty')}</p>}
              <form
                className="repository-add"
                onSubmit={(event) => {
                  event.preventDefault()
                  void prepare('module.source-add', { url })
                }}
              >
                <label className="field">
                  {tr('repos.url')}
                  <input
                    type="url"
                    required
                    placeholder="https://example.org/modules/"
                    value={url}
                    onChange={(event) => setURL(event.target.value)}
                  />
                </label>
                <Button type="submit" title={tr('repos.add')} disabled={!url.trim()}>
                  <Icon path={mdiPlus} />
                </Button>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
