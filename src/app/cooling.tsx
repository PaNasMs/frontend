import { WaitingSurface } from '../shared/ui'
import { notify } from './notifications'
import { tr } from '../i18n/index'
import { serverText } from '../i18n/server'
import { useDraft } from '../shared/interaction'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from '../api/client'
import type { components } from '../api/schema'
import { Button, Notice } from '../shared/ui'
export type CoolingState = components['schemas']['CoolingState']
type HardwareMode = 'none' | 'external-pwm' | 'internal-pwm'
const headerPins: Record<number, number> = {
  2: 3,
  3: 5,
  4: 7,
  5: 29,
  6: 31,
  7: 26,
  8: 24,
  9: 21,
  10: 19,
  11: 23,
  12: 32,
  13: 33,
  14: 8,
  15: 10,
  16: 36,
  17: 11,
  18: 12,
  19: 35,
  20: 38,
  21: 40,
  22: 15,
  23: 16,
  24: 18,
  25: 22,
  26: 37,
  27: 13,
}
export function CoolingSettings({
  kind,
  advanced = false,
  className,
}: {
  kind: 'cpu' | 'disk'
  advanced?: boolean
  className?: string
}) {
  const q = useQueryClient()
  const data = useQuery({ queryKey: ['cooling'], queryFn: () => request<CoolingState>('cooling') })
  const cfg = data.data?.config
  const saved = kind === 'cpu' ? cfg?.cpuProfile : cfg?.profile
  const draft = useDraft<{
    profile: string
    mode: HardwareMode
    control: number
    tach: number | null
  }>(
    {
      profile: saved ?? 'balanced',
      mode: cfg?.hardwareMode ?? 'none',
      control: cfg?.controlGPIO ?? 27,
      tach: cfg?.tachGPIO ?? null,
    },
    kind + String(advanced),
  )
  const { profile, mode, control, tach } = draft.draft
  const pins = Object.keys(headerPins).map(Number)
  const pinLabel = (pin: number) => `GPIO${pin} · ${tr('cooling.header_pin')} ${headerPins[pin]}`
  const setProfile = (profile: string) => draft.setDraft((p) => ({ ...p, profile }))
  const save = useMutation({
    mutationFn: async () => {
      const current = await request<CoolingState>('cooling')
      return request<CoolingState>('cooling', 'PUT', {
        ...current.config,
        ...(kind === 'cpu'
          ? { cpuProfile: profile }
          : advanced
            ? { hardwareMode: mode, controlGPIO: control, tachGPIO: tach }
            : { profile }),
      })
    },
    onSuccess: (s) => {
      q.setQueryData(['cooling'], s)
      draft.reset(draft.draft)
      notify(tr('settings_saved_0c39426c'))
    },
  })
  const dirty = !!cfg && draft.dirty
  if (data.data?.capabilities?.[kind] === false) return null
  return (
    <WaitingSurface className={className} busy={save.isPending}>
      <h2>
        {kind === 'cpu'
          ? tr('cpu_cooling_6eab8340')
          : advanced
            ? tr('cooling.hardware_title')
            : tr('disk_cooling_7171f8c5')}
      </h2>
      {data.error && <Notice error>{data.error.message}</Notice>}
      {data.data && !data.data.available && (
        <Notice error>{tr('cooling_controller_unavailable_4df552be')}</Notice>
      )}
      {kind === 'disk' && data.data?.status.reason === 'initializing-sensors' && (
        <p role="status" className="small muted">
          {tr('cooling_initializing_sensors')}
        </p>
      )}
      {kind === 'cpu' && data.data?.status.cpu && !data.data.status.cpu.available && (
        <Notice error>{tr('could_not_apply_the_cpu_profile_06fc2905')}</Notice>
      )}
      {kind === 'disk' && cfg?.hardwareMode === 'none' && !advanced && (
        <p className="muted small">{tr('cooling.disabled_hint')}</p>
      )}
      {!advanced && (
        <label className="field">
          {tr('profile_eb0b9b0d')}
          <select
            aria-label={
              kind === 'cpu' ? tr('cpu_cooling_profile_4ce3b8d9') : tr('disk_cooling_profile_33f8042e')
            }
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            disabled={!cfg || (kind === 'disk' && cfg.hardwareMode === 'none')}
          >
            <option value="quiet">{tr('quiet_683d09e0')}</option>
            <option value="balanced">{tr('balanced_8462ef31')}</option>
            <option value="performance">{tr('performance_4c36d399')}</option>
          </select>
        </label>
      )}
      {kind === 'disk' && advanced && (
        <>
          <label className="field">
            {tr('cooling.hardware_mode')}
            <select
              value={mode}
              disabled={!cfg}
              onChange={(e) => {
                const next = e.target.value as HardwareMode
                draft.setDraft((p) => ({
                  ...p,
                  mode: next,
                  control: next === 'internal-pwm' ? 18 : 27,
                  tach: next === 'internal-pwm' ? 24 : null,
                }))
              }}
            >
              <option value="none">{tr('cooling.none')}</option>
              <option value="external-pwm">{tr('cooling.external')}</option>
              <option value="internal-pwm">{tr('cooling.internal')}</option>
            </select>
          </label>
          {mode !== 'none' && (
            <>
              <p className="muted small">
                {tr(mode === 'internal-pwm' ? 'cooling.internal_hint' : 'cooling.external_hint')}
              </p>
              <div className="form-grid">
                <label className="field">
                  {tr('cooling.control_gpio')}
                  <select
                    value={control}
                    onChange={(e) => draft.setDraft((p) => ({ ...p, control: Number(e.target.value) }))}
                  >
                    {(mode === 'internal-pwm' ? [12, 13, 18, 19] : pins).map((pin) => (
                      <option key={pin} value={pin} disabled={pin === tach}>
                        {pinLabel(pin)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  {tr('cooling.tach_gpio')}
                  <select
                    value={tach ?? ''}
                    onChange={(e) =>
                      draft.setDraft((p) => ({
                        ...p,
                        tach: e.target.value === '' ? null : Number(e.target.value),
                      }))
                    }
                  >
                    <option value="">{tr('cooling.no_tach')}</option>
                    {pins.map((pin) => (
                      <option key={pin} value={pin} disabled={pin === control}>
                        {pinLabel(pin)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="muted small">{tr('cooling.gpio_hint')}</p>
              {cfg?.hardwareMode === mode && data.data?.status.rpm != null && (
                <p className="small">
                  {tr('cooling.measured_rpm')}: {data.data.status.rpm} RPM
                </p>
              )}
            </>
          )}
          {data.data?.status.hardwareError && (
            <Notice error>{serverText(data.data.status.hardwareError)}</Notice>
          )}
        </>
      )}
      {save.error && <Notice error>{save.error.message}</Notice>}

      <Button
        className="primary"
        disabled={
          !dirty ||
          data.data?.configured === false ||
          (!data.data?.available && !(kind === 'disk' && advanced)) ||
          save.isPending
        }
        onClick={() => save.mutate()}
      >
        {tr('apply_768af677')}
      </Button>
      {kind === 'disk' && advanced && (
        <>
          <h3>{tr('power_saving_and_protection_af9b79e7')}</h3>
          <p className="small muted">{tr('the_fan_stops_when_all_disks_are_asleep_and_system_560c9e8c')}</p>
          <p className="small muted">{tr('system_operation_timeouts_and_profile_temperature__8ed0f40c')}</p>
        </>
      )}
    </WaitingSurface>
  )
}

export function DiskTelemetrySettings() {
  const q = useQueryClient()
  const data = useQuery({ queryKey: ['cooling'], queryFn: () => request<CoolingState>('cooling') })
  const draft = useDraft(data.data?.config.sampleSeconds ?? 60)
  const save = useMutation({
    mutationFn: async () => {
      const current = await request<CoolingState>('cooling')
      return request<CoolingState>('cooling', 'PUT', { ...current.config, sampleSeconds: draft.draft })
    },
    onSuccess: (state) => {
      q.setQueryData(['cooling'], state)
      draft.reset(draft.draft)
      notify(tr('settings_saved_0c39426c'))
    },
  })
  if (data.data?.configured === false) return null
  return (
    <WaitingSurface busy={save.isPending} className="disk-settings-section">
      <h2>{tr('disk_polling_interval_seconds_f3fa0d34')}</h2>
      <p className="muted small">{tr('smart_and_temperature_are_read_without_waking_slee_e5a9e484')}</p>
      {data.error && <Notice error>{data.error.message}</Notice>}
      <label className="field">
        {tr('disk_polling_interval_seconds_f3fa0d34')}
        <input
          type="number"
          min={30}
          max={600}
          value={draft.draft}
          onChange={(e) => draft.setDraft(Number(e.target.value))}
        />
      </label>
      {save.error && <Notice error>{save.error.message}</Notice>}
      <Button
        className="primary"
        disabled={
          !data.data ||
          !draft.dirty ||
          save.isPending ||
          !Number.isInteger(draft.draft) ||
          draft.draft < 30 ||
          draft.draft > 600
        }
        onClick={() => save.mutate()}
      >
        {tr('apply_768af677')}
      </Button>
    </WaitingSurface>
  )
}
