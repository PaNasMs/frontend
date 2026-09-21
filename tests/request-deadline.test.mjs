import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import ts from 'typescript'
import { readFileSync } from 'node:fs'
function client(fetch) {
  const module = { exports: {} }
  let expired,
    cleared = false
  const source = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    fetch,
    AbortController,
    setTimeout: (fn) => {
      expired = fn
      return 1
    },
    clearTimeout: () => {
      cleared = true
    },
    require: () => ({ tr: (key) => key, serverText: (text) => text, localizeResponse: (data) => data }),
  })
  return { ...module.exports, expire: () => expired(), cleared: () => cleared }
}
test('a hung request stops waiting with an uncertain-result error', async () => {
  let signal
  const c = client(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        signal = options.signal
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      }),
  )
  const promise = c.request('manage?view=run', 'POST', { id: 'stable-operation' })
  c.expire()
  await assert.rejects(promise, (error) => error.status === 408 && error.message === 'ui.timeout')
  assert.equal(signal.aborted, true)
  assert.equal(c.cleared(), true)
})
test('completed reads preserve data and clear the deadline', async () => {
  const c = client(async () => ({ ok: true, status: 200, json: async () => ({ value: 7 }) }))
  assert.equal((await c.request('metrics')).value, 7)
  assert.equal(c.cleared(), true)
})
