import * as Tabs from '@radix-ui/react-tabs'
import { useRouteTab } from './navigation'
import { WallpaperSettings } from './wallpaper'
import { useDraft, useUnsavedForm, ConfirmDialog } from '../shared/interaction'
import { UserSessions, UserHistory } from './user-sessions'
import { AvatarSettings } from './user-avatar'
import { WaitingSurface } from '../shared/ui'
import { notify } from './notifications'
import { tr, language, languageNames, languages, type Language } from '../i18n/index'
import { usePreferencesSave } from './preferences-save'
import { mdiCheck, mdiKeyChange, mdiKeyPlus, mdiDeleteOutline } from '@mdi/js'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request, type Preferences } from '../api/client'
import type { components } from '../api/schema'
import { Button, Icon, Notice } from '../shared/ui'
type Profile = components['schemas']['Profile']
export function ProfilePage() {
  const [section, setSection] = useRouteTab(
    '/profile',
    ['account', 'appearance', 'security', 'activity'],
    'account',
  )
  const [deleteKey, setDeleteKey] = useState('')
  const preferences = useQuery({
    queryKey: ['preferences'],
    queryFn: () => request<Preferences>('preferences'),
  })
  const saveLanguage = usePreferencesSave()
  const langDraft = useDraft(language(preferences.data?.language))
  const { draft: selectedLanguage, setDraft: setSelectedLanguage } = langDraft
  const themeDraft = useDraft<'dark' | 'light'>(preferences.data?.theme ?? 'dark')
  const saveTheme = usePreferencesSave()

  const q = useQueryClient()
  const data = useQuery({ queryKey: ['profile'], queryFn: () => request<Profile>('profile') })
  const nameDraft = useDraft(data.data?.name ?? '')
  const { draft: name, setDraft: setName } = nameDraft
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [key, setKey] = useState('')
  const [keyPassword, setKeyPassword] = useState('')
  useUnsavedForm(!!next || !!key, () => {
    setCurrent('')
    setNext('')
    setConfirm('')
    setKey('')
    setKeyPassword('')
  })
  const update = useMutation({
    mutationFn: (body: Record<string, string>) => request('profile', 'POST', body),
    onSuccess: (_, body) => {
      if (body.action === 'password') {
        q.clear()
        location.assign('/')
        return
      }
      if (body.action === 'name') nameDraft.reset(body.name)
      notify(body.action === 'name' ? tr('name_saved_31b77838') : tr('ssh_keys_updated_88d5e6c8'))
      setKey('')
      setKeyPassword('')
      void q.invalidateQueries({ queryKey: ['profile'] })
      void q.invalidateQueries({ queryKey: ['session'] })
      void q.invalidateQueries({ queryKey: ['users'] })
    },
  })
  return (
    <WaitingSurface busy={update.isPending || saveLanguage.isPending || saveTheme.isPending}>
      <ConfirmDialog
        open={!!deleteKey}
        title={tr('delete_86ea33ae')}
        accept={tr('delete_86ea33ae')}
        onCancel={() => setDeleteKey('')}
        onConfirm={() => {
          update.mutate({ action: 'delete', id: deleteKey, currentPassword: keyPassword })
          setDeleteKey('')
        }}
      >
        {tr('delete_this_ssh_key_it_will_no_longer_work_for_sig_7c3f298a')}
      </ConfirmDialog>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{tr('your_account_0d85c326')}</span>
          <h1>{tr('my_profile_88060502')}</h1>
        </div>
      </div>
      {data.error && <Notice error>{data.error.message}</Notice>}
      {update.error && <Notice error>{update.error.message}</Notice>}
      <Tabs.Root value={section} onValueChange={setSection}>
        <Tabs.List className="tabs">
          {(['account', 'appearance', 'security', 'activity'] as const).map((id) => (
            <Tabs.Trigger value={id} key={id}>
              {tr('ui.' + id)}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>
      <div className="profile-grid">
        <section className="surface" hidden={section !== 'appearance'}>
          <h2>{tr('ui.theme')}</h2>
          <label className="field">
            {tr('ui.theme')}
            <select
              value={themeDraft.draft}
              onChange={(e) => themeDraft.setDraft(e.target.value as 'light' | 'dark')}
            >
              <option value="light">{tr('ui.light')}</option>
              <option value="dark">{tr('ui.dark')}</option>
            </select>
          </label>
          <Button
            aria-label={tr('save_4864057d')}
            title={tr('save_4864057d')}
            disabled={!themeDraft.dirty || saveTheme.isPending}
            onClick={() =>
              saveTheme.mutate((p) => ({ ...p, theme: themeDraft.draft }), {
                onSuccess: () => {
                  themeDraft.reset(themeDraft.draft)
                  notify(tr('ui.saved'))
                },
              })
            }
          >
            <Icon path={mdiCheck} />
          </Button>
          {saveTheme.error && <Notice error>{saveTheme.error.message}</Notice>}
          <h2>{tr('wallpaper_b59390bb')}</h2>
          <WallpaperSettings />
        </section>
        <div hidden={section !== 'account'}>
          <AvatarSettings />
        </div>
        <section className="surface" hidden={section !== 'appearance'}>
          <h2>{tr('profile.language')}</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              saveLanguage.mutate((current) => ({ ...current, language: selectedLanguage }), {
                onSuccess: () => {
                  flushSync(() => langDraft.reset(selectedLanguage))
                  location.reload()
                },
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
        <section className="surface" hidden={section !== 'account'}>
          <h2>{tr('personal_details_5b1cf4d4')}</h2>
          {data.data && (
            <dl className="info-list">
              <dt>{tr('username_e2d97c93')}</dt>
              <dd>{data.data.username}</dd>
              <dt>{tr('role_ab51a3ac')}</dt>
              <dd>{tr(data.data.role === 'admin' ? 'administrator_36d00fd7' : 'user_51aff185')}</dd>
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
            <Button
              title={tr('save_name_b6c0cf28')}
              aria-label={tr('save_name_b6c0cf28')}
              disabled={!data.data || name === data.data.name || update.isPending}
            >
              <Icon path={mdiCheck} />
            </Button>
          </form>
        </section>
        <section className="surface" hidden={section !== 'security'}>
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
                aria-invalid={!!confirm && confirm !== next}
                aria-describedby="password-mismatch"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            {confirm && confirm !== next && (
              <p id="password-mismatch" role="alert" className="error-text">
                {tr('passwords_do_not_match_a73dc9b1')}
              </p>
            )}
            <p className="small muted">{tr('this_changes_your_linux_password_you_will_need_to__e2af63b1')}</p>
            <Button
              title={tr('change_password_5e4fa6bd')}
              aria-label={tr('change_password_5e4fa6bd')}
              disabled={update.isPending || !current || !next || next !== confirm}
            >
              <Icon path={mdiKeyChange} />
            </Button>
          </form>
        </section>
        <section className="surface profile-keys" hidden={section !== 'security'}>
          <h2>{tr('ssh_keys_95296132')}</h2>
          {data.data?.keys.length === 0 && <p className="muted">{tr('no_keys_added_eba3397b')}</p>}
          {data.data?.keys.map((k) => (
            <article className="key-card" key={k.id}>
              <div>
                <strong>{k.comment || k.type}</strong>
                <div className="mono small">{k.fingerprint}</div>
              </div>
              <Button
                title={tr('delete_86ea33ae')}
                aria-label={tr('delete_86ea33ae')}
                disabled={!keyPassword || update.isPending}
                onClick={() => {
                  setDeleteKey(k.id)
                }}
              >
                <Icon path={mdiDeleteOutline} />
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
            title={tr('add_key_e76bd148')}
            aria-label={tr('add_key_e76bd148')}
            disabled={!key.trim() || !keyPassword || update.isPending}
            onClick={() => update.mutate({ action: 'add', key, currentPassword: keyPassword })}
          >
            <Icon path={mdiKeyPlus} />
          </Button>
        </section>
        {data.data && (
          <section className="surface" hidden={section !== 'activity'}>
            <UserSessions user={data.data.username} />
          </section>
        )}
        {data.data && (
          <section className="surface" hidden={section !== 'activity'}>
            <UserHistory user={data.data.username} />
          </section>
        )}
      </div>
    </WaitingSurface>
  )
}
