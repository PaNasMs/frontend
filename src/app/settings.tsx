import { WaitingSurface } from '../shared/ui'
import { notify } from './notifications'
import { useRouteTab } from './navigation'
import { useBlocker, useBeforeUnload } from 'react-router-dom'
import { tr } from '../i18n/index'
import { settingsSections } from './module-registry'
import { useEffect, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mdiCogOutline } from '@mdi/js'
import { request, type Preferences } from '../api/client'
import { Button, Icon, Notice } from '../shared/ui'
export function Settings() {
  const sections = settingsSections()
  const q = useQueryClient()
  const prefs = useQuery({ queryKey: ['preferences'], queryFn: () => request<Preferences>('preferences') })
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [section, setSection] = useRouteTab('/settings', ['general', ...sections.map((s) => s.id)], 'general')
  useEffect(() => {
    if (prefs.data) setTheme(prefs.data.theme)
  }, [prefs.data])
  const save = useMutation({
    mutationFn: () => request<Preferences>('preferences', 'PUT', { ...prefs.data, theme }),
    onSuccess: (p) => {
      q.setQueryData(['preferences'], p)
      notify(tr('settings_saved_0c39426c'))
    },
  })
  const dirty = !!prefs.data && theme !== prefs.data.theme
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(tr('leave_without_saving_f916afe4'))) {
      setTheme(prefs.data?.theme ?? 'dark')
      blocker.proceed()
    } else blocker.reset()
  }, [blocker])
  useBeforeUnload((event) => {
    if (dirty) {
      event.preventDefault()
      event.returnValue = ''
    }
  })
  return (
    <WaitingSurface busy={save.isPending}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{tr('system_settings_7c4ef974')}</span>
          <h1>{tr('settings_7f17c7c6')}</h1>
        </div>
      </div>
      <Tabs.Root
        activationMode="manual"
        value={section}
        onValueChange={(v) => {
          setSection(v)
        }}
        className="settings-layout settings-page"
        orientation="vertical"
      >
        <Tabs.List className="settings-nav" aria-label={tr('settings_sections_9a4919e1')}>
          <Tabs.Trigger value="general">
            <Icon path={mdiCogOutline} />
            {tr('general_fdd17d17')}
          </Tabs.Trigger>
          {sections.map((s) => (
            <Tabs.Trigger key={s.id} value={s.id}>
              <Icon path={s.icon} />
              {s.title}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="settings-content">
          <Tabs.Content value="general">
            <h2>{tr('appearance_d206f1be')}</h2>
            <label className="field">
              {tr('theme_553c45f1')}
              <select
                aria-label={tr('theme_553c45f1')}
                value={theme}
                onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}
              >
                <option value="dark">{tr('dark_bd16b234')}</option>
                <option value="light">{tr('light_8080010c')}</option>
              </select>
            </label>
            {save.error && <Notice error>{save.error.message}</Notice>}

            <Button className="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              {tr('save_4864057d')}
            </Button>
          </Tabs.Content>
          {sections.map((s) => (
            <Tabs.Content key={s.id} value={s.id}>
              <s.component />
            </Tabs.Content>
          ))}
        </div>
      </Tabs.Root>
    </WaitingSurface>
  )
}
