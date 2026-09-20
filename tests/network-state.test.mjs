import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTypeScript } from './helpers/typescript.mjs'
const { networkStatus } = loadTypeScript(new URL('../src/app/network-state.ts', import.meta.url))
const base = {
  kind: 'ethernet',
  state: 'UP',
  adminUp: true,
  carrier: true,
  managed: true,
  addresses: ['192.168.1.100/24'],
  nmState: 100,
}
const radio = { enabled: true, hardwareEnabled: true, present: true }
for (const [name, patch, state, reason, wifi] of [
  ['LAN without internet checks', {}, 'connected', 'connected'],
  ['cable removed', { carrier: false, nmState: 20 }, 'off', 'noCable'],
  ['cable present without profile', { nmState: 30 }, 'idle', 'cablePresent'],
  ['DHCP in progress', { nmState: 70, addresses: [] }, 'connecting', 'address'],
  ['connection failed', { nmState: 120 }, 'error', 'error'],
  ['connected without address', { addresses: [] }, 'idle', 'noAddress'],
  ['administratively disabled', { adminUp: false, carrier: false, nmState: 30 }, 'off', 'off'],
  ['unmanaged', { managed: false, nmState: 10 }, 'off', 'unmanaged'],
  ['missing NM data', { nmState: undefined, state: 'UNKNOWN' }, 'off', 'unknown'],
  ['loopback', { kind: 'loopback', state: 'UNKNOWN' }, 'connected', 'local'],
  ['Wi-Fi enabled idle', { kind: 'wifi', adminUp: false, nmState: 30 }, 'idle', 'wifi.state.idle', radio],
  ['Wi-Fi radio off', { kind: 'wifi' }, 'off', 'wifi.state.off', { ...radio, enabled: false }],
  [
    'Wi-Fi hardware block',
    { kind: 'wifi' },
    'error',
    'wifi.state.blocked',
    { ...radio, hardwareEnabled: false },
  ],
  ['Wi-Fi disconnecting', { kind: 'wifi', nmState: 110 }, 'connecting', 'disconnecting', radio],
])
  test(name, () => {
    const result = networkStatus({ ...base, ...patch }, wifi)
    assert.equal(result.state, state)
    assert.equal(result.key, reason.startsWith('wifi.') ? reason : 'network.state.' + reason)
  })

test('per-adapter off is independent of the global Wi-Fi switch', () => {
  const result = networkStatus(
    { ...base, kind: 'wifi', managed: false, nmState: 10, wifi: { enabled: false, hardwareEnabled: true } },
    radio,
  )
  assert.equal(result.state, 'off')
  assert.equal(result.key, 'wifi.state.off')
})

test('another adapter hardware block does not mark this adapter blocked', () => {
  const result = networkStatus(
    { ...base, kind: 'wifi', wifi: { enabled: true, hardwareEnabled: true } },
    { ...radio, hardwareEnabled: false },
  )
  assert.equal(result.state, 'connected')
})
