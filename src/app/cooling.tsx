import { WaitingSurface } from '../shared/ui'
import { notify } from './notifications'
import { tr } from '../i18n/index'
import { useDraft } from '../shared/interaction'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from '../api/client'
import type { components } from '../api/schema'
import { Button, Notice } from '../shared/ui'
export type CoolingState = components['schemas']['CoolingState']
export function CoolingSettings({ kind, advanced = false }: { kind: 'cpu' | 'disk'; advanced?: boolean }) {
  const q = useQueryClient()
  const data = useQuery({ queryKey: ['cooling'], queryFn: () => request<CoolingState>('cooling') })
  const cfg = data.data?.config
  const saved = kind === 'cpu' ? cfg?.cpuProfile : cfg?.profile
  const draft = useDraft<{ profile: string; interval: number }>(
    { profile: saved ?? 'balanced', interval: cfg?.sampleSeconds ?? 60 },
    kind + String(advanced),
  )
  const { profile, interval } = draft.draft
  const setProfile = (profile: string) => draft.setDraft((p) => ({ ...p, profile }))
  const setInterval = (interval: number) => draft.setDraft((p) => ({ ...p, interval }))
  const save = useMutation({
    mutationFn: async () => {
      const current = await request<CoolingState>('cooling')
      return request<CoolingState>('cooling', 'PUT', {
        ...current.config,
        ...(kind === 'cpu' ? { cpuProfile: profile } : advanced ? { sampleSeconds: interval } : { profile }),
      })
    },
    onSuccess: (s) => {
      q.setQueryData(['cooling'], s)
      draft.reset(draft.draft)
      notify(tr('settings_saved_0c39426c'))
    },
  })
  const dirty = !!cfg && draft.dirty
  return (
    <WaitingSurface busy={save.isPending}>
      <h2>
        {kind === 'cpu'
          ? tr('cpu_cooling_6eab8340')
          : advanced
            ? tr('disk_polling_7b6fc022')
            : tr('disk_cooling_7171f8c5')}
      </h2>
      {data.error && <Notice error>{data.error.message}</Notice>}
      {data.data && !data.data.available && (
        <Notice error>{tr('cooling_controller_unavailable_4df552be')}</Notice>
      )}
      {kind === 'cpu' && data.data?.status.cpu && !data.data.status.cpu.available && (
        <Notice error>{tr('could_not_apply_the_cpu_profile_06fc2905')}</Notice>
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
            disabled={!cfg}
          >
            <option value="quiet">{tr('quiet_683d09e0')}</option>
            <option value="balanced">{tr('balanced_8462ef31')}</option>
            <option value="performance">{tr('performance_4c36d399')}</option>
          </select>
        </label>
      )}
      {kind === 'disk' && advanced && (
        <>
          <p className="muted small">{tr('smart_and_temperature_are_read_without_waking_slee_e5a9e484')}</p>
          <label className="field">
            {tr('disk_polling_interval_seconds_f3fa0d34')}
            <input
              type="number"
              min={30}
              max={600}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
            />
          </label>
        </>
      )}
      {save.error && <Notice error>{save.error.message}</Notice>}

      <Button
        className="primary"
        disabled={
          !dirty ||
          !data.data?.available ||
          save.isPending ||
          interval < 30 ||
          interval > 600 ||
          !Number.isInteger(interval)
        }
        onClick={() => save.mutate()}
      >
        {tr('apply_768af677')}
      </Button>
    </WaitingSurface>
  )
}
