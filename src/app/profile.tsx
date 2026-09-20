import { WaitingSurface } from '../shared/ui'
import { notify } from './notifications'
import { tr, language, languageNames, languages, type Language } from '../i18n/index'
import { usePreferencesSave } from './preferences-save'
import { mdiCheck } from '@mdi/js'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request, type Preferences } from '../api/client'
import type { components } from '../api/schema'
import { Button, Icon, Notice } from '../shared/ui'
type Profile = components['schemas']['Profile']
export function ProfilePage() {
  const preferences = useQuery({
    queryKey: ['preferences'],
    queryFn: () => request<Preferences>('preferences'),
  })
  const saveLanguage = usePreferencesSave()
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('en')
  useEffect(() => {
    if (preferences.data) setSelectedLanguage(language(preferences.data.language))
  }, [preferences.data?.language])

  const q = useQueryClient()
  const data = useQuery({ queryKey: ['profile'], queryFn: () => request<Profile>('profile') })
  const [name, setName] = useState('')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [key, setKey] = useState('')
  const [keyPassword, setKeyPassword] = useState('')
  useEffect(() => {
    if (data.data) setName(data.data.name)
  }, [data.data?.name])
  const update = useMutation({
    mutationFn: (body: Record<string, string>) => request('profile', 'POST', body),
    onSuccess: (_, body) => {
      if (body.action === 'password') {
        q.clear()
        location.assign('/')
        return
      }
      notify(body.action === 'name' ? tr('name_saved_31b77838') : tr('ssh_keys_updated_88d5e6c8'))
      setKey('')
      setKeyPassword('')
      void q.invalidateQueries({ queryKey: ['profile'] })
      void q.invalidateQueries({ queryKey: ['session'] })
      void q.invalidateQueries({ queryKey: ['users'] })
    },
  })
  return (
    <WaitingSurface busy={update.isPending || saveLanguage.isPending}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{tr('your_account_0d85c326')}</span>
          <h1>{tr('my_profile_88060502')}</h1>
        </div>
      </div>
      {data.error && <Notice error>{data.error.message}</Notice>}
      {update.error && <Notice error>{update.error.message}</Notice>}
      <div className="profile-grid">
        <section className="surface">
          <h2>{tr('profile.language')}</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              saveLanguage.mutate((current) => ({ ...current, language: selectedLanguage }), {
                onSuccess: () => location.reload(),
              })
            }}
          >
            <label className="field">
              {tr('profile.language')}
              <select
                value={selectedLanguage}
                onChange={(event) => setSelectedLanguage(event.target.value as Language)}
                disabled={!preferences.data || saveLanguage.isPending}
              >
                {languages.map((value) => (
                  <option key={value} value={value} lang={value}>
                    {languageNames[value]}
                  </option>
                ))}
              </select>
            </label>
            <p className="small muted">{tr('profile.languageHelp')}</p>
            {preferences.error && <Notice error>{preferences.error.message}</Notice>}
            {saveLanguage.error && <Notice error>{saveLanguage.error.message}</Notice>}
            <Button
              type="submit"
              title={tr('profile.saveLanguage')}
              aria-label={tr('profile.saveLanguage')}
              disabled={
                !preferences.data ||
                selectedLanguage === language(preferences.data.language) ||
                saveLanguage.isPending
              }
            >
              <Icon path={mdiCheck} />
            </Button>
          </form>
        </section>
        <section className="surface">
          <h2>{tr('personal_details_5b1cf4d4')}</h2>
          {data.data && (
            <dl className="info-list">
              <dt>{tr('username_e2d97c93')}</dt>
              <dd>{data.data.username}</dd>
              <dt>{tr('role_ab51a3ac')}</dt>
              <dd>{tr('administrator_36d00fd7')}</dd>
              <dt>{tr('groups_1cb3d2d6')}</dt>
              <dd>{data.data.groups.join(', ')}</dd>
              <dt>{tr('home_folder_f76b7ba1')}</dt>
              <dd>{data.data.home}</dd>
            </dl>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              update.mutate({ action: 'name', name })
            }}
          >
            <label className="field">
              {tr('display_name_403372fc')}
              <input
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>
            <Button className="primary" disabled={!data.data || name === data.data.name || update.isPending}>
              {tr('save_name_b6c0cf28')}
            </Button>
          </form>
        </section>
        <section className="surface">
          <h2>{tr('change_password_da6a620b')}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (next !== confirm) return
              update.mutate({ action: 'password', currentPassword: current, newPassword: next })
            }}
          >
            <label className="field">
              {tr('current_password_6cadf497')}
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <label className="field">
              {tr('new_password_5e611d70')}
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="field">
              {tr('repeat_new_password_e32d8bb9')}
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            {confirm && confirm !== next && (
              <p className="error-text">{tr('passwords_do_not_match_a73dc9b1')}</p>
            )}
            <p className="small muted">{tr('this_changes_your_linux_password_you_will_need_to__e2af63b1')}</p>
            <Button className="primary" disabled={update.isPending || !current || !next || next !== confirm}>
              {tr('change_password_5e4fa6bd')}
            </Button>
          </form>
        </section>
        <section className="surface profile-keys">
          <h2>{tr('ssh_keys_95296132')}</h2>
          {data.data?.keys.length === 0 && <p className="muted">{tr('no_keys_added_eba3397b')}</p>}
          {data.data?.keys.map((k) => (
            <article className="key-card" key={k.id}>
              <div>
                <strong>{k.comment || k.type}</strong>
                <div className="mono small">{k.fingerprint}</div>
              </div>
              <Button
                disabled={!keyPassword || update.isPending}
                onClick={() => {
                  if (window.confirm(tr('delete_this_ssh_key_it_will_no_longer_work_for_sig_7c3f298a')))
                    update.mutate({ action: 'delete', id: k.id, currentPassword: keyPassword })
                }}
              >
                {tr('delete_86ea33ae')}
              </Button>
            </article>
          ))}
          <label className="field">
            {tr('current_password_to_change_ssh_keys_b929eaf8')}
            <input
              type="password"
              autoComplete="current-password"
              value={keyPassword}
              onChange={(e) => setKeyPassword(e.target.value)}
            />
          </label>
          <label className="field">
            {tr('new_public_key_d4410860')}
            <textarea
              rows={3}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="ssh-ed25519 AAAA…"
            />
          </label>
          <Button
            className="primary"
            disabled={!key.trim() || !keyPassword || update.isPending}
            onClick={() => update.mutate({ action: 'add', key, currentPassword: keyPassword })}
          >
            {tr('add_key_e76bd148')}
          </Button>
        </section>
      </div>
    </WaitingSurface>
  )
}
