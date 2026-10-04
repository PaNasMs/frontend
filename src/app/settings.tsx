import { useRouteTab } from './navigation'
import { tr } from '../i18n'
import { settingsSections } from './module-registry'
import * as Tabs from '@radix-ui/react-tabs'
import { SectionNav } from '../shared/ui'
export function Settings() {
  const sections = settingsSections()
  const [section, setSection] = useRouteTab(
    '/settings',
    sections.map((s) => s.id),
    sections[0]?.id ?? 'general',
  )
  return (
    <>
      <div className="page-heading">
        <h1>{tr('settings_7f17c7c6')}</h1>
      </div>
      <Tabs.Root
        activationMode="manual"
        value={section}
        onValueChange={setSection}
        className="section-layout settings-page"
        orientation="vertical"
      >
        <SectionNav
          label={tr('settings_sections_9a4919e1')}
          value={section}
          onChange={setSection}
          items={sections.map((s) => ({
            id: s.id,
            title: s.title,
            icon: s.icon,
            group: s.external ? tr('modules_09017097') : undefined,
          }))}
        />
        <div className="settings-content">
          {sections.map((s) => (
            <Tabs.Content key={s.id} value={s.id}>
              <s.component />
            </Tabs.Content>
          ))}
        </div>
      </Tabs.Root>
    </>
  )
}
