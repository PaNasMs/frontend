import { loadTypeScript } from './helpers/typescript.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { readFile } from 'node:fs/promises'
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
test('connection loss while observing an accepted job is an uncertain result', async () => {
  await assert.rejects(
    waitForJob(async () => {
      throw new Error('offline')
    }),
    /not been confirmed/,
  )
})
