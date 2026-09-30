import { loadTypeScript } from './helpers/typescript.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const { waitForJob } = loadTypeScript(new URL('../src/shared/job-completion.ts', import.meta.url))
test('waits for queued and running job before success', async () => {
  const statuses = ['queued', 'running', 'succeeded']
  let reads = 0,
    pauses = 0
  await waitForJob(
    async () => ({ status: statuses[reads++], stage: '' }),
    async () => {
      pauses++
    },
  )
  assert.equal(reads, 3)
  assert.equal(pauses, 2)
})
test('keeps the actual operation error', async () => {
  await assert.rejects(
    waitForJob(async () => ({ status: 'failed', stage: 'Ошибка', result: { error: 'Timer unavailable' } })),
    /Timer unavailable/,
  )
})
test('does not treat missing job as completion', async () => {
  let reads = 0
  await assert.rejects(
    waitForJob(
      async () => {
        reads++
        return undefined
      },
      async () => {},
    ),
    /not been confirmed/,
  )
  assert.equal(reads, 120)
})
test('a hung status read releases the blocking wait without claiming failure', async () => {
  await assert.rejects(
    waitForJob(
      () => new Promise(() => {}),
      async () => {},
      120,
      5,
    ),
    /not been confirmed/,
  )
})
test('retries temporary connection loss and missing status until success', async () => {
  const results = [
    new Error('offline'),
    { status: 502 },
    undefined,
    { status: 408 },
    { status: 429 },
    { status: 'running', stage: '' },
    { status: 'succeeded', stage: '' },
  ]
  let reads = 0,
    pauses = 0
  await waitForJob(
    async () => {
      const result = results[reads++]
      if (result instanceof Error || typeof result?.status === 'number') throw result
      return result
    },
    async () => {
      pauses++
    },
  )
  assert.equal(reads, results.length)
  assert.equal(pauses, results.length - 1)
})
test('persistent connection loss exhausts its budget without claiming task failure', async () => {
  let reads = 0
  await assert.rejects(
    waitForJob(
      async () => {
        reads++
        throw new Error('offline')
      },
      async () => {},
      3,
    ),
    /not been confirmed/,
  )
  assert.equal(reads, 3)
})
test('authorization errors stop observation without retrying or claiming task failure', async () => {
  let reads = 0
  await assert.rejects(
    waitForJob(
      async () => {
        reads++
        throw { status: 403 }
      },
      async () => {},
    ),
    /not been confirmed/,
  )
  assert.equal(reads, 1)
})
test('terminal results after reconnection are not swallowed', async () => {
  for (const status of ['failed', 'cancelled', 'interrupted']) {
    let reads = 0
    await assert.rejects(
      waitForJob(
        async () => {
          if (!reads++) throw new Error('offline')
          return { status, stage: 'Stopped by server' }
        },
        async () => {},
      ),
      /Stopped by server/,
    )
    assert.equal(reads, 2)
  }
})

function clockedWait() {
  const module = { exports: {} }
  let now = 0,
    deadline,
    scheduled,
    cleared = false
  const source = readFileSync(new URL('../src/shared/job-completion.ts', import.meta.url), 'utf8')
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: () => ({ tr: () => 'The operation has not been confirmed' }),
      setTimeout: (callback, ms) => {
        deadline = now + ms
        scheduled = callback
        return 1
      },
      clearTimeout: () => {
        scheduled = undefined
        cleared = true
      },
    },
  )
  return {
    wait: module.exports.waitForJob,
    time: () => now,
    deadline: () => deadline,
    cleared: () => cleared,
    advance: (ms) => {
      now += ms
      if (scheduled && now >= deadline) {
        const fn = scheduled
        scheduled = undefined
        fn()
      }
    },
  }
}
test('a five-minute job with a long budget survives the former 65-second cutoff', async () => {
  const clock = clockedWait()
  let reads = 0
  await clock.wait(
    async () => {
      reads++
      if (clock.time() >= 70000 && clock.time() < 75000) throw new Error('temporary disconnection')
      return { status: clock.time() >= 300000 ? 'succeeded' : 'running', stage: '' }
    },
    async () => clock.advance(500),
    3600,
  )
  assert.equal(clock.time(), 300000)
  assert.equal(reads, 601)
  assert.equal(clock.cleared(), true)
})
test('default deadlines follow each caller budget and explicit deadlines take precedence', async () => {
  for (const [attempts, explicit, expected] of [
    [120, undefined, 65000],
    [3600, undefined, 1805000],
    [14400, undefined, 7205000],
    [14400, 1000, 1000],
  ]) {
    const clock = clockedWait()
    let resolveRead,
      reads = 0
    const waiting = clock.wait(
      () => {
        reads++
        return new Promise((resolve) => {
          resolveRead = resolve
        })
      },
      async () => {},
      attempts,
      explicit,
    )
    const rejected = assert.rejects(waiting, /not been confirmed/)
    assert.equal(clock.deadline(), expected)
    clock.advance(expected)
    await rejected
    assert.equal(clock.cleared(), true)
    resolveRead({ status: 'succeeded', stage: '' })
    await Promise.resolve()
    assert.equal(reads, 1)
  }
})
