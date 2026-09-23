import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { mdiGoogle, mdiLinkVariantOff, mdiCheck, mdiClose } from '@mdi/js'
import { request, APIError } from '../api/client'
import type { components } from '../api/schema'
import { Button, Icon, Notice, DialogContent, WaitingSurface } from '../shared/ui'
import { useDraft, useUnsavedForm } from '../shared/interaction'
import { tr } from '../i18n'
import { notify } from './notifications'
import { ExternalGrants } from './external-grants'

type GoogleSettings = components['schemas']['ExternalGoogleSettings']
type Connection = components['schemas']['ExternalConnection']
const errorText = (error: unknown) => tr(error instanceof Error ? error.message : 'external.unavailable')

export function ExternalSettings() {
  const q = useQueryClient()
  const data = useQuery({
    queryKey: ['external-settings'],
    queryFn: () => request<GoogleSettings>('external/settings/google'),
  })
  const id = useDraft(data.data?.clientId ?? '')
  const enabled = useDraft(data.data?.enabled ?? false)
  const [secret, setSecret] = useState('')
  useUnsavedForm(!!secret, () => setSecret(''))
  const save = useMutation({
    mutationFn: () =>
      request<GoogleSettings>('external/settings/google', 'PUT', {
        clientId: id.draft.trim(),
        clientSecret: secret,
        enabled: enabled.draft,
      }),
    onSuccess: (value) => {
      setSecret('')
      id.reset(value.clientId)
      enabled.reset(value.enabled)
      q.setQueryData(['external-settings'], value)
      void q.invalidateQueries({ queryKey: ['external-providers'] })
      notify(tr('external.saved'))
    },
  })
  return (
    <WaitingSurface busy={save.isPending} className="general-settings">
      <section className="surface">
        <div className="page-heading">
          <h2>{tr('external.title')}</h2>
        </div>
        <p className="muted">{tr('external.settingsHelp')}</p>
        <h3 className="external-provider-heading">
          <Icon path={mdiGoogle} /> Google
        </h3>
        {data.error && <Notice error>{errorText(data.error)}</Notice>}
        {save.error && <Notice error>{errorText(save.error)}</Notice>}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate()
          }}
          className="external-settings-form"
        >
          <label className="field">
            {tr('external.clientId')}
            <input
              value={id.draft}
              onChange={(e) => id.setDraft(e.target.value)}
              autoComplete="off"
              required
              maxLength={256}
            />
          </label>
          <label className="field">
            {tr('external.clientSecret')}
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="new-password"
              required={!data.data?.secretConfigured || id.draft !== data.data.clientId}
              placeholder={data.data?.secretConfigured && id.draft === data.data.clientId ? '••••••••' : ''}
              title={data.data?.secretConfigured ? tr('external.keepSecret') : undefined}
              maxLength={4096}
            />
          </label>
          <label className="field">
            {tr('external.redirect')}
            <input readOnly value={data.data?.redirectUri ?? ''} onFocus={(e) => e.target.select()} />
          </label>
          <p className="muted small">
            {tr('external.setupHelp')}{' '}
            <a href="https://panasms.github.io/docs/setup/google/" target="_blank" rel="noopener noreferrer">
              {tr('external.setupGuide')}
            </a>
            {' · '}
            <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener noreferrer">
              Google Cloud Console
            </a>
          </p>
          <label className="external-toggle">
            <input
              type="checkbox"
              checked={enabled.draft}
              onChange={(e) => enabled.setDraft(e.target.checked)}
            />
            {tr('external.enable')}
          </label>
          <p className="muted small">{tr('external.scopeHelp')}</p>
          <div className="actions">
            <Button title={tr('external.apply')} disabled={save.isPending || !data.data}>
              <Icon path={mdiCheck} />
            </Button>
          </div>
        </form>
      </section>
    </WaitingSurface>
  )
}

export type GrantRequest = {
  connectionId: string
  consumer: string
  capability: 'google-drive' | 'google-drive-readonly'
}
export function GoogleConnect({
  link = false,
  grant,
  onComplete,
}: {
  link?: boolean
  grant?: GrantRequest
  onComplete?: (grantId?: string) => void
}) {
  link = link || !!grant
  const queryClient = useQueryClient()
  const provider = useQuery({
    queryKey: ['external-providers'],
    queryFn: () => request<{ google: { enabled: boolean } }>('external/providers'),
    retry: false,
  })
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [authorizeURL, setAuthorizeURL] = useState('')
  const [error, setError] = useState('')
  const [waiting, setWaiting] = useState(false)
  const start = useMutation({
    mutationFn: () =>
      request<{ url: string }>('external/google/start', 'POST', {
        purpose: grant ? 'grant' : link ? 'link' : 'login',
        ...grant,
        password: link ? password : '',
      }),
    onSuccess: (value) => {
      setPassword('')
      setError('')
      setAuthorizeURL(value.url)
      setWaiting(true)
      window.open(value.url, '_blank', 'noopener,noreferrer')
    },
    onError: (e) => setError(errorText(e)),
  })
  useEffect(() => {
    if (!open || !waiting) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const result = await request<{ status: string; grantId?: string }>('external/google/poll', 'POST', {})
        if (disposed) return
        if (result.status === 'linked' || result.status === 'authenticated' || result.status === 'granted') {
          setWaiting(false)
          setOpen(false)
          setAuthorizeURL('')
          if (link) {
            notify(tr(result.status === 'granted' ? 'external.granted' : 'external.linked'))
            void queryClient.invalidateQueries({ queryKey: ['external-grants'] })
            onComplete?.(result.grantId)
          } else window.location.assign('/')
          return
        }
        setError('')
      } catch (e) {
        if (disposed) return
        setError(errorText(e))
        if (!(e instanceof APIError) || ![0, 408, 503].includes(e.status)) {
          setWaiting(false)
          setAuthorizeURL('')
          return
        }
      }
      timer = setTimeout(poll, 4000)
    }
    timer = setTimeout(poll, 3000)
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [open, waiting, link, onComplete, queryClient])
  function close() {
    setOpen(false)
    setWaiting(false)
    setPassword('')
    setAuthorizeURL('')
    setError('')
    void request('external/google/cancel', 'POST', {}).catch(() => {})
  }
  if (!provider.data?.google.enabled)
    return link ? <p className="muted">{tr('external.notConfigured')}</p> : null
  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setOpen(true)
          if (!link) start.mutate()
        }}
      >
        <Icon path={mdiGoogle} />
        {tr(grant ? 'external.allowDrive' : link ? 'external.linkGoogle' : 'external.signIn')}
      </Button>
      <Dialog.Root
        open={open}
        onOpenChange={(value) => {
          if (!value) close()
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent
            className="settings-dialog power-dialog"
            busy={start.isPending}
            header={
              <>
                {' '}
                <div className="dialog-heading">
                  <Dialog.Title>
                    {tr(grant ? 'external.allowDrive' : link ? 'external.linkGoogle' : 'external.signIn')}
                  </Dialog.Title>
                </div>
                <Dialog.Description>
                  {tr(
                    grant
                      ? grant.capability === 'google-drive-readonly'
                        ? 'external.driveReadHelp'
                        : 'external.driveHelp'
                      : link
                        ? 'external.linkHelp'
                        : 'external.loginHelp',
                    { consumer: grant?.consumer },
                  )}
                </Dialog.Description>{' '}
              </>
            }
            footer={
              <div className="actions">
                <Button type="button" onClick={close} data-dialog-cancel>
                  {tr('external.cancel')}
                </Button>
                {!waiting && (
                  <Button
                    type="button"
                    disabled={start.isPending || (link && !password)}
                    onClick={() => start.mutate()}
                  >
                    {tr('external.continue')}
                  </Button>
                )}
              </div>
            }
            variant="form"
            intent="edit"
          >
            {error && <Notice error>{error}</Notice>}
            {link && !waiting && (
              <label className="field">
                {tr('external.currentPassword')}
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            {waiting && (
              <div className="external-oauth-wait">
                <span className="waiting-spinner" aria-hidden="true" />
                <p role="status">{tr('external.waiting')}</p>
              </div>
            )}
            {authorizeURL && (
              <a className="button" href={authorizeURL} target="_blank" rel="noopener noreferrer">
                {tr('external.openGoogle')}
              </a>
            )}
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

export function LinkedAccounts() {
  const q = useQueryClient()
  const data = useQuery({
    queryKey: ['external-connections'],
    queryFn: () => request<Connection[]>('external/connections'),
  })
  const [selected, setSelected] = useState<Connection | null>(null)
  const [password, setPassword] = useState('')
  const remove = useMutation({
    mutationFn: () => request('external/connections', 'DELETE', { id: selected?.id, password }),
    onSuccess: () => {
      q.clear()
      window.location.assign('/')
    },
  })
  return (
    <section className="surface">
      <h2>{tr('external.accounts')}</h2>
      <p className="muted">{tr('external.accountsHelp')}</p>
      {data.error && <Notice error>{errorText(data.error)}</Notice>}
      <div className="external-accounts">
        {data.data?.map((connection) => (
          <div className="external-account" key={connection.id}>
            <Icon path={mdiGoogle} />
            <div>
              <strong>{connection.name || connection.email}</strong>
              <span className="muted">{connection.email}</span>
            </div>
            <Button
              title={tr('external.unlink')}
              onClick={() => {
                setSelected(connection)
                setPassword('')
                remove.reset()
              }}
            >
              <Icon path={mdiLinkVariantOff} />
            </Button>
          </div>
        ))}
      </div>
      {data.data?.length === 0 && <p className="muted">{tr('external.empty')}</p>}
      <GoogleConnect
        link
        onComplete={() => {
          void q.invalidateQueries({ queryKey: ['external-connections'] })
        }}
      />
      <ExternalGrants connections={data.data ?? []} />
      <Dialog.Root
        open={!!selected}
        onOpenChange={(value) => {
          if (!value && !remove.isPending) {
            setSelected(null)
            setPassword('')
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent
            className="settings-dialog power-dialog"
            busy={remove.isPending}
            header={
              <>
                {' '}
                <Dialog.Title>{tr('external.unlink')}</Dialog.Title>
                <Dialog.Description>{tr('external.unlinkHelp')}</Dialog.Description>{' '}
              </>
            }
            footer={
              <div className="actions">
                <Button
                  onClick={() => {
                    setSelected(null)
                    setPassword('')
                  }}
                  data-dialog-cancel
                >
                  {tr('external.cancel')}
                </Button>
                <Button disabled={!password || remove.isPending} onClick={() => remove.mutate()}>
                  {tr('external.unlink')}
                </Button>
              </div>
            }
            variant="compact"
            intent="confirm"
            dirty={false}
          >
            <strong>{selected?.email}</strong>
            <label className="field">
              {tr('external.currentPassword')}
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {remove.error && <Notice error>{errorText(remove.error)}</Notice>}
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
