import { DialogContent } from '../shared/ui'
import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { mdiPower, mdiRestart } from '@mdi/js'
import { tr } from '../i18n'
import { Button, Icon, Notice } from '../shared/ui'
import { managed, type Job } from './operations'
import { newID } from './dashboard'
import { waitForJob } from '../shared/job-completion'

export function PowerMenu() {
  const [action, setAction] = useState<'poweroff' | 'reboot' | null>(null)
  const [busy, setBusy] = useState(false)
  const [scheduled, setScheduled] = useState(false)
  const [error, setError] = useState('')
  async function run() {
    setBusy(true)
    setError('')
    try {
      const params = { target: 'NAS' }
      const operation = 'system.' + action
      const plan = await managed<{ fingerprint: string; confirmation: string }>('plan', {
        action: operation,
        params,
      })
      const job = await managed<{ id: string }>('run', {
        id: newID(),
        action: operation,
        params,
        fingerprint: plan.fingerprint,
        confirmation: plan.confirmation,
      })
      await waitForJob(async () => (await managed<Job[]>('jobs')).find((item) => item.id === job.id))
      setScheduled(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <hr className="power-menu-divider" />
      {(['poweroff', 'reboot'] as const).map((item) => (
        <button
          key={item}
          onClick={() => {
            setError('')
            setScheduled(false)
            setAction(item)
          }}
        >
          <Icon path={item === 'poweroff' ? mdiPower : mdiRestart} size={18} />
          {tr('power.' + item)}
        </button>
      ))}
      <Dialog.Root
        open={!!action}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent
            busy={busy}
            className="settings-dialog power-dialog"
            header={
              <>
                {' '}
                <Dialog.Title>{tr('power.' + action)}</Dialog.Title>
                <Dialog.Description>
                  {tr(scheduled ? 'power.scheduled.' + action : 'power.confirm.' + action)}
                </Dialog.Description>{' '}
              </>
            }
            footer={
              <div className="actions">
                <Dialog.Close asChild>
                  <Button disabled={busy} data-dialog-cancel>
                    {tr(scheduled ? 'homes.close' : 'homes.cancel')}
                  </Button>
                </Dialog.Close>
                {!scheduled && (
                  <Button disabled={busy} onClick={() => void run()}>
                    {tr('homes.confirmButton')}
                  </Button>
                )}
              </div>
            }
            variant="compact"
            intent="confirm"
            dirty={false}
          >
            {error && <Notice error>{error}</Notice>}
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
