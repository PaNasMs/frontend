import {
  mdiLan,
  mdiLanDisconnect,
  mdiEthernetCableOff,
  mdiAlertCircleOutline,
  mdiWifi,
  mdiWifiOff,
  mdiWifiAlert,
  mdiWifiStrength1,
  mdiWifiStrength2,
  mdiWifiStrength3,
  mdiWifiStrength4,
} from '@mdi/js'
import { tr } from '../i18n'
import type { WifiData, WifiRadio } from './wifi'
type NetworkInterface = {
  kind: string
  state: string
  adminUp?: boolean
  carrier?: boolean
  managed?: boolean
  nmState?: number
  sharingPort?: boolean
  addresses: string[]
  wifi?: WifiData
}
type Tone = 'off' | 'idle' | 'connected' | 'connecting' | 'error'
export function networkStatus(
  item: NetworkInterface,
  radio?: WifiRadio | null,
): { state: Tone; key: string } {
  const status = (state: Tone, reason: string) => ({ state, key: 'network.state.' + reason })
  if (item.kind === 'wifi' && radio) {
    if (!(item.wifi?.hardwareEnabled ?? radio.hardwareEnabled))
      return { state: 'error', key: 'wifi.state.blocked' }
    if (!(item.wifi?.enabled ?? radio.enabled)) return { state: 'off', key: 'wifi.state.off' }
  }
  const nm = item.nmState
  if (nm === 120) return status('error', 'error')
  if (nm === 110) return status('connecting', 'disconnecting')
  if (nm != null && nm >= 40 && nm <= 90)
    return status('connecting', nm === 70 ? 'address' : nm === 60 ? 'authentication' : 'connecting')
  if (item.kind === 'ethernet' && item.carrier === false && item.adminUp !== false)
    return status('off', 'noCable')
  if (nm === 100) {
    if (item.addresses.length === 0 && !item.sharingPort) return status('idle', 'noAddress')
    return status('connected', item.kind === 'loopback' ? 'local' : 'connected')
  }
  if (item.managed === false || nm === 10) return status('off', 'unmanaged')
  if (item.kind === 'wifi' && radio?.enabled && nm === 30) return { state: 'idle', key: 'wifi.state.idle' }
  if (item.adminUp === false) return status('off', 'off')
  if (item.kind === 'ethernet' && item.carrier === false) return status('off', 'noCable')
  if (nm === 20) return status('off', 'unavailable')
  if (nm === 30) return status('idle', item.carrier === true ? 'cablePresent' : 'idle')
  if (nm == null && item.adminUp && (item.state === 'UP' || item.kind === 'loopback'))
    return status(
      item.addresses.length ? 'connected' : 'idle',
      item.addresses.length ? (item.kind === 'loopback' ? 'local' : 'connected') : 'noAddress',
    )
  return status('off', 'unknown')
}
export function networkAppearance(item: NetworkInterface, radio?: WifiRadio | null) {
  const status = networkStatus(item, radio)
  let icon =
    status.state === 'error'
      ? mdiAlertCircleOutline
      : status.key === 'network.state.noCable'
        ? mdiEthernetCableOff
        : status.state === 'off'
          ? mdiLanDisconnect
          : mdiLan
  if (item.kind === 'wifi') {
    const signal = item.wifi?.networks.find((ap) => ap.id === item.wifi?.activeAP)?.signal
    icon =
      status.state === 'off'
        ? mdiWifiOff
        : status.state === 'error'
          ? mdiWifiAlert
          : status.state === 'connected' && signal != null
            ? signal < 25
              ? mdiWifiStrength1
              : signal < 50
                ? mdiWifiStrength2
                : signal < 75
                  ? mdiWifiStrength3
                  : mdiWifiStrength4
            : mdiWifi
  }
  return { ...status, icon, title: tr(status.key) }
}
