import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from '../api/client'
import type { components } from '../api/schema'
import { tr } from '../i18n'
import { Button, Disclosure, Notice, WaitingSurface } from '../shared/ui'
import { useDraft } from '../shared/interaction'
import { notify } from './notifications'

export type OLEDState = components['schemas']['OLEDState']
type Settings = components['schemas']['OLEDSettings']
export const defaultOLED: Settings = {
  layout: 'compact',
  language: 'en',
  showTasks: true,
  showEvents: true,
  eventSeconds: 20,
  pageSeconds: 6,
  enabled: false,
  brightness: 25,
  rotation: 0,
  bus: 1,
  sda: 2,
  scl: 3,
  address: 60,
  controller: 'ssd1306',
  showIP: true,
  showCPU: true,
  showDisks: true,
}
const pairs = [
  { sda: 2, scl: 3, bus: 1, pins: '3 / 5' },
  { sda: 10, scl: 11, bus: 1, pins: '19 / 23' },
  { sda: 4, scl: 5, bus: 2, pins: '7 / 29' },
  { sda: 12, scl: 13, bus: 2, pins: '32 / 33' },
  { sda: 6, scl: 7, bus: 3, pins: '31 / 26' },
  { sda: 14, scl: 15, bus: 3, pins: '8 / 10' },
  { sda: 22, scl: 23, bus: 3, pins: '15 / 16' },
  { sda: 8, scl: 9, bus: 0, pins: '24 / 21' },
] as const

export function OLEDSettings() {
  const q = useQueryClient()
  const data = useQuery({
    queryKey: ['oled'],
    queryFn: () => request<OLEDState>('oled'),
    refetchInterval: 5000,
  })
  const draft = useDraft(data.data?.config ?? defaultOLED, 'oled')
  const cfg = draft.draft
  const [advanced, setAdvanced] = useState(false)
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    draft.setDraft((p) => ({ ...p, [key]: value }))
  const save = useMutation({
    mutationFn: () => request<OLEDState>('oled', 'PUT', cfg),
    onMutate: async () => {
      await q.cancelQueries({ queryKey: ['oled'] })
    },
    onSuccess: async (state) => {
      await q.cancelQueries({ queryKey: ['oled'] })
      q.setQueryData(['oled'], state)
      draft.reset(state.config)
      notify(tr('settings_saved_0c39426c'))
    },
    onError: () => {
      void q.invalidateQueries({ queryKey: ['oled'] })
    },
  })
  if (!data.data?.supported) return null
  const invalidEvent = !Number.isInteger(cfg.eventSeconds) || cfg.eventSeconds < 15 || cfg.eventSeconds > 60
  const invalid =
    invalidEvent ||
    !Number.isInteger(cfg.pageSeconds) ||
    cfg.pageSeconds < 4 ||
    cfg.pageSeconds > 60 ||
    !Number.isInteger(cfg.brightness) ||
    cfg.brightness < 1 ||
    cfg.brightness > 100 ||
    (cfg.enabled && cfg.layout !== 'storage' && !cfg.showIP && !cfg.showCPU && !cfg.showDisks)
  return (
    <WaitingSurface className="surface" busy={save.isPending}>
      <h2>{tr('oled.title')}</h2>
      <p className="small muted">{tr('oled.hint')}</p>
      <p role="status">{tr(`oled.state.${data.error ? 'unavailable' : data.data.state}`)}</p>
      {data.error && <Notice error>{data.error.message}</Notice>}
      {data.data.state === 'error' && <Notice error>{tr('oled.hardwareError')}</Notice>}
      {draft.conflict && (
        <Notice>
          {tr('oled.conflict')} <Button onClick={() => draft.reset()}>{tr('oled.reload')}</Button>
        </Notice>
      )}
      <label className="check">
        <input type="checkbox" checked={cfg.enabled} onChange={(e) => set('enabled', e.target.checked)} />
        {tr('oled.enabled')}
      </label>
      <label className="field">
        <span id="oled-layout-label">{tr('oled.layout')}</span>
        <select
          aria-labelledby="oled-layout-label"
          value={cfg.layout}
          aria-describedby="oled-layout-hint"
          onChange={(e) => set('layout', e.target.value as Settings['layout'])}
        >
          {(['compact', 'large', 'disks', 'pages', 'storage'] as const).map((layout) => (
            <option key={layout} value={layout}>
              {tr(`oled.layout.${layout}`)}
            </option>
          ))}
        </select>
      </label>
      <p id="oled-layout-hint" className="small muted">
        {tr(`oled.layout.${cfg.layout}.hint`)}
      </p>
      <figure style={{ margin: '16px 0' }}>
        <img
          src={`/oled/${cfg.layout}.png`}
          alt={tr(`oled.layout.${cfg.layout}.hint`)}
          width={256}
          height={128}
          style={{ imageRendering: 'pixelated', maxWidth: '100%', height: 'auto' }}
        />
        <figcaption className="small muted">{tr('oled.preview')}</figcaption>
      </figure>
      <label className="field">
        {tr('oled.language')}
        <select
          value={cfg.language}
          onChange={(e) => set('language', e.target.value as Settings['language'])}
        >
          <option value="en">English</option>
          <option value="ru">Русский</option>
          <option value="uk">Українська</option>
        </select>
      </label>
      <fieldset>
        <legend>{tr('oled.activity')}</legend>
        {(['showTasks', 'showEvents'] as const).map((key) => (
          <label key={key} className="check">
            <input type="checkbox" checked={cfg[key]} onChange={(e) => set(key, e.target.checked)} />
            {tr(`oled.${key}`)}
          </label>
        ))}
      </fieldset>
      <p className="small muted">{tr('oled.activityHint')}</p>
      <label className="field">
        {tr('oled.eventSeconds')}
        <input
          type="number"
          min={15}
          max={60}
          value={cfg.eventSeconds}
          aria-invalid={invalidEvent}
          aria-describedby={invalidEvent ? 'oled-event-hint oled-event-error' : 'oled-event-hint'}
          onChange={(e) => set('eventSeconds', Number(e.target.value))}
        />
        <span id="oled-event-hint" className="small muted">
          {tr('oled.eventHint')}
        </span>
        {invalidEvent && (
          <span id="oled-event-error" role="alert">
            {tr('oled.eventInvalid')}
          </span>
        )}
      </label>
      <div className="form-grid">
        <label className="field">
          {tr('oled.brightness')}
          <input
            type="number"
            min={1}
            max={100}
            value={cfg.brightness}
            onChange={(e) => set('brightness', Number(e.target.value))}
          />
        </label>
        <label className="field">
          {tr('oled.rotation')}
          <select value={cfg.rotation} onChange={(e) => set('rotation', Number(e.target.value) as 0 | 180)}>
            <option value={0}>0°</option>
            <option value={180}>180°</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend>{tr('oled.readings')}</legend>
        {(['showIP', 'showCPU', 'showDisks'] as const).map((key) => (
          <label key={key} className="check">
            <input type="checkbox" checked={cfg[key]} onChange={(e) => set(key, e.target.checked)} />
            {tr(`oled.${key}`)}
          </label>
        ))}
      </fieldset>
      <p className="small muted">{tr('oled.telemetry')}</p>
      {cfg.enabled && cfg.layout !== 'storage' && !cfg.showIP && !cfg.showCPU && !cfg.showDisks && (
        <Notice error>{tr('oled.selectReading')}</Notice>
      )}
      <Disclosure title={tr('advanced_settings_3cc80085')} open={advanced} onOpenChange={setAdvanced}>
        <label className="field">
          {tr('oled.pageSeconds')}
          <input
            type="number"
            min={4}
            max={60}
            value={cfg.pageSeconds}
            aria-invalid={!Number.isInteger(cfg.pageSeconds) || cfg.pageSeconds < 4 || cfg.pageSeconds > 60}
            aria-describedby="oled-interval-hint"
            onChange={(e) => set('pageSeconds', Number(e.target.value))}
          />
          <span id="oled-interval-hint" className="small muted">
            {tr('oled.intervalHint')}
          </span>
        </label>
        <label className="field">
          {tr('oled.pins')}
          <select
            value={cfg.sda}
            onChange={(e) => {
              const pair = pairs.find((p) => p.sda === Number(e.target.value))!
              draft.setDraft((p) => ({ ...p, sda: pair.sda, scl: pair.scl, bus: pair.bus }))
            }}
          >
            {pairs.map((p) => (
              <option key={p.sda} value={p.sda}>
                SDA GPIO{p.sda} / SCL GPIO{p.scl} · {tr('cooling.header_pin')} {p.pins}
              </option>
            ))}
          </select>
        </label>
        <p className="small muted">{tr('oled.pinsHint')}</p>
        <div className="form-grid">
          <label className="field">
            {tr('oled.controller')}
            <select
              value={cfg.controller}
              onChange={(e) => set('controller', e.target.value as Settings['controller'])}
            >
              <option value="ssd1306">SSD1306 · 128×64</option>
              <option value="sh1106">SH1106 · 128×64</option>
            </select>
          </label>
          <label className="field">
            {tr('oled.address')}
            <select value={cfg.address} onChange={(e) => set('address', Number(e.target.value) as 60 | 61)}>
              <option value={60}>0x3C</option>
              <option value={61}>0x3D</option>
            </select>
          </label>
        </div>
        {data.data.state === 'error' && <p className="small muted">{data.data.status.error}</p>}
      </Disclosure>
      {save.error && <Notice error>{save.error.message}</Notice>}
      <Button
        className="primary"
        disabled={!draft.dirty || draft.conflict || invalid || save.isPending || !!data.error}
        onClick={() => save.mutate()}
      >
        {tr('apply_768af677')}
      </Button>
    </WaitingSurface>
  )
}
