import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTypeScript } from './helpers/typescript.mjs'
const { validFileName, baseName, siblingPath, stemLength, restoreDestination } = loadTypeScript(
  new URL('../src/shared/file-name.ts', import.meta.url),
)
const { sessionTime } = loadTypeScript(new URL('../src/shared/session-time.ts', import.meta.url))
test('rename accepts one path component and composes a destination in the same folder', () => {
  for (const name of ['blob.bin', '.hidden', 'Отчёт 2026.pdf', 'я'.repeat(127)])
    assert.ok(validFileName(name), name)
  for (const name of ['', ' a', 'a ', 'a/b', '.', '..', 'a\nb', 'a\x7f', 'я'.repeat(128)])
    assert.ok(!validFileName(name), JSON.stringify(name))
  assert.equal(baseName('/home/pasha/e01/src/blob.bin'), 'blob.bin')
  assert.equal(siblingPath('/home/pasha/e01/src/blob.bin', 'data.bin'), '/home/pasha/e01/src/data.bin')
  assert.equal(siblingPath('/blob.bin', 'data.bin'), '/data.bin')
  assert.equal(stemLength('blob.tar.gz'), 8)
  assert.equal(stemLength('.hidden'), 7)
  assert.equal(stemLength('folder'), 6)
})
test('restore suggests the storage root instead of the internal trash path', () => {
  assert.equal(
    restoreDestination('/home/pasha/.panasms-trash-1000/1791145697370136414-2dc546df/plain'),
    '/home/pasha/plain',
  )
  assert.equal(
    restoreDestination('/srv/data/.panasms-trash-1000/1791145697370136414-2dc546df/dir/sub/file.txt'),
    '/srv/data/file.txt',
  )
  assert.equal(restoreDestination('/.panasms-trash-1000/loose'), '/loose')
  assert.equal(restoreDestination('/home/pasha/docs/file.txt'), '/home/pasha/docs/file.txt')
})
test('session start time is localized and unknown values stay unchanged', () => {
  const utc = new Date(Date.UTC(2026, 9, 4, 20, 1, 33))
  assert.equal(sessionTime('Sun 2026-10-04 20:01:33 UTC', 'ru-RU'), utc.toLocaleString('ru-RU'))
  assert.equal(sessionTime(utc.getTime() / 1000, 'uk-UA'), utc.toLocaleString('uk-UA'))
  assert.equal(
    sessionTime('Sun 2026-10-04 23:01:33 EEST', 'ru-RU'),
    new Date(Date.UTC(2026, 9, 4, 23, 1, 33)).toLocaleString('ru-RU', { timeZone: 'UTC' }) + ' EEST',
  )
  assert.doesNotMatch(sessionTime('Sun 2026-10-04 20:01:33 UTC', 'ru-RU'), /Sun/)
  for (const raw of ['', 'n/a', '2026-10-04']) assert.equal(sessionTime(raw, 'en-US'), raw)
})
