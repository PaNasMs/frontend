import { useDraft } from '../shared/interaction'
import { WaitingSurface } from '../shared/ui'
import { useRouteTab } from './navigation'
import { tr } from '../i18n/index'
import { mdiPencilOutline, mdiPlus, mdiTrashCanOutline } from '@mdi/js'
import * as Tabs from '@radix-ui/react-tabs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { newID } from './dashboard'
import { CoolingSettings } from './cooling'
import { OperationButton, managed } from './operations'
import { request, type Storage, type Device, type Preferences } from '../api/client'
import type { StorageOptions } from './storage-volumes'
import { Button, Notice } from '../shared/ui'
const flatten = (nodes: Device[]): Device[] => nodes.flatMap((d) => [d, ...flatten(d.children ?? [])])
const days = [
  tr('mon_3770c0ef'),
  tr('tue_93480c93'),
  tr('wed_387e3922'),
  tr('thu_9c8acdf3'),
  tr('fri_e18bb084'),
  tr('sat_e8bd00ad'),
  tr('sun_c58ca969'),
]
export function DiskSettings() {
  const q = useQueryClient()
  const [tab, setTab] = useRouteTab('/settings/storage', ['general', 'advanced'], 'general')
  const storage = useQuery({ queryKey: ['storage'], queryFn: () => request<Storage>('storage') })
  const options = useQuery({
    queryKey: ['management-storage', 'all'],
    queryFn: () => managed<StorageOptions>('storage-options'),
    refetchInterval: 10000,
  })
  const prefs = useQuery({ queryKey: ['preferences'], queryFn: () => request<Preferences>('preferences') })
  const disks = flatten(storage.data?.devices ?? []).filter(
    (d) => d.type === 'disk' && d.tran === 'sata' && d.serial,
  )
  const savedSleep = options.data?.sleepSettings?.minutes
  const sleepDraft = useDraft<number | null>(savedSleep ?? null)
  const { draft: sleep, setDraft: setSleep } = sleepDraft
  const sleepSave = useMutation({
    mutationFn: async () => {
      const params = { minutes: sleep }
      const plan = await managed<{
        fingerprint: string
        confirmation: string
      }>('plan', {
        action: 'disk.sleep',
        params,
      })
      return managed('run', {
        id: newID(),
        action: 'disk.sleep',
        params,
        fingerprint: plan.fingerprint,
        confirmation: plan.confirmation,
      })
    },
    onSuccess: () => {
      q.invalidateQueries({ queryKey: ['jobs'] })
      q.invalidateQueries({ queryKey: ['management-storage'] })
    },
  })
  const sleepStates = Object.values(options.data?.sleepStatus ?? {})
  const reset = useMutation({
    mutationFn: async (key: string) => {
      const current = await request<Preferences>('preferences')
      const baselines = { ...current.smartCrcBaselines }
      delete baselines[key]
      return request<Preferences>('preferences', 'PUT', { ...current, smartCrcBaselines: baselines })
    },
    onSuccess: (p) => {
      q.setQueryData(['preferences'], p)
      q.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
  return (
    <WaitingSurface busy={sleepSave.isPending || reset.isPending}>
      <h2>{tr('disk_subsystem_e8f8c086')}</h2>
      <Tabs.Root activationMode="manual" value={tab} onValueChange={setTab}>
        <Tabs.List className="tabs" aria-label={tr('disk_subsystem_settings_014926f4')}>
          <Tabs.Trigger value="general">{tr('settings_7f17c7c6')}</Tabs.Trigger>
          <Tabs.Trigger value="advanced">{tr('advanced_settings_3cc80085')}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="general">
          <section className="disk-settings-section">
            <CoolingSettings kind="disk" />
          </section>
          <section className="disk-settings-section">
            <h2>{tr('disk_sleep_224ffae6')}</h2>
            <p className="small muted">{tr('a_shared_idle_timeout_for_all_non_system_sata_hdds_d9d621ce')}</p>
            <label className="field">
              {tr('put_disks_to_sleep_8df3950e')}
              <select
                aria-label={tr('idle_time_before_sleep_0b98862f')}
                value={sleep ?? ''}
                disabled={!options.data || sleepSave.isPending}
                onChange={(e) => setSleep(Number(e.target.value))}
              >
                <option value="" disabled>
                  {tr('not_configured_in_panasms_b81448a5')}
                </option>
                <option value={0}>{tr('never_sleep_c6b71a1a')}</option>
                {[5, 10, 15, 20, 30, 60, 120, 180, 300].map((n) => (
                  <option key={n} value={n}>
                    {tr('after_4e3c6adc') + ' '}
                    {n}
                    {' ' + tr('minutes_333ed110')}
                  </option>
                ))}
              </select>
            </label>
            {sleepSave.error && <Notice error>{sleepSave.error.message}</Notice>}
            {sleepSave.isSuccess && (
              <Notice>{tr('the_configuration_task_has_been_submitted_see_the__51d4096a')}</Notice>
            )}
            <Button
              className="primary"
              disabled={sleep === null || sleep === savedSleep || sleepSave.isPending || !options.data}
              onClick={() => sleepSave.mutate()}
            >
              {tr('apply_768af677')}
            </Button>
            {sleepStates.some((s) => s.status === 'busy') && (
              <p className="small muted">
                {tr('for_disks_in_a_busy_raid_array_the_setting_will_be_88e4ecbe')}
              </p>
            )}
            {sleepStates
              .filter((s) => s.status === 'error')
              .map((s) => (
                <Notice error key={s.device}>
                  {s.device}: {s.error}
                </Notice>
              ))}
          </section>
          <section className="disk-settings-section">
            <h2>{tr('smart_schedule_07fafb80')}</h2>
            <p className="small muted">{tr('times_use_the_nas_time_zone_checks_are_skipped_whi_45c1d87b')}</p>
            {storage.error && <Notice error>{storage.error.message}</Notice>}
            {options.error && <Notice error>{options.error.message}</Notice>}
            <div
              role="table"
              className="smart-schedule-list"
              aria-label={tr('smart_schedules_for_all_disks_62f57755')}
            >
              <div role="row" className="smart-schedule-header">
                <span role="columnheader">{tr('disk_ca040760')}</span>
                <span role="columnheader">{tr('short_test_adb0ab92')}</span>
                <span role="columnheader">{tr('extended_test_00c16405')}</span>
              </div>
              {disks.map((disk) => {
                const schedules =
                  options.data?.devices.find((d) => d.path === disk.path)?.smartSchedules ?? []
                return (
                  <div role="row" className="smart-schedule-row" key={disk.path}>
                    <div role="rowheader" className="smart-schedule-device">
                      <strong>{disk.model?.trim() || disk.name}</strong>
                      <span>{disk.serial}</span>
                      <small>{disk.path}</small>
                    </div>
                    {['short', 'long'].map((test) => {
                      const schedule = schedules.find((s) => s.test === test)
                      const name = test === 'short' ? tr('short_860d8c86') : tr('extended_fc92aebd')
                      return (
                        <div role="cell" className="smart-schedule-cell" key={test}>
                          <div className="smart-schedule-value">
                            <span className="smart-schedule-mobile-label">{name}</span>
                            <strong>
                              {!options.data
                                ? tr('loading_b6819e91')
                                : schedule
                                  ? `${days[schedule.weekday]} · ${String(schedule.hour).padStart(2, '0')}:00`
                                  : tr('not_configured_28564aa0')}
                            </strong>
                            {schedule && (
                              <small>
                                {schedule.weeks === 2
                                  ? tr('every_two_weeks_dc123b88')
                                  : tr('weekly_10c12f72')}
                                {schedule.weeks === 2 && schedule.startDate ? (
                                  <>
                                    <br />
                                    {tr('from_b40bbca3') + ' '}
                                    {schedule.startDate.split('-').reverse().join('.')}
                                  </>
                                ) : null}
                              </small>
                            )}
                          </div>
                          <div className="smart-schedule-actions">
                            <OperationButton
                              key={`${disk.path}:${test}:${JSON.stringify(schedule)}`}
                              icon={schedule ? mdiPencilOutline : mdiPlus}
                              label={tr('test_c19027d6', {
                                v0: schedule ? tr('edit_9d809f88') : tr('configure_8960ddc3'),
                                v1: name.toLowerCase(),
                                v2: disk.serial,
                              })}
                              actions={['smart.schedule']}
                              initial={{
                                target: disk.path,
                                test,
                                weeks: test === 'long' ? 2 : 1,
                                ...schedule,
                              }}
                              context={[
                                {
                                  key: 'target',
                                  label: tr('disk_ca040760'),
                                  value: `${disk.serial} · ${disk.path}`,
                                },
                                { key: 'test', label: tr('test_457969b0'), value: name },
                              ]}
                              disabled={!options.data}
                              autoReview
                            />
                            {schedule && (
                              <OperationButton
                                icon={mdiTrashCanOutline}
                                label={tr('delete_test_bf6d8c9e', {
                                  v0: name.toLowerCase(),
                                  v1: disk.serial,
                                })}
                                actions={['smart.unschedule']}
                                initial={{ target: disk.path, test }}
                                context={[
                                  {
                                    key: 'target',
                                    label: tr('disk_ca040760'),
                                    value: `${disk.serial} · ${disk.path}`,
                                  },
                                  { key: 'test', label: tr('test_457969b0'), value: name },
                                ]}
                                autoReview
                              />
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
            {!storage.isPending && !disks.length && (
              <p className="muted small">{tr('no_eligible_sata_disks_a08bc2f6')}</p>
            )}
          </section>
        </Tabs.Content>
        <Tabs.Content value="advanced">
          <section className="disk-settings-section">
            <CoolingSettings kind="disk" advanced />
          </section>
          <section className="disk-settings-section">
            <h2>{tr('acknowledged_crc_counts_434558cb')}</h2>
            <p className="small muted">{tr('your_acknowledged_sata_communication_error_counts__4fac524b')}</p>
            {prefs.error && <Notice error>{prefs.error.message}</Notice>}
            {reset.error && <Notice error>{reset.error.message}</Notice>}
            {Object.entries(prefs.data?.smartCrcBaselines ?? {}).map(([key, value]) => (
              <div className="disk-setting-row" key={key}>
                <div>
                  <strong>{key}</strong>
                  <p className="small muted">
                    {tr('acknowledged_922c5561') + ' '}
                    {value}
                  </p>
                </div>
                <Button disabled={reset.isPending} onClick={() => reset.mutate(key)}>
                  {tr('reset_baseline_66fff5ba')}
                </Button>
              </div>
            ))}
            {prefs.data && !Object.keys(prefs.data.smartCrcBaselines ?? {}).length && (
              <p className="muted small">{tr('no_acknowledged_counts_0e5d535c')}</p>
            )}
          </section>
          <section className="disk-settings-section">
            <h2>{tr('power_saving_and_protection_af9b79e7')}</h2>
            <p className="small muted">{tr('the_fan_stops_when_all_disks_are_asleep_and_system_560c9e8c')}</p>
            <p className="small muted">{tr('system_operation_timeouts_and_profile_temperature__8ed0f40c')}</p>
          </section>
        </Tabs.Content>
      </Tabs.Root>
    </WaitingSurface>
  )
}
