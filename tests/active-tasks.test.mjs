import { translations } from './helpers/typescript.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const exports = {}
const code = ts.transpileModule(
  readFileSync(new URL('../src/app/active-tasks.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText
vm.runInNewContext(code, { exports, require: () => translations })
const array = {
  uuid: 'uuid',
  device: '/dev/md127',
  name: 'disk',
  level: 'raid5',
  sync: 'reshape',
  syncPercent: 51.4,
  reshapePending: true,
  syncRemaining: 3600,
}
let tasks = exports.raidTasks([array])
assert.equal(tasks.length, 1)
assert.equal(tasks[0].percent, 51.4)
assert.equal(tasks[0].paused, false)
assert.equal(tasks[0].stage, 'About 60 min remaining')
for (const sync of ['idle', 'frozen']) {
  const task = exports.raidTasks([{ ...array, sync }])[0]
  assert.equal(task.paused, true)
  assert.equal(task.id, tasks[0].id)
}
assert.equal(exports.raidTasks([{ ...array, sync: 'idle', reshapePending: false }]).length, 0)
assert.equal(
  exports.raidTasks([{ ...array, sync: 'resync', reshapePending: false, syncPercent: undefined }])[0].percent,
  undefined,
)
assert.equal(exports.raidTasks([array, { ...array, uuid: 'second' }]).length, 2)
const job = {
  id: 'job',
  action: 'file.copy',
  status: 'running',
  created: new Date(1000).toISOString(),
  target: '/home/a',
  stage: 'Копирование',
}
assert.equal(exports.longJobs([job], 5000, {}).length, 0)
assert.equal(exports.longJobs([job], 12000, { 'file.copy': { label: 'Копировать' } })[0].title, 'Копировать')
for (const status of ['queued', 'succeeded', 'failed', 'cancelled'])
  assert.equal(exports.longJobs([{ ...job, status }], 12000, {}).length, 0)
console.log('External RAID activity, pause, completion and long-running job selection passed')
