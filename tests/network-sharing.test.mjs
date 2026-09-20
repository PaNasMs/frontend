import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTypeScript } from './helpers/typescript.mjs'
const { destinationReason } = loadTypeScript(new URL('../src/app/network-sharing.tsx', import.meta.url))
const ethernet = { name: 'eth1', kind: 'ethernet', sharing: { available: true, ap: false, bands: [] } }
const wifi = {
  name: 'wlan1',
  kind: 'wifi',
  sharing: { available: true, ap: true, bands: ['bg'], phy: 'phy1' },
}
const source = { name: 'wlan0', kind: 'wifi', sharing: { available: true, phy: 'phy0' } }
test('mixed Ethernet and separate Wi-Fi adapters are allowed', () => {
  assert.equal(destinationReason(ethernet, source, [ethernet, wifi], ['wlan1']), '')
  assert.equal(destinationReason(wifi, source, [ethernet, wifi], ['eth1']), '')
})
test('virtual interfaces sharing a radio are not mistaken for independent hardware', () => {
  assert.equal(
    destinationReason({ ...wifi, sharing: { ...wifi.sharing, phy: 'phy0' } }, source, [], []),
    'sameRadio',
  )
  const second = { ...wifi, name: 'wlan2' }
  assert.equal(destinationReason(second, source, [wifi, second], ['wlan1']), 'sameRadio')
})
test('owned and unsupported destinations explain why they cannot be selected', () => {
  assert.equal(destinationReason({ ...ethernet, sharingGroup: 'other' }, source, [], []), 'busy')
  assert.equal(destinationReason({ ...ethernet, sharingGroup: 'own' }, source, [], [], 'own'), '')
  assert.equal(
    destinationReason({ ...wifi, sharing: { ...wifi.sharing, ap: false } }, source, [], []),
    'noAP',
  )
})

test('sharing renders one source card and free interfaces without duplicate recipients or bridge', async () => {
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { SharingLayout } = loadTypeScript(new URL('../src/app/network-sharing.tsx', import.meta.url))
  const calls = []
  renderToStaticMarkup(createElement(SharingLayout, {
    interfaces: [source, ethernet, wifi, { name: 'osbr0', kind: 'bridge' }, { name: 'eth2', kind: 'ethernet' }],
    sharing: { ready: true, groups: [{ id: 'test', source: 'wlan0', outputs: ['eth1', 'wlan1'], bridge: 'osbr0', enabled: true }] },
    renderCard: (item, group) => { calls.push([item.name, group?.id]); return createElement('article', null, item.name) },
    busy: false, error: '', run: async () => true,
  }))
  assert.deepEqual(calls, [['wlan0', 'test'], ['eth2', undefined]])
})

test('share action belongs only to connected eligible source cards without selection controls', async () => {
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { SharingLayout } = loadTypeScript(new URL('../src/app/network-sharing.tsx', import.meta.url))
  const html = renderToStaticMarkup(createElement(SharingLayout, {
    interfaces: [{ ...source, nmState: 100 }, { ...ethernet, nmState: 20 }, { ...wifi, nmState: 30 }],
    sharing: { ready: true, groups: [] },
    renderCard: (item, group, actions) => createElement('article', { 'data-interface': item.name }, actions),
    busy: false, error: '', run: async () => true,
  }))
  assert.match(html, /aria-label="Share connection wlan0"/)
  assert.equal((html.match(/<button/g) || []).length, 1)
  assert.doesNotMatch(html, /aria-pressed|network-card-select|network-selection-actions/)
})
