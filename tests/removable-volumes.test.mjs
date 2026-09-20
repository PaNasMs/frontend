import { translations } from './helpers/typescript.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const calls = []
let devices = []
let failed = false
let needsChoice = false
const exports = {}
const code = ts.transpileModule(readFileSync(new URL('../src/app/removable.tsx', import.meta.url), 'utf8'), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText
vm.runInNewContext(code, {
  exports,
  require: (name) =>
    name === './operations'
      ? {
          managed: async (mode, params) => {
            calls.push(mode)
            if (mode === 'storage-options') return { devices }
            if (mode === 'plan') return { fingerprint: 'f', confirmation: 'c' }
            if (mode === 'run') return { id: '1' }
            return [
              {
                id: '1',
                status: failed ? 'failed' : 'succeeded',
                stage: 'Mount failed',
                result: needsChoice
                  ? { needsChoice: true, reason: 'FAT errors', repairAvailable: true }
                  : { point: devices[1]?.mountpoints?.[0] || '/mnt/usb/a' },
              },
            ]
          },
        }
      : name.includes('job-completion')
        ? {
            waitForJob: async (read) => {
              if ((await read()).status !== 'succeeded') throw Error('Mount failed')
            },
          }
        : name === './dashboard'
          ? { newID: () => '1' }
          : name.includes('i18n')
            ? translations
            : {},
})
const disk = { path: '/dev/sde', type: 'disk', name: 'sde' }
const volume = {
  path: '/dev/sde1',
  parent: disk.path,
  type: 'part',
  name: 'sde1',
  fstype: 'vfat',
  uuid: 'a',
  mountpoints: [],
}
devices = [disk, volume]
assert.equal(exports.singleVolume(disk, devices), volume)
assert.equal(exports.singleVolume(disk, [...devices, { ...volume, path: '/dev/sde2' }]), undefined)
const first = exports.openVolume(volume)
assert.equal(exports.openVolume(volume), first)
assert.equal(await first, '/mnt/usb/a')
assert.equal(calls.filter((c) => c === 'run').length, 1)
calls.length = 0
volume.mountpoints = ['/mnt/already']
assert.equal(await exports.openVolume(volume), '/mnt/already')
assert.equal(calls.filter((c) => c === 'run').length, 1)
volume.mountpoints = []
needsChoice = true
await assert.rejects(
  exports.openVolume(volume),
  (error) => error instanceof exports.VolumeChoice && error.repairAvailable,
)
needsChoice = false
failed = true
await assert.rejects(exports.openVolume(volume), /Mount failed/)
failed = false
devices = []
await assert.rejects(exports.openVolume(volume), /disconnected/)
console.log(
  'Removable volumes: single/multiple partitions, mount completion, duplicate clicks, mounted shortcut, failure and disconnect passed',
)
