import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTypeScript } from './helpers/typescript.mjs'
const { smbNotReady } = loadTypeScript(new URL('../src/app/sharing-access.ts', import.meta.url))
const { luksName } = loadTypeScript(new URL('../src/shared/file-name.ts', import.meta.url))
const directory = {
  users: [
    { username: 'alice', gid: 1000, category: 'user' },
    { username: 'bob', gid: 1001, category: 'user' },
    { username: 'carol', gid: 1500, category: 'user' },
    { username: 'dave', gid: 1003, category: 'user' },
    { username: 'backup', gid: 1500, category: 'service' },
  ],
  groups: [{ name: 'family', gid: 1500, members: ['bob'] }],
}
const accounts = {
  alice: { enabled: true, status: 'ready' },
  bob: { enabled: true, status: 'pending' },
  dave: { enabled: false, status: 'disabled' },
}
test('granted users without synchronized SMB access are listed, including group members', () => {
  const share = { smb: true, readers: ['alice', 'dave'], writers: ['@family'] }
  // carol has no SMB record at all and belongs to the group through her primary GID.
  assert.deepEqual([...smbNotReady(share, accounts, directory)], ['bob', 'carol', 'dave'])
  assert.deepEqual([...smbNotReady({ ...share, writers: [] }, accounts, directory)], ['dave'])
  assert.deepEqual([...smbNotReady({ smb: true, readers: ['alice'], writers: [] }, accounts, directory)], [])
  // Direct grants are judged even before the user list has loaded; groups wait for it.
  assert.deepEqual([...smbNotReady(share, accounts)], ['dave'])
})
test('no SMB notice for NFS-only shares or before the account state is known', () => {
  const share = { smb: false, readers: ['dave'], writers: [] }
  assert.deepEqual([...smbNotReady(share, accounts, directory)], [])
  assert.deepEqual([...smbNotReady({ ...share, smb: true }, undefined, directory)], [])
})
test('unlock dialog proposes a mapper name the backend accepts', () => {
  const valid = /^[a-z_][a-z0-9_-]{0,30}$/
  assert.equal(luksName('/dev/sde'), 'luks-sde')
  assert.equal(luksName('/dev/md127p1'), 'luks-md127p1')
  assert.equal(luksName('/dev/mapper/Data.Vol 1'), 'luks-data-vol-1')
  assert.equal(luksName(''), '')
  for (const device of [
    '/dev/sde',
    '/dev/nvme0n1p3',
    '/dev/mapper/' + 'x'.repeat(60),
    '/dev/disk/by-id/ATA_Disk.1',
  ])
    assert.match(luksName(device), valid, device)
})
