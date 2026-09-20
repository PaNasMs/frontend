import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { mdiCheck, mdiClose } from '@mdi/js'
import { Button, DialogContent, Icon, Notice } from '../shared/ui'
import { tr } from '../i18n'
import type { ShareGroup, ShareInterface } from './network-sharing'
import { WifiControls, type WifiData, type WifiRadio } from './wifi'
export function AccessPointDialog({
  name,
  group,
  iface,
  radio,
  busy,
  disabled,
  error,
  run,
  close,
}: {
  name: string
  group: ShareGroup
  iface: ShareInterface & { wifi?: WifiData }
  radio?: WifiRadio
  busy: boolean
  disabled: boolean
  error: string
  run: (action: string, params: Record<string, unknown>) => Promise<boolean>
  close: () => void
}) {
  const original = group.wifi[name]
  const [ssid, setSSID] = useState(original.ssid)
  const [band, setBand] = useState(original.band)
  const [channel, setChannel] = useState(original.channel ?? 0)
  const [password, setPassword] = useState('')
  const channels = iface.sharing?.channels?.[band] ?? []
  const valid =
    new TextEncoder().encode(ssid).length >= 1 &&
    new TextEncoder().encode(ssid).length <= 32 &&
    (!password || /^[\x20-\x7E]{8,63}$/.test(password)) &&
    (channel === 0 || channels.includes(channel))
  const dirty =
    ssid !== original.ssid || band !== original.band || channel !== (original.channel ?? 0) || !!password
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
          className="settings-dialog network-details-dialog"
          busy={busy}
          message={tr('share.applying')}
          hint={tr('share.applyingHint')}
        >
          <div className="share-wizard-heading">
            <Dialog.Title>
              {tr('network.wifiSettings')} · {name}
            </Dialog.Title>
            <Button
              title={tr('share.cancel')}
              aria-label={tr('share.cancel')}
              disabled={busy}
              onClick={close}
            >
              <Icon path={mdiClose} />
            </Button>
          </div>
          <Dialog.Description hidden>{tr('network.wifiSettings')} · {name}</Dialog.Description>
          {iface.wifi && radio && (
            <div className="network-ap-radio">
              <WifiControls
                name={name}
                wifi={iface.wifi}
                radio={radio}
                connected={iface.nmState === 100}
                disabled={busy || disabled}
                busy={busy}
                run={run}
                error={error}
                sharing
              />
              <span>{tr((iface.wifi.enabled ?? radio.enabled) ? 'wifi.state.on' : 'wifi.state.off')}</span>
            </div>
          )}
          {error && <Notice error>{error}</Notice>}
          <form
            className="network-ap-form"
            onSubmit={async (event) => {
              event.preventDefault()
              try {
                if (
                  await run('network.share.wifi', {
                    id: group.id,
                    interface: name,
                    wifi: { ssid, band, channel, password },
                  })
                )
                  close()
              } finally {
                setPassword('')
              }
            }}
          >
            <label className="field">
              SSID
              <input
                value={ssid}
                disabled={busy || disabled}
                onChange={(event) => setSSID(event.target.value)}
              />
            </label>
            <label className="field">
              {tr('share.band')}
              <select
                value={band}
                disabled={busy || disabled}
                onChange={(event) => {
                  setBand(event.target.value)
                  setChannel(0)
                }}
              >
                {iface.sharing?.bands.map((value) => (
                  <option value={value} key={value}>
                    {tr('share.band.' + value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {tr('share.channel')}
              <select
                value={channel}
                disabled={busy || disabled}
                onChange={(event) => setChannel(Number(event.target.value))}
              >
                <option value={0}>{tr('network.channelAuto')}</option>
                {channels.map((value) => (
                  <option value={value} key={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {tr('wifi.password')}
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                placeholder={tr('network.keepPassword')}
                disabled={busy || disabled}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <dl>
              <dt>{tr('wifi.security')}</dt>
              <dd>WPA2-Personal (PSK)</dd>
              <dt>{tr('share.clientCount')}</dt>
              <dd>{iface.wifi?.clients ?? '—'}</dd>
            </dl>
            {group.enabled && <p className="small muted">{tr('network.apApplyHint')}</p>}
            <div className="actions">
              <Button
                type="submit"
                title={tr('network.apply')}
                aria-label={tr('network.apply')}
                disabled={busy || disabled || !valid || !dirty}
              >
                <Icon path={mdiCheck} />
              </Button>
              <Button
                type="button"
                title={tr('share.cancel')}
                aria-label={tr('share.cancel')}
                disabled={busy}
                onClick={close}
              >
                <Icon path={mdiClose} />
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
