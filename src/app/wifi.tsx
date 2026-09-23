import { DialogContent } from '../shared/ui'
import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { mdiWifi, mdiRefresh, mdiPlus, mdiLink, mdiLinkOff, mdiLockOutline, mdiClose } from '@mdi/js'
import { Button, Icon, Notice } from '../shared/ui'
import { tr } from '../i18n'

export type WifiNetwork = {
  id: string
  ssid: string
  ssidHex: string
  security: string
  signal: number
  frequency: number
}
export type WifiData = {
  enabled?: boolean
  hardwareEnabled?: boolean
  mode?: number
  clients?: number
  networks: WifiNetwork[]
  saved: { uuid: string; name: string; ssid: string }[]
  activeAP: string
}
export type WifiRadio = { present: boolean; enabled: boolean; hardwareEnabled: boolean }

type Run = (action: string, params: Record<string, unknown>) => Promise<boolean>

export function WifiControls({
  name,
  wifi,
  radio,
  connected,
  disabled,
  run,
  error,
  sharing = false,
  busy = false,
}: {
  name: string
  wifi: WifiData
  radio: WifiRadio
  connected: boolean
  disabled: boolean
  run: Run
  error: string
  sharing?: boolean
  busy?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<WifiNetwork | 'hidden' | null>(null)
  const [ssid, setSsid] = useState('')
  const [security, setSecurity] = useState('wpa2')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState<'radio' | 'disconnect' | null>(null)
  const enabled = wifi.enabled ?? radio.enabled
  const hardwareEnabled = wifi.hardwareEnabled ?? radio.hardwareEnabled
  const available = enabled && hardwareEnabled
  const networks = wifi.networks.filter(
    (item, index, all) =>
      all.findIndex((other) => other.ssidHex === item.ssidHex && other.security === item.security) === index,
  )
  const kind = choice === 'hidden' ? security : choice?.security
  const close = () => {
    setOpen(false)
    setChoice(null)
    setPassword('')
  }
  async function connect() {
    const params =
      choice === 'hidden'
        ? { interface: name, ssid, security, password }
        : { interface: name, accessPoint: choice?.id, ssidHex: choice?.ssidHex, password }
    try {
      if (await run('network.wifi.connect', params)) close()
    } finally {
      setPassword('')
    }
  }
  return (
    <>
      {!sharing && (
        <Button
          title={tr('wifi.networks')}
          aria-label={tr('wifi.networks') + ' ' + name}
          disabled={disabled || !available}
          onClick={() => {
            setChoice(null)
            setOpen(true)
          }}
        >
          <Icon path={mdiWifi} size={20} />
        </Button>
      )}
      {!sharing && connected && (
        <Button
          title={tr('wifi.disconnect')}
          aria-label={tr('wifi.disconnect') + ' ' + name}
          disabled={disabled}
          onClick={() => setConfirm('disconnect')}
        >
          <Icon path={mdiLinkOff} size={20} />
        </Button>
      )}
      <span className="wifi-labeled-control">
        <span>Wi-Fi</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          className="wifi-radio-switch"
          title={tr(enabled ? 'wifi.turnOff' : 'wifi.turnOn')}
          aria-label={'Wi-Fi · ' + name}
          disabled={disabled || (!enabled && !hardwareEnabled)}
          onClick={() => setConfirm('radio')}
        >
          <span className="wifi-radio-thumb" />
        </button>
      </span>
      <Dialog.Root
        open={open && !confirm}
        onOpenChange={(value) => {
          if (!disabled && !value) close()
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent
            busy={busy}
            className="settings-dialog wifi-dialog"
            header={
              <>
                {' '}
                <Dialog.Title>
                  {choice ? (choice === 'hidden' ? tr('wifi.hidden') : choice.ssid) : tr('wifi.networks')} ·{' '}
                  {name}
                </Dialog.Title>
                <Dialog.Description>{tr('wifi.connectHint')}</Dialog.Description>{' '}
              </>
            }
            variant="form"
            intent="edit"
            footer={
              <div className="actions">
                <Button form="modal-wifi" disabled={disabled}>
                  {tr('wifi.connect')}
                </Button>
                <Button
                  form="modal-wifi"
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setChoice(null)
                    setPassword('')
                  }}
                >
                  {tr('homes.cancel')}
                </Button>
              </div>
            }
          >
            {error && <Notice error>{error}</Notice>}
            {!choice ? (
              <>
                <div className="actions">
                  <Button
                    title={tr('wifi.scan')}
                    aria-label={tr('wifi.scan')}
                    disabled={disabled}
                    onClick={() => void run('network.wifi.scan', { interface: name })}
                  >
                    <Icon path={mdiRefresh} />
                  </Button>
                  <Button
                    title={tr('wifi.hidden')}
                    aria-label={tr('wifi.hidden')}
                    disabled={disabled}
                    onClick={() => {
                      setChoice('hidden')
                      setSsid('')
                      setSecurity('wpa2')
                      setPassword('')
                    }}
                  >
                    <Icon path={mdiPlus} />
                  </Button>
                </div>
                {wifi.saved.length > 0 && (
                  <>
                    <h3>{tr('wifi.saved')}</h3>
                    <div className="wifi-list">
                      {wifi.saved.map((saved) => (
                        <button
                          type="button"
                          key={saved.uuid}
                          disabled={disabled}
                          className="wifi-row"
                          onClick={async () => {
                            if (
                              await run('network.wifi.connect', { interface: name, connection: saved.uuid })
                            )
                              close()
                          }}
                        >
                          <Icon path={mdiLink} />
                          <span>
                            {saved.name}
                            <small>{saved.ssid}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <h3>{tr('wifi.available')}</h3>
                <div className="wifi-list">
                  {networks.map((item) => (
                    <button
                      type="button"
                      className="wifi-row"
                      key={item.id}
                      disabled={disabled || !['open', 'owe', 'wpa2', 'wpa3'].includes(item.security)}
                      onClick={() => {
                        setChoice(item)
                        setPassword('')
                      }}
                    >
                      <Icon path={item.security === 'open' ? mdiWifi : mdiLockOutline} />
                      <span>
                        {item.ssid}
                        <small>
                          {tr('wifi.security.' + item.security)} · {(item.frequency / 1000).toFixed(1)} GHz
                        </small>
                      </span>
                      <strong title={tr('wifi.signal')}>{item.signal}%</strong>
                    </button>
                  ))}
                </div>
                {!networks.length && <p className="muted">{tr('wifi.empty')}</p>}
              </>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void connect()
                }}
                id="modal-wifi"
              >
                {choice === 'hidden' && (
                  <>
                    <label className="field">
                      SSID
                      <input
                        required
                        maxLength={32}
                        value={ssid}
                        disabled={disabled}
                        onChange={(event) => setSsid(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      {tr('wifi.security')}
                      <select
                        value={security}
                        disabled={disabled}
                        onChange={(event) => {
                          setSecurity(event.target.value)
                          setPassword('')
                        }}
                      >
                        {['wpa2', 'wpa3', 'open', 'owe'].map((value) => (
                          <option key={value} value={value}>
                            {tr('wifi.security.' + value)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {['wpa2', 'wpa3'].includes(kind ?? '') && (
                  <label className="field">
                    {tr('wifi.password')}
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      value={password}
                      disabled={disabled}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                )}
              </form>
            )}
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={!!confirm}
        onOpenChange={(value) => {
          if (!value && !disabled) setConfirm(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent
            busy={busy}
            className="settings-dialog wifi-confirm"
            header={
              <>
                {' '}
                <Dialog.Title>
                  {tr(
                    confirm === 'disconnect' ? 'wifi.disconnect' : enabled ? 'wifi.turnOff' : 'wifi.turnOn',
                  )}{' '}
                  · {name}
                </Dialog.Title>
                <Dialog.Description>
                  {tr(
                    confirm === 'radio'
                      ? sharing && enabled
                        ? 'wifi.sharingOffHint'
                        : 'wifi.radioHint'
                      : 'wifi.disconnectHint',
                  )}
                </Dialog.Description>{' '}
              </>
            }
            footer={
              <div className="actions">
                <Dialog.Close asChild>
                  <Button disabled={disabled} data-dialog-cancel>
                    {tr('homes.cancel')}
                  </Button>
                </Dialog.Close>
                <Button
                  disabled={disabled}
                  onClick={async () => {
                    const action = confirm === 'disconnect' ? 'network.wifi.disconnect' : 'network.wifi.radio'
                    if (
                      await run(action, {
                        interface: name,
                        ...(confirm === 'radio' ? { enabled: !enabled } : {}),
                      })
                    )
                      setConfirm(null)
                  }}
                >
                  {tr('wifi.apply')}
                </Button>
              </div>
            }
            variant="compact"
            intent="confirm"
            dirty={false}
          >
            {error && <Notice error>{error}</Notice>}
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
