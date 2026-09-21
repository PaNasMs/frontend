import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTypeScript } from './helpers/typescript.mjs'
const { Button, Icon } = loadTypeScript(new URL('../src/shared/ui.tsx', import.meta.url))
test('an icon-only action keeps its accessible name when title becomes a custom tooltip', () => {
  const html = renderToStaticMarkup(
    createElement(Button, { title: 'Refresh' }, createElement(Icon, { path: 'M0 0' })),
  )
  assert.match(html, /aria-label="Refresh"/)
  assert.match(html, /icon-only/)
})
test('an icon and visible text do not receive the square icon-only layout', () => {
  const html = renderToStaticMarkup(
    createElement(Button, null, createElement(Icon, { path: 'M0 0', key: 'icon' }), 'Refresh'),
  )
  assert.doesNotMatch(html, /icon-only/)
  assert.match(html, /Refresh/)
})
