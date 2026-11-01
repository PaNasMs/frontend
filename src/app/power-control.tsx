import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request, type Identity } from '../api/client'
import type { components } from '../api/schema'
import { tr, locale } from '../i18n'
import { Button, Notice, WaitingSurface } from '../shared/ui'
import { useDraft } from '../shared/interaction'
import { notify } from './notifications'

type State = components['schemas']['PowerControlState']
const defaults = {
  enabled: true,
  gpio: 25,
  button: { enabled: true, gpio: 22 },
  baseline: { config: { enabled: false, gpio: 25 }, button: { enabled: false, gpio: 22 } },
}
const physicalPins = [
  3, 5, 7, 29, 31, 26, 24, 21, 19, 23, 32, 33, 8, 10, 36, 11, 12, 35, 38, 40, 15, 16, 18, 22, 37, 13,
]

export function PowerControlSettings() {
  const client = useQueryClient()
  const session = useQuery({ queryKey: ['session'], queryFn: () => request<Identity>('session') })
  const admin = session.data?.role === 'admin'
  const data = useQuery({
    queryKey: ['power-control'],
    queryFn: () => request<State>('power-control'),
    enabled: admin,
    refetchInterval: 5000,
  })
  const source = data.data
    ? {
        ...data.data.config,
        enabled: data.data.configured ? data.data.config.enabled : true,
        button: data.data.configured ? data.data.button : defaults.button,
        baseline: { config: data.data.config, button: data.data.button },
      }
    : defaults
  const draft = useDraft(source, 'power-control')
  const save = useMutation({
    mutationFn: () =>
      request<State>('power-control', 'PUT', {
        enabled: draft.draft.enabled,
        gpio: draft.draft.gpio,
        button: draft.draft.button,
        expected: draft.original.baseline.config,
        expectedButton: draft.original.baseline.button,
      }),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: ['power-control'] })
    },
    onSuccess: async (state) => {
      await client.cancelQueries({ queryKey: ['power-control'] })
      client.setQueryData(['power-control'], state)
      draft.reset({
        ...state.config,
        button: state.button,
        baseline: { config: state.config, button: state.button },
      })
      notify(tr('settings_saved_0c39426c'))
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ['power-control'] })
    },
  })
  const cfg = draft.draft
  return (
    <WaitingSurface className="surface" busy={save.isPending}>
      <h2>{tr('power.title')}</h2>
      <p className="small muted">{tr('power.hint')}</p>
      {session.isPending ? (
        <p role="status">{tr('power.loading')}</p>
      ) : session.error ? (
        <Notice error>{session.error.message}</Notice>
      ) : !admin ? (
        <Notice>{tr('homes.admin')}</Notice>
      ) : (
        <>
          {data.error && (
            <Notice error>
              {data.error.message} <Button onClick={() => void data.refetch()}>{tr('power.retry')}</Button>
            </Notice>
          )}
          {data.isPending && <p role="status">{tr('power.loading')}</p>}
          {data.data && !data.data.supported && <Notice>{tr('power.unsupported')}</Notice>}
          {data.data?.supported && (
            <>
              <p role="status">
                {data.error
                  ? tr('power.stale', { time: new Date(data.dataUpdatedAt).toLocaleTimeString(locale()) })
                  : data.data.activeGPIO === null
                    ? tr('power.inactive')
                    : tr(
                        physicalPins[data.data.activeGPIO - 2] === undefined
                          ? 'power.activeUnknown'
                          : 'power.active',
                        {
                          gpio: data.data.activeGPIO,
                          pin: physicalPins[data.data.activeGPIO - 2],
                        },
                      )}
              </p>
              {!data.error && data.data.rebootRequired && <Notice>{tr('power.rebootNotice')}</Notice>}
              {draft.conflict && (
                <Notice>
                  {tr('oled.conflict')} <Button onClick={() => draft.reset()}>{tr('oled.reload')}</Button>
                </Notice>
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={cfg.enabled}
                  disabled={save.isPending}
                  onChange={(e) => draft.setDraft((p) => ({ ...p, enabled: e.target.checked }))}
                />
                {tr('power.enabled')}
              </label>
              <label className="field">
                {tr('power.gpio')}
                <select
                  value={cfg.gpio}
                  disabled={save.isPending}
                  aria-describedby="power-pin-hint"
                  onChange={(e) => draft.setDraft((p) => ({ ...p, gpio: Number(e.target.value) }))}
                >
                  {physicalPins.map((pin, index) => (
                    <option key={pin} value={index + 2}>
                      GPIO{index + 2} · {tr('cooling.header_pin')} {pin}
                    </option>
                  ))}
                </select>
              </label>
              <p className="small muted" id="power-pin-hint">
                {tr('power.pinHint')}
              </p>
              {!data.data.configured && <Notice>{tr('power.setupHint')}</Notice>}
              <label className="check">
                <input
                  type="checkbox"
                  checked={cfg.button.enabled}
                  disabled={save.isPending}
                  onChange={(e) =>
                    draft.setDraft((p) => ({ ...p, button: { ...p.button, enabled: e.target.checked } }))
                  }
                />
                {tr('power.buttonEnabled')}
              </label>
              <label className="field">
                {tr('power.buttonGPIO')}
                <select
                  value={cfg.button.gpio}
                  disabled={save.isPending}
                  aria-describedby="power-button-hint"
                  onChange={(e) =>
                    draft.setDraft((p) => ({ ...p, button: { ...p.button, gpio: Number(e.target.value) } }))
                  }
                >
                  {physicalPins.map((pin, index) => (
                    <option key={pin} value={index + 2}>
                      GPIO{index + 2} · {tr('cooling.header_pin')} {pin}
                    </option>
                  ))}
                </select>
              </label>
              <p id="power-button-hint" className="small muted">
                {tr('power.buttonHint')}
              </p>
              {!data.error && <p role="status">{tr(`power.buttonState.${data.data.buttonState}`)}</p>}
              {cfg.button.enabled && (!cfg.enabled || cfg.button.gpio === cfg.gpio) && (
                <Notice error>{tr('power.buttonConflict')}</Notice>
              )}
              {save.error && <Notice error>{save.error.message}</Notice>}
              <Button
                className="primary"
                disabled={
                  (!draft.dirty && data.data.configured) ||
                  draft.conflict ||
                  save.isPending ||
                  !!data.error ||
                  (cfg.button.enabled && (!cfg.enabled || cfg.button.gpio === cfg.gpio))
                }
                onClick={() => save.mutate()}
              >
                {tr('apply_768af677')}
              </Button>
            </>
          )}
        </>
      )}
    </WaitingSurface>
  )
}
