import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { mdiSendOutline, mdiDeleteOutline, mdiRefresh, mdiLinkVariant, mdiLinkVariantOff } from '@mdi/js'
import { request } from '../api/client'
import { Button, Icon, Notice, WaitingSurface } from '../shared/ui'
import { MultiSelect } from '../shared/multi-select'
import { useDraft } from '../shared/interaction'
import { tr, locale } from '../i18n'
import { notify } from './notifications'

import type { components } from '../api/schema'
type Config = components['schemas']['NotificationConfig']
type Settings = components['schemas']['NotificationSettings']
type Preferences = components['schemas']['NotificationPreferences']
type Profile = components['schemas']['NotificationProfile']
const levels = ['info', 'warning', 'error', 'critical'] as const
const defaults: Preferences = { enabled: false, email: '', chatId: '', routes: { info: [], warning: ['push'], error: ['email'], critical: ['telegram'] } }
const empty: Config = { smtp: { host: '', port: 587, security: 'starttls', username: '', from: '', enabled: false }, telegramEnabled: false, contact: '' }
const errorText = (e: unknown) => tr(e instanceof Error ? e.message : 'delivery.unavailable')

export function NotificationSettings() {
  const q = useQueryClient()
  const data = useQuery({ queryKey: ['notification-settings'], queryFn: () => request<Settings>('notification-settings') })
  const { draft, setDraft, reset, dirty } = useDraft(data.data?.config ?? empty)
  const [testEmail, setTestEmail] = useState('')
  const smtpTest = useMutation({ mutationFn: () => request('notification-smtp-test', 'POST', { email: testEmail.trim() }), onSuccess: () => notify(tr('delivery.smtpAccepted')) })
  const smtp = <K extends keyof Config['smtp'],>(key: K, value: Config['smtp'][K]) => setDraft({ ...draft, smtp: { ...draft.smtp, [key]: value } })
  const save = useMutation({ mutationFn: () => request<Settings>('notification-settings', 'PUT', draft), onSuccess: value => { reset(value.config); q.setQueryData(['notification-settings'], value); void q.invalidateQueries({ queryKey: ['notification-profile'] }); notify(tr('delivery.saved')) } })
  return <WaitingSurface busy={save.isPending || smtpTest.isPending} className="general-settings"><section className="surface">
    <h2>{tr('delivery.title')}</h2><p className="muted">{tr('delivery.adminHelp')}</p>
    {data.error && <Notice error>{errorText(data.error)}</Notice>}{save.error && <Notice error>{errorText(save.error)}</Notice>}
    {!data.data && !data.error && <Notice>{tr('delivery.loading')}</Notice>}
    <form className="external-settings-form" onSubmit={e => { e.preventDefault(); save.mutate() }}>
      <fieldset disabled={!data.data || save.isPending || smtpTest.isPending} className="delivery-fields">
      <h3>SMTP</h3>
      <label className="external-toggle"><input type="checkbox" checked={draft.smtp.enabled} onChange={e => smtp('enabled', e.target.checked)} />{tr('delivery.enableSMTP')}</label>
      <div className="delivery-pair"><label className="field">{tr('delivery.host')}<input value={draft.smtp.host} onChange={e => smtp('host', e.target.value)} required={draft.smtp.enabled} autoComplete="off" /></label>
      <label className="field">{tr('delivery.port')}<input inputMode="numeric" value={draft.smtp.port || ''} onChange={e => { if (/^\d*$/.test(e.target.value)) smtp('port', Number(e.target.value)) }} required={draft.smtp.enabled} /></label></div>
      <label className="field">{tr('delivery.security')}<select value={draft.smtp.security} onChange={e => smtp('security', e.target.value as 'tls' | 'starttls')}><option value="starttls">STARTTLS</option><option value="tls">TLS</option></select></label>
      <label className="field">{tr('delivery.from')}<input type="email" value={draft.smtp.from} onChange={e => smtp('from', e.target.value)} required={draft.smtp.enabled} /></label>
      <label className="field">{tr('delivery.username')}<input value={draft.smtp.username} autoComplete="off" onChange={e => smtp('username', e.target.value)} /></label>
      <label className="field">{tr('delivery.password')}<input type="password" autoComplete="new-password" value={draft.smtp.password ?? ''} placeholder={data.data?.passwordConfigured ? '••••••••' : ''} onChange={e => smtp('password', e.target.value)} /></label>
      <div className="delivery-test"><label className="field">{tr('delivery.testRecipient')}<input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} autoComplete="email" /></label><Button type="button" title={tr('delivery.testEmail')} disabled={dirty || !data.data?.config.smtp.enabled || !testEmail.trim() || smtpTest.isPending} onClick={e => { const form = e.currentTarget.closest('form'); if (form?.reportValidity()) smtpTest.mutate() }}><Icon path={mdiSendOutline} /></Button></div>
      <p className="muted small">{tr('delivery.smtpTestHelp')}</p>
      {smtpTest.error && <Notice error>{errorText(smtpTest.error)}</Notice>}
      <h3>Telegram</h3><p className="muted small">{tr('delivery.botHelp')}</p>
      <label className="external-toggle"><input type="checkbox" checked={draft.telegramEnabled} onChange={e => setDraft({ ...draft, telegramEnabled: e.target.checked })} />{tr('delivery.enableTelegram')}</label>
      <label className="field">{tr('delivery.token')}<input type="password" autoComplete="new-password" value={draft.telegramToken ?? ''} placeholder={data.data?.tokenConfigured ? '••••••••' : ''} onChange={e => setDraft({ ...draft, telegramToken: e.target.value })} /></label>
      <TelegramConnection />
      <h3>{tr('delivery.push')}</h3><p className="muted small">{tr('delivery.https')}</p>
      <label className="field">{tr('delivery.contact')}<input type="email" value={draft.contact} onChange={e => setDraft({ ...draft, contact: e.target.value })} /></label>
      <p className="muted small">{tr('delivery.secretsHelp')}</p>
      <div className="actions"><Button type="submit" className="primary" disabled={!dirty}>{tr('apply_768af677')}</Button></div>
      </fieldset>
    </form>
    <a href="/profile/notifications">{tr('delivery.personalLink')}</a>
  </section></WaitingSurface>
}

export function NotificationPreferences() {
  const q = useQueryClient()
  const data = useQuery({ queryKey: ['notification-profile'], queryFn: () => request<Profile>('notification-profile'), refetchInterval: 15000 })
  const { draft, setDraft, reset, dirty } = useDraft(data.data?.preferences ?? defaults)
  const [pushError, setPushError] = useState('')
  const refresh = () => q.invalidateQueries({ queryKey: ['notification-profile'] })
  const save = useMutation({ mutationFn: () => request<Profile>('notification-profile', 'PUT', draft), onSuccess: value => { reset(value.preferences); q.setQueryData(['notification-profile'], value); notify(tr('delivery.saved')) } })
  const test = useMutation({ mutationFn: (channel: string) => channel === 'telegram' ? request('notification-telegram-test', 'POST') : request('notification-test', 'POST', { channel }), onSuccess: () => { void refresh(); notify(tr('delivery.testQueued')) } })
  const retry = useMutation({ mutationFn: (id: number) => request('notification-retry', 'POST', { id }), onSuccess: () => { void refresh(); notify(tr('delivery.testQueued')) } })
  const remove = useMutation({ mutationFn: (id: string) => request('notification-push', 'DELETE', { id }), onSuccess: () => { void refresh(); notify(tr('delivery.removed')) } })
  const push = useMutation({ mutationFn: async () => {
    setPushError('')
    if (await Notification.requestPermission() !== 'granted') throw Error('delivery.pushDenied')
    const registration = await navigator.serviceWorker.register('/notification-sw.js', { scope: '/' })
    await navigator.serviceWorker.ready
    const key = Uint8Array.from(atob(data.data!.publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
    const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    const raw = subscription.toJSON()
    return request('notification-push', 'POST', { endpoint: raw.endpoint, keys: raw.keys })
  }, onSuccess: () => { void refresh(); notify(tr('delivery.pushEnabled')) }, onError: e => setPushError(errorText(e)) })
  const supported = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  return <WaitingSurface busy={save.isPending || push.isPending || remove.isPending} className="general-settings"><section className="surface">
    <h2>{tr('delivery.title')}</h2><p className="muted">{tr('delivery.personalHelp')}</p>
    {data.error && <Notice error>{errorText(data.error)}</Notice>}{save.error && <Notice error>{errorText(save.error)}</Notice>}
    {!data.data && !data.error && <Notice>{tr('delivery.loading')}</Notice>}
    <form className="external-settings-form" onSubmit={e => { e.preventDefault(); save.mutate() }}>
      <fieldset className="delivery-fields" disabled={!data.data || save.isPending}>
      <label className="external-toggle"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />{tr('delivery.enable')}</label>
      <label className="field">{tr('delivery.email')}<input type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} /></label>
      <h3>{tr('delivery.routing')}</h3><p className="muted small">{tr('delivery.routingHelp')}</p>
      {levels.map(level => <div className="delivery-route-select" key={level}>
        <MultiSelect label={tr('delivery.' + level)} values={draft.routes[level]} searchable={false} showSummary={false} placeholder={tr('delivery.panel')}
          options={(['push', 'email', 'telegram'] as const).map(channel => ({id: channel, label: tr('delivery.' + channel), description: !data.data?.available[channel] ? tr('delivery.notReady') : undefined}))}
          onChange={values => setDraft({ ...draft, routes: { ...draft.routes, [level]: values as Preferences['routes'][typeof level] } })} />
        <p className="muted small">{tr('delivery.' + level + 'Help')}</p>
      </div>)}
      <div className="actions"><Button type="submit" className="primary" disabled={!dirty}>{tr('apply_768af677')}</Button></div>
      </fieldset>
    </form>
  </section><section className="surface"><TelegramConnection /></section><section className="surface">
    <h3>{tr('delivery.push')}</h3><p className="muted small">{tr('delivery.deviceHelp')}</p>
    {!supported && <Notice>{tr('delivery.https')}</Notice>}
    {pushError && <Notice error>{pushError}</Notice>}{remove.error && <Notice error>{errorText(remove.error)}</Notice>}
    <Button onClick={() => push.mutate()} disabled={!supported || !data.data?.available.push || push.isPending}>{tr('delivery.enableBrowser')}</Button>
    {!data.data?.available.push && <p className="muted small">{tr('delivery.configurePush')}</p>}
    {data.data?.devices.map((id, i) => <div className="delivery-device" key={id}><span>{tr('delivery.device')} {i + 1} · {id.slice(0, 8)}</span><Button title={tr('delivery.removeDevice')} onClick={() => remove.mutate(id)}><Icon path={mdiDeleteOutline} /></Button></div>)}
  </section><section className="surface">
    <h3>{tr('delivery.history')}</h3><p className="muted small">{tr('delivery.testHelp')}</p>
    <div className="actions">{(['email', 'telegram', 'push'] as const).map(c => <Button key={c} title={tr('delivery.test') + ': ' + tr('delivery.' + c)} disabled={!data.data?.preferences.enabled || !data.data.available[c] || dirty || test.isPending} onClick={() => test.mutate(c)}><Icon path={mdiSendOutline} />{tr('delivery.' + c)}</Button>)}</div>
    {test.error && <Notice error>{errorText(test.error)}</Notice>}{retry.error && <Notice error>{errorText(retry.error)}</Notice>}
    <div className="table-scroll"><table><thead><tr><th>{tr('delivery.time')}</th><th>{tr('delivery.channel')}</th><th>{tr('delivery.status')}</th><th aria-label={tr('delivery.retry')} /></tr></thead><tbody>{data.data?.history.map(d => <tr key={d.id}><td>{new Date(d.created * 1000).toLocaleString(locale())}</td><td>{tr('delivery.' + d.channel)}</td><td>{tr('delivery.' + d.status)}{d.error && <div className="muted small">{tr(d.error)}</div>}</td><td>{d.status === 'failed' && <Button title={tr('delivery.retry')} disabled={retry.isPending} onClick={() => retry.mutate(d.id)}><Icon path={mdiRefresh} /></Button>}</td></tr>)}</tbody></table></div>
    {data.data?.history.length === 0 && <p className="muted">{tr('delivery.empty')}</p>}
  </section></WaitingSurface>
}

function TelegramConnection() {
  const q = useQueryClient()
  const data = useQuery({queryKey: ['telegram-link'], queryFn: () => request<{linked: boolean; name: string; enabled: boolean; pending: {ready: boolean; name: string; expires: number}}>('notification-telegram-link'), refetchInterval: 3000})
  const [code, setCode] = useState('')
  const refresh = () => q.invalidateQueries({queryKey: ['telegram-link']})
  const action = useMutation({mutationFn: (value: 'start' | 'confirm' | 'unlink') => value === 'unlink' ? request<{code?: string}>('notification-telegram-link', 'DELETE') : request<{code?: string}>('notification-telegram-link', 'POST', {action: value}), onSuccess: (value) => { setCode(value?.code ?? ''); void refresh() }})
  const test = useMutation({mutationFn: () => request('notification-telegram-test', 'POST'), onSuccess: () => notify(tr('delivery.telegramAccepted'))})
  return <WaitingSurface busy={action.isPending || test.isPending}>
    <div className="actions"><span>{data.data?.linked ? data.data.name : tr('delivery.telegramUnlinked')}</span>
      {data.data?.linked ? <><Button type="button" title={tr('delivery.testTelegram')} disabled={!data.data.enabled} onClick={() => test.mutate()}><Icon path={mdiSendOutline}/></Button><Button type="button" title={tr('delivery.unlinkTelegram')} onClick={() => action.mutate('unlink')}><Icon path={mdiLinkVariantOff}/></Button></> : <Button type="button" disabled={!data.data?.enabled} onClick={() => action.mutate('start')}><Icon path={mdiLinkVariant}/>{tr('delivery.linkTelegram')}</Button>}
    </div>
    {!data.data?.enabled && <p className="muted small">{tr('delivery.enableBotFirst')}</p>}
    {code && !data.data?.pending.ready && <p>{tr('delivery.linkInstructions')} <code className="telegram-link-code">/link {code}</code></p>}
    {data.data?.pending.ready && <div><p>{tr('delivery.confirmTelegram')} <strong>{data.data.pending.name}</strong></p><div className="actions"><Button type="button" onClick={() => action.mutate('confirm')}>{tr('delivery.confirmLink')}</Button><Button type="button" onClick={() => action.mutate('unlink')}>{tr('delivery.cancelLink')}</Button></div></div>}
    {(action.error || test.error || data.error) && <Notice error>{errorText(action.error || test.error || data.error)}</Notice>}
  </WaitingSurface>
}
