import assert from 'node:assert/strict'
import { loadTypeScript } from './helpers/typescript.mjs'

const { volumeMount, volumeMountPoint } = loadTypeScript(
  new URL('../src/app/storage-mount-state.ts', import.meta.url),
)
const device = { path: '/dev/sdf1', mountpoints: [] }
const mount = { source: '/dev/sdf1', target: '/srv/sdf1', fstype: 'btrfs' }
assert.equal(volumeMountPoint(device, [mount]), '/srv/sdf1')
assert.equal(volumeMount(device, [mount]), mount)
assert.equal(volumeMountPoint(device, []), '')
assert.equal(volumeMountPoint(device, [{ ...mount, source: '/dev/sdg1' }]), '')
assert.equal(volumeMountPoint({ ...device, mountpoints: ['/old'] }, [mount]), '/srv/sdf1')
assert.equal(volumeMountPoint({ ...device, mountpoints: [null, '/srv/sdf1'] }, []), '/srv/sdf1')
assert.equal(
  volumeMount({ ...device, mountpoints: ['/srv/sdf1'] }, [{ ...mount, source: 'UUID=test' }])?.target,
  '/srv/sdf1',
)
