import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTypeScript } from './helpers/typescript.mjs'
const { connectionNetwork } = loadTypeScript(new URL('../src/app/network-details.ts', import.meta.url))
const source = { name: 'eth0', addresses: [] }
const port = { name: 'wlan0', addresses: [] }
const bridge = { name: 'osbr123', addresses: ['192.168.1.100/24'], dns: ['192.168.1.1'] }
const group = { source: source.name, outputs: [port.name], bridge: bridge.name, mode: 'bridge' }
test('bridge source and AP ports expose shared IP and DNS', () => {
  for (const item of [source, port]) assert.equal(connectionNetwork(item, [source, port, bridge], [group]), bridge)
})
test('NAT uplink retains its own address and outputs use the downstream bridge', () => {
  const nat = { ...group, mode: 'nat' }
  assert.equal(connectionNetwork(source, [source, port, bridge], [nat]), source)
  assert.equal(connectionNetwork(port, [source, port, bridge], [nat]), bridge)
})
test('missing bridge does not substitute another interface', () => {
  assert.equal(connectionNetwork(source, [source, port], [group]), source)
})
