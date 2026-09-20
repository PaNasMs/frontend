import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTypeScript } from './helpers/typescript.mjs'
const { WaitingSurface } = loadTypeScript(new URL('../src/shared/waiting.tsx', import.meta.url))
test('waiting preserves form content and exposes message separately from elapsed announcements', () => {
  const html = renderToStaticMarkup(
    createElement(
      WaitingSurface,
      { busy: true, message: 'Applying network settings', hint: 'Restoring is available on failure' },
      createElement('button', null, 'Apply'),
    ),
  )
  assert.match(html, /<button>Apply<\/button>/)
  assert.match(html, /role="status" aria-live="polite"/)
  assert.match(html, /Applying network settings/)
  assert.match(html, /Restoring is available on failure/)
  assert.match(html, /aria-live="off"/)
})
test('completed or failed operation leaves no blocking overlay', () => {
  const html = renderToStaticMarkup(
    createElement(WaitingSurface, { busy: false }, createElement('button', null, 'Retry')),
  )
  assert.doesNotMatch(html, /waiting-overlay|role="status"/)
  assert.match(html, /Retry/)
})
