import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTypeScript } from './helpers/typescript.mjs'

const { bundleChanged } = loadTypeScript(new URL('../src/home/freshness.ts', import.meta.url))

test('a reload is wanted only when both bundle names are known and differ', () => {
  assert.equal(bundleChanged('/assets/index-old.js', '/assets/index-new.js'), true)
  assert.equal(bundleChanged('/assets/index-same.js', '/assets/index-same.js'), false)
  assert.equal(bundleChanged('', '/assets/index-new.js'), false)
  assert.equal(bundleChanged('/assets/index-old.js', ''), false)
})
