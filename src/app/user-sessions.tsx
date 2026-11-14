import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mdiCloseCircleOutline, mdiRefresh } from '@mdi/js'
import { tr, locale } from '../i18n'
import { request } from '../api/client'
import { sessionTime } from '../shared/session-time'
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
const sessionIdentity = (session: Session) =>
  `${session.device || (session.kind === 'ssh' ? 'SSH' : tr('accounts.panel'))} · ${session.address || tr('accounts.localSession')}`
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
    mutationFn: (session: Session) =>
      request(`sessions?user=${encodeURIComponent(session.user)}`, 'POST', { id: session.id }),
    onSuccess: (_, session) => {
      if (session.current) {
        location.reload()
        return
      }
      setSelected(null)
      void q.invalidateQueries({ queryKey: ['account-sessions', session.user] })
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
                {sessionTime(s.created, locale())}
              </p>
            </div>
            {s.kind === 'ssh' ? (
              <OperationButton
                actions={['user.session.end']}
                initial={{ target: user, sessionId: s.id }}
                fields={[]}
                label={tr('accounts.endSession')}
                icon={mdiCloseCircleOutline}
                context={[
                  {
                    key: 'target',
                    label: tr('accounts.session'),
                    value: `${user} · ${sessionIdentity(s)} · ${s.id}`,
                  },
                  {
                    key: 'created',
                    label: tr('accounts.sessionStarted'),
                    value: sessionTime(s.created, locale()),
                  },
                ]}
                description={tr('accounts.confirmEnd')}
                autoReview
              />
            ) : (
              <Button
                title={`${tr('accounts.endSession')} · ${sessionIdentity(s)}`}
                aria-label={`${tr('accounts.endSession')} · ${sessionIdentity(s)}`}
                onClick={() => {
                  end.reset()
                  setSelected(s)
                }}
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
                <Button onClick={() => setSelected(null)} disabled={end.isPending} data-dialog-cancel>
                  {tr('cancel_0ec753be')}
                </Button>
                <Button
                  className="danger"
                  disabled={end.isPending}
                  onClick={() => {
                    if (selected) end.mutate(selected)
                  }}
                >
                  {tr('accounts.endSession')} · {selected && sessionIdentity(selected)}
                </Button>
              </div>
            }
            variant="compact"
            intent="confirm"
            dirty={false}
          >
            {selected && (
              <>
                <p>
                  <strong>{sessionIdentity(selected)}</strong>
                </p>
                <p>
                  {selected.user} · {tr('accounts.panel')}
                </p>
                <p>
                  {tr('accounts.sessionStarted')} · {sessionTime(selected.created, locale())}
                </p>
                {selected.current && <Notice>{tr('accounts.endCurrentSession')}</Notice>}
              </>
            )}
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
