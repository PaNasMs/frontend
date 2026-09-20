import { DialogContent } from '../shared/ui'
import { useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  mdiShareVariant,
  mdiPencilOutline,
  mdiPlay,
  mdiStop,
  mdiDeleteOutline,
  mdiClose,
  mdiArrowRight,
  mdiCheck,
  mdiLan,
  mdiWifi,
  mdiEyeOutline,
  mdiKeyVariant,
} from '@mdi/js'
import { Button, Icon, Notice } from '../shared/ui'
import { tr } from '../i18n'

export type ShareInterface = {
  name: string
  kind: string
  nmState?: number
  profile: string
  sharingGroup?: string
  sharing?: {
    available: boolean
    ap: boolean
    bands: string[]
    channels?: Record<string, number[]>
    phy?: string
    concurrent?: boolean
  }
}
type AP = { ssid: string; band: string; channel?: number; password?: string }
export type ShareGroup = {
  id: string
  name: string
  source: string
  outputs: string[]
  mode: 'bridge' | 'nat'
  wifi: Record<string, AP>
  enabled: boolean
  autostart: boolean
  bridge: string
  status: 'active' | 'stopped' | 'upstream' | 'error'
  addresses: string[]
}
export type Sharing = { groups: ShareGroup[]; ready: boolean }
export function destinationReason(
  candidate: ShareInterface,
  upstream: ShareInterface,
  interfaces: ShareInterface[],
  outputs: string[],
  groupId?: string,
) {
  if (candidate.sharingGroup && candidate.sharingGroup !== groupId) return 'busy'
  if (!candidate.sharing?.available) return 'unmanaged'
  if (candidate.kind === 'wifi' && (!candidate.sharing.ap || !candidate.sharing.bands.length)) return 'noAP'
  if (
    candidate.sharing.phy &&
    [upstream, ...interfaces.filter((i) => outputs.includes(i.name) && i.name !== candidate.name)].some(
      (i) => i.sharing?.phy === candidate.sharing?.phy,
    )
  )
    return 'sameRadio'
  return ''
}

type Run = (action: string, params: Record<string, unknown>) => Promise<boolean>
export function SharingLayout<T extends ShareInterface>({
  interfaces,
  sharing,
  renderCard,
  busy,
  error,
  run,
}: {
  interfaces: T[]
  sharing: Sharing
  renderCard: (item: T, group?: ShareGroup, actions?: ReactNode) => ReactNode
  busy: boolean
  error: string
  run: Run
}) {
  const [wizard, setWizard] = useState<{ source: string; group?: ShareGroup } | null>(null)
  const [confirm, setConfirm] = useState<{ group: ShareGroup; action: string } | null>(null)
  const groups = sharing.groups
  const hidden = new Set(groups.flatMap((g) => [g.source, ...g.outputs, g.bridge]))
  const card = (name: string, group?: ShareGroup) => {
    const iface = interfaces.find((i) => i.name === name)
    const canShare =
      sharing.ready &&
      iface?.sharing?.available &&
      iface.nmState === 100 &&
      ['ethernet', 'wifi'].includes(iface.kind)
    const actions = group ? (
      <>
        <Button
          title={tr('share.edit')}
          aria-label={tr('share.edit') + ' ' + name}
          disabled={busy || !iface}
          onClick={() => setWizard({ source: name, group })}
        >
          <Icon path={mdiPencilOutline} size={20} />
        </Button>
        <Button
          title={tr(group.enabled ? 'share.stop' : 'share.start')}
          aria-label={tr(group.enabled ? 'share.stop' : 'share.start') + ' ' + name}
          disabled={busy}
          onClick={() => setConfirm({ group, action: group.enabled ? 'stop' : 'start' })}
        >
          <Icon path={group.enabled ? mdiStop : mdiPlay} size={20} />
        </Button>
        <Button
          title={tr('share.delete')}
          aria-label={tr('share.delete') + ' ' + name}
          disabled={busy}
          onClick={() => setConfirm({ group, action: 'delete' })}
        >
          <Icon path={mdiDeleteOutline} size={20} />
        </Button>
      </>
    ) : canShare ? (
      <Button
        title={tr('share.create')}
        aria-label={tr('share.create') + ' ' + name}
        disabled={busy}
        onClick={() => setWizard({ source: name })}
      >
        <Icon path={mdiShareVariant} size={20} />
      </Button>
    ) : null
    return (
      <div key={name} className="network-card-slot">
        {iface ? (
          renderCard(iface, group, actions)
        ) : (
          <article className="network-card">
            <header>
              <strong>{name}</strong>
              <span className="network-card-actions">{actions}</span>
            </header>
            <p>{tr('share.missing')}</p>
          </article>
        )}
      </div>
    )
  }
  return (
    <>
      {!sharing.ready && <Notice>{tr('share.dependencies')}</Notice>}
      <div className="network-grid">
        {groups.map((group) => card(group.source, group))}
        {interfaces.filter((i) => !hidden.has(i.name)).map((i) => card(i.name))}
      </div>
      {wizard && (
        <SharingWizard
          interfaces={interfaces}
          source={wizard.source}
          group={wizard.group}
          busy={busy}
          error={error}
          close={() => setWizard(null)}
          run={run}
        />
      )}
      <Dialog.Root
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent busy={busy} className="settings-dialog share-confirm">
            <Dialog.Title>{confirm && tr('share.' + confirm.action)}</Dialog.Title>
            <Dialog.Description>
              {tr('share.confirmAction', { name: confirm?.group.name })}
            </Dialog.Description>
            {error && <Notice>{error}</Notice>}
            <div className="dialog-actions">
              <Button
                disabled={busy}
                onClick={async () => {
                  if (confirm && (await run('network.share.' + confirm.action, { id: confirm.group.id })))
                    setConfirm(null)
                }}
              >
                {tr('share.confirm')}
              </Button>
              <Button disabled={busy} onClick={() => setConfirm(null)}>
                {tr('share.cancel')}
              </Button>
            </div>
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

function SharingWizard({
  interfaces,
  source,
  group,
  busy,
  error,
  close,
  run,
}: {
  interfaces: ShareInterface[]
  source: string
  group?: ShareGroup
  busy: boolean
  error: string
  close: () => void
  run: Run
}) {
  const upstream = interfaces.find((i) => i.name === source)!
  const [outputs, setOutputs] = useState<string[]>(group?.outputs ?? [])
  const [wifi, setWifi] = useState<Record<string, AP>>(group?.wifi ?? {})
  const [mode, setMode] = useState<'bridge' | 'nat'>(
    group?.mode ?? (upstream.kind === 'ethernet' ? 'bridge' : 'nat'),
  )
  const [name, setName] = useState(group?.name ?? tr('share.defaultName', { name: source }))
  const [autostart, setAutostart] = useState(group?.autostart ?? true)
  const [step, setStep] = useState(0)
  const [showMode, setShowMode] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const destinations = interfaces.filter((i) => i.name !== source && ['ethernet', 'wifi'].includes(i.kind))
  const aps = outputs.filter((name) => interfaces.find((i) => i.name === name)?.kind === 'wifi')
  const apName = aps[step - 1]
  const ap = wifi[apName] ?? { ssid: 'OstojaOS', band: 'bg', password: '' }
  const last = step === aps.length + 1
  const setAP = (value: Partial<AP>) => setWifi({ ...wifi, [apName]: { ...ap, ...value } })
  const allowed = (candidate: ShareInterface) =>
    destinationReason(candidate, upstream, interfaces, outputs, group?.id)

  const valid =
    step === 0
      ? outputs.length > 0 &&
        outputs.every((n) => {
          const i = interfaces.find((i) => i.name === n)
          return i && !allowed(i)
        })
      : last
        ? name.trim().length > 0
        : new TextEncoder().encode(ap.ssid).length > 0 &&
          new TextEncoder().encode(ap.ssid).length <= 32 &&
          ((group?.wifi[apName] && !ap.password) || /^[\x20-\x7E]{8,63}$/.test(ap.password ?? ''))
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) close()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <DialogContent
          busy={busy}
          message={tr('share.applying')}
          hint={tr('share.applyingHint')}
          className="settings-dialog share-wizard"
        >
          <div className="share-wizard-heading">
            <Dialog.Title>{tr(group ? 'share.edit' : 'share.create')}</Dialog.Title>
            <Button
              title={tr('share.cancel')}
              aria-label={tr('share.cancel')}
              disabled={busy}
              onClick={close}
            >
              <Icon path={mdiClose} />
            </Button>
          </div>
          <Dialog.Description>
            {tr('share.step', { current: step + 1, total: aps.length + 2 })} · {source}
          </Dialog.Description>

          <div className="share-wizard-body" aria-busy={busy}>
            {step === 0 ? (
              <>
                <h3>{tr('share.where')}</h3>
                <div className="share-candidates">
                  {destinations.map((i) => {
                    const reason = allowed(i)
                    return (
                      <button
                        key={i.name}
                        className={`share-candidate ${outputs.includes(i.name) ? 'is-selected' : ''}`}
                        aria-pressed={outputs.includes(i.name)}
                        disabled={busy || !!reason}
                        onClick={() => {
                          const next = outputs.includes(i.name)
                            ? outputs.filter((n) => n !== i.name)
                            : [...outputs, i.name]
                          setOutputs(next)
                          if (i.kind === 'wifi' && !wifi[i.name])
                            setWifi({
                              ...wifi,
                              [i.name]: { ssid: 'OstojaOS', password: '', band: i.sharing?.bands[0] ?? 'bg' },
                            })
                        }}
                      >
                        <Icon path={i.kind === 'wifi' ? mdiWifi : mdiLan} />
                        <span>
                          <strong>{i.name}</strong>
                          <small>
                            {reason
                              ? tr('share.reason.' + reason)
                              : i.nmState === 100
                                ? tr('share.replace', { name: i.profile })
                                : tr(i.kind === 'wifi' ? 'share.accessPoint' : 'network.kind.ethernet')}
                          </small>
                        </span>
                        {outputs.includes(i.name) && <Icon path={mdiCheck} />}
                      </button>
                    )
                  })}
                </div>
                {!destinations.length && <Notice>{tr('share.noDestinations')}</Notice>}
              </>
            ) : !last ? (
              <>
                <h3>
                  {tr('share.accessPoint')} · {apName}
                </h3>
                <label className="field">
                  {tr('share.ssid')}
                  <input
                    maxLength={32}
                    value={ap.ssid}
                    onChange={(e) => setAP({ ssid: e.target.value })}
                    disabled={busy}
                  />
                </label>
                <label className="field">
                  {tr('share.password')}
                  <div className="share-password">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={ap.password ?? ''}
                      placeholder={group?.wifi[apName] ? tr('share.keepPassword') : ''}
                      onChange={(e) => setAP({ password: e.target.value })}
                      disabled={busy}
                    />
                    <Button
                      type="button"
                      title={tr('share.showPassword')}
                      aria-label={tr('share.showPassword')}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      <Icon path={mdiEyeOutline} />
                    </Button>
                    <Button
                      title={tr('share.generate')}
                      aria-label={tr('share.generate')}
                      disabled={busy}
                      onClick={() => {
                        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
                        const bytes = crypto.getRandomValues(new Uint8Array(18))
                        setAP({ password: Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('') })
                        setShowPassword(true)
                      }}
                    >
                      <Icon path={mdiKeyVariant} />
                    </Button>
                  </div>
                </label>
                <label className="field">
                  {tr('share.band')}
                  <select value={ap.band} disabled={busy} onChange={(e) => setAP({ band: e.target.value })}>
                    {interfaces
                      .find((i) => i.name === apName)
                      ?.sharing?.bands.map((b) => (
                        <option key={b} value={b}>
                          {tr('share.band.' + b)}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <h3>{tr('share.review')}</h3>
                <div className="share-summary">
                  <strong>{source}</strong>
                  <Icon path={mdiArrowRight} />
                  <span>{outputs.join(' · ')}</span>
                </div>
                <label className="field">
                  {tr('share.name')}
                  <input
                    maxLength={64}
                    value={name}
                    disabled={busy}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <p>{tr('share.mode.' + mode)}</p>
                <p className="small muted">{tr('share.explain.' + mode)}</p>
                {upstream.kind === 'ethernet' ? (
                  <>
                    <button className="text-button" disabled={busy} onClick={() => setShowMode(!showMode)}>
                      {tr('share.changeMode')}
                    </button>
                    {showMode && (
                      <div className="share-mode-options">
                        {(['bridge', 'nat'] as const).map((m) => (
                          <label key={m}>
                            <input
                              type="radio"
                              name="sharing-mode"
                              checked={mode === m}
                              onChange={() => setMode(m)}
                            />
                            {tr('share.mode.' + m)}
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="small muted">{tr('share.wifiBridge')}</p>
                )}
                <label className="network-check">
                  <input
                    type="checkbox"
                    checked={autostart}
                    disabled={busy}
                    onChange={(e) => setAutostart(e.target.checked)}
                  />
                  {tr('share.autostart')}
                </label>
                <Notice>{tr('share.rollbackHint')}</Notice>
              </>
            )}
            {error && <Notice>{error}</Notice>}
          </div>
          <div className="dialog-actions">
            <Button
              disabled={busy || !valid}
              onClick={async () => {
                if (!last) {
                  setStep(step + 1)
                  setShowPassword(false)
                  return
                }
                const success = await run('network.share.save', {
                  ...(group ? { id: group.id } : {}),
                  source,
                  outputs,
                  mode,
                  name,
                  autostart,
                  wifi: Object.fromEntries(aps.map((n) => [n, wifi[n]])),
                })
                if (success) close()
              }}
            >
              {tr(busy ? 'share.applying' : last ? 'share.enable' : 'share.next')}
            </Button>
            {step > 0 && (
              <Button disabled={busy} onClick={() => setStep(step - 1)}>
                {tr('share.back')}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
