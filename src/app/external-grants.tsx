import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { mdiLinkVariantOff } from '@mdi/js'
import { request } from '../api/client'
import type { components } from '../api/schema'
import { Button, DialogContent, Icon, Notice } from '../shared/ui'
import { tr } from '../i18n'
import { notify } from './notifications'

export function ExternalGrants({
  connections,
}: {
  connections: components['schemas']['ExternalConnection'][]
}) {
  const q = useQueryClient()
  const grants = useQuery({
    queryKey: ['external-grants'],
    queryFn: () => request<components['schemas']['ExternalGrant'][]>('external/grants'),
  })
  const [selected, setSelected] = useState<components['schemas']['ExternalGrant'] | null>(null)
  const [password, setPassword] = useState('')
  const revoke = useMutation({
    mutationFn: () => request('external/grants', 'DELETE', { id: selected!.id, password }),
    onSuccess: () => {
      setSelected(null)
      setPassword('')
      void q.invalidateQueries({ queryKey: ['external-grants'] })
      notify(tr('external.revoked'))
    },
  })
  return (
    <section>
      <h3>{tr('external.permissions')}</h3>
      {grants.error && <Notice error>{grants.error.message}</Notice>}
      {grants.data?.length === 0 && <p className="muted">{tr('external.noGrants')}</p>}
      {grants.data?.map((grant) => (
        <div className="key-card" key={grant.id}>
          <div>
            <strong>{grant.consumer}</strong>
            <p>{connections.find((connection) => connection.id === grant.connectionId)?.email}</p>
            <p className="small muted">
              {grant.capability} · {tr(`external.grantStatus.${grant.status}`)}
            </p>
          </div>
          <Button
            title={tr('external.revoke')}
            onClick={() => {
              revoke.reset()
              setSelected(grant)
            }}
          >
            <Icon path={mdiLinkVariantOff} />
          </Button>
        </div>
      ))}
      <Dialog.Root
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !revoke.isPending) {
            setSelected(null)
            setPassword('')
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent className="settings-dialog power-dialog" busy={revoke.isPending}>
            <Dialog.Title>{tr('external.revoke')}</Dialog.Title>
            <Dialog.Description>
              {tr('external.revokeHelp', { consumer: selected?.consumer })}
            </Dialog.Description>
            <label className="field">
              {tr('external.currentPassword')}
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {revoke.error && <Notice error>{revoke.error.message}</Notice>}
            <div className="actions">
              <Button disabled={!password || revoke.isPending} onClick={() => revoke.mutate()}>
                {tr('external.revoke')}
              </Button>
              <Button
                onClick={() => {
                  setSelected(null)
                  setPassword('')
                }}
              >
                {tr('external.cancel')}
              </Button>
            </div>
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
