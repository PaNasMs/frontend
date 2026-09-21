import { loadTypeScript } from './helpers/typescript.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
const { reconcileSubmission } = loadTypeScript(
  new URL('../src/shared/operation-submission.ts', import.meta.url),
)
test('lost submission response recovers the accepted job without submitting twice', async () => {
  let writes = 0
  const job = { id: 'original-operation', status: 'running' }
  const result = await reconcileSubmission(
    async () => {
      writes++
      throw new Error('network')
    },
    async () => job,
    () => true,
  )
  assert.equal(result, job)
  assert.equal(writes, 1)
})
test('validation failures do not query or replay work', async () => {
  const error = new Error('invalid target')
  await assert.rejects(
    reconcileSubmission(
      async () => {
        throw error
      },
      async () => {
        assert.fail('unexpected lookup')
      },
      () => false,
    ),
    (e) => e === error,
  )
})
test('missing or unavailable reconciliation preserves the uncertain result', async () => {
  const error = new Error('timeout')
  for (const lookup of [
    async () => undefined,
    async () => {
      throw new Error('offline')
    },
  ]) {
    await assert.rejects(
      reconcileSubmission(
        async () => {
          throw error
        },
        lookup,
        () => true,
      ),
      (e) => e === error,
    )
  }
})
