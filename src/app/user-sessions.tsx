import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mdiCloseCircleOutline, mdiRefresh } from '@mdi/js'
import { tr, locale } from '../i18n'
import { request } from '../api/client'
import { Button, DialogContent, Icon, Notice } from '../shared/ui'
import { managed, OperationButton } from './operations'

type Session = {
  id: string
  user: string
  kind: string
  address: string
  device?: string
  created: string | number
  current?: boolean
  state?: string
}
export function UserSessions({ user }: { user: string }) {
  const q = useQueryClient()
  const [selected, setSelected] = useState<Session | null>(null)
  const panel = useQuery({
    queryKey: ['account-sessions', user, 'panel'],
    queryFn: () => request<Session[]>(`sessions?user=${encodeURIComponent(user)}`),
    refetchInterval: 10000,
  })
  const ssh = useQuery({
    queryKey: ['account-sessions', user, 'ssh'],
    queryFn: () => managed<Session[]>('account-sessions', undefined, user),
    refetchInterval: 10000,
  })
  const end = useMutation({
    mutationFn: () => request(`sessions?user=${encodeURIComponent(user)}`, 'POST', { id: selected!.id }),
    onSuccess: () => {
      if (selected?.current) {
        location.reload()
        return
      }
      setSelected(null)
      void q.invalidateQueries({ queryKey: ['account-sessions', user] })
    },
  })
  return (
    <section>
      <div className="user-section-heading">
        <h2>{tr('accounts.sessions')}</h2>
        <Button
          title={tr('refresh_c2f668e5')}
          aria-label={tr('refresh_c2f668e5')}
          onClick={() => {
            void panel.refetch()
            void ssh.refetch()
          }}
        >
          <Icon path={mdiRefresh} />
        </Button>
      </div>
      {(panel.error || ssh.error) && <Notice error>{(panel.error || ssh.error)?.message}</Notice>}
      <div className="user-session-list">
        {[...(panel.data ?? []), ...(ssh.data ?? [])].map((s) => (
          <article className="surface" key={s.kind + s.id}>
            <div>
              <strong>
                {s.kind === 'ssh' ? 'SSH' : tr('accounts.panel')}
                {s.current ? ` · ${tr('accounts.currentSession')}` : ''}
              </strong>
              <p>{s.address || tr('accounts.localSession')}</p>
              <p className="small muted">
                {s.device || s.state}
                {' · '}
                {typeof s.created === 'number'
                  ? new Date(s.created * 1000).toLocaleString(locale())
                  : s.created}
              </p>
            </div>
            {s.kind === 'ssh' ? (
              <OperationButton
                actions={['user.session.end']}
                initial={{ target: user, sessionId: s.id }}
                fields={[]}
                label={tr('accounts.endSession')}
                icon={mdiCloseCircleOutline}
                autoReview
              />
            ) : (
              <Button
                title={tr('accounts.endSession')}
                aria-label={tr('accounts.endSession')}
                onClick={() => setSelected(s)}
              >
                <Icon path={mdiCloseCircleOutline} />
              </Button>
            )}
          </article>
        ))}
      </div>
      {!panel.isPending && !ssh.isPending && !panel.data?.length && !ssh.data?.length && (
        <p className="muted">{tr('accounts.noSessions')}</p>
      )}
      <Dialog.Root
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !end.isPending) setSelected(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent
            className="dialog-content user-confirm"
            busy={end.isPending}
            header={
              <>
                {' '}
                <Dialog.Title>{tr('accounts.endSession')}</Dialog.Title>
                <Dialog.Description>{tr('accounts.confirmEnd')}</Dialog.Description>{' '}
              </>
            }
            footer={
              <div className="actions">
                <Button onClick={() => setSelected(null)} data-dialog-cancel>
                  {tr('no_f82a8219')}
                </Button>
                <Button onClick={() => end.mutate()}>{tr('yes_8d2fab2d')}</Button>
              </div>
            }
            variant="compact"
            intent="confirm"
            dirty={false}
          >
            {end.error && <Notice error>{end.error.message}</Notice>}
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
export function UserHistory({ user }: { user: string }) {
  const data = useQuery({
    queryKey: ['account-history', user],
    queryFn: () =>
      request<{ actor: string; action: string; result: string; created: string }[]>(
        `security-history?user=${encodeURIComponent(user)}`,
      ),
  })
  return (
    <section>
      <h2>{tr('accounts.history')}</h2>
      {data.error && <Notice error>{data.error.message}</Notice>}
      {data.data?.map((item, i) => (
        <div className="user-history-row" key={i}>
          <strong>{tr('accounts.audit.' + item.action, { defaultValue: item.action })}</strong>
          <span>{item.actor}</span>
          <span>{tr('accounts.audit.' + item.result, { defaultValue: item.result })}</span>
          <time>{new Date(item.created).toLocaleString(locale())}</time>
        </div>
      ))}
      {data.data?.length === 0 && <p className="muted">{tr('accounts.noHistory')}</p>}
    </section>
  )
}
