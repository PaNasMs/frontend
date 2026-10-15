import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Ключ виджета проверяет сервер (validWidgetKey в internal/api/server.go).
// Если клиент соберёт ключ шире этого набора, сохранение раскладки вернёт 400.
const SERVER_RULE = /^[A-Za-z0-9._-]{1,64}$/

const exports = {}
const code = ts.transpileModule(
  readFileSync(new URL('../src/app/storage-widgets.tsx', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText
vm.runInNewContext(code, { exports, require: () => ({}), console })

const { diskWidgetKind, DISK_TEMP } = exports
const kindKey = (kind) => kind.slice(DISK_TEMP.length)

// Серийный номер устойчив к переименованию /dev/sdX, поэтому ключ берётся с него.
assert.equal(diskWidgetKind({ serial: 'WD-WXN1A58EJUUC', kname: 'sdb' }), 'disk-temp:WD-WXN1A58EJUUC')
assert.equal(diskWidgetKind({ serial: 'WD-WXN1A58EJUUC', kname: 'sdd' }), 'disk-temp:WD-WXN1A58EJUUC')

// Без серийного номера остаётся имя устройства.
assert.equal(diskWidgetKind({ serial: null, kname: 'mmcblk0' }), 'disk-temp:mmcblk0')
assert.equal(diskWidgetKind({ serial: '', kname: 'sda' }), 'disk-temp:sda')

// Всё, что сервер не примет, должно быть обезврежено на клиенте.
for (const serial of [
  'S3Z2 NB0K',
  '../../etc/passwd',
  'диск-один',
  'a/b\\c',
  'x'.repeat(200),
  'quote"and\'tick',
]) {
  const key = kindKey(diskWidgetKind({ serial, kname: 'sdz' }))
  assert.ok(SERVER_RULE.test(key), `ключ ${JSON.stringify(key)} не пройдёт серверную проверку`)
}

// Разные диски не должны схлопываться в один виджет.
const keys = new Set(
  [
    { serial: 'A-1', kname: 'sdb' },
    { serial: 'A_1', kname: 'sdc' },
    { serial: 'A.1', kname: 'sdd' },
  ].map(diskWidgetKind),
)
assert.equal(keys.size, 3)

// Замена недопустимых символов не должна склеивать разные диски.
const collided = new Set(
  ['диск-один', 'диск-два', 'диск-три', 'a b c', 'a/b/c'].map((serial) =>
    diskWidgetKind({ serial, kname: 'sdz' }),
  ),
)
assert.equal(collided.size, 5)
for (const kind of collided) assert.ok(SERVER_RULE.test(kindKey(kind)), kind)

// Очень длинный серийный номер укладывается в 64 символа и остаётся своим.
const long = diskWidgetKind({ serial: 'x'.repeat(200), kname: 'sdz' })
assert.ok(kindKey(long).length <= 64)
assert.notEqual(long, diskWidgetKind({ serial: 'x'.repeat(199), kname: 'sdz' }))

console.log('Ключи виджетов дисков: устойчивость, обезвреживание и совпадение с серверным правилом проверены')

const { diskTemperatureCurrent } = exports
for (const [disk, expected] of [
  [{ state: 'active', temperature: 35, stale: false }, true],
  [{ state: 'sleeping', temperature: 35, sleepTemperature: true, stale: false }, true],
  [{ state: 'sleeping', temperature: 35, stale: true }, false],
  [{ state: 'sleeping', temperature: 35, sleepTemperature: true, stale: true }, false],
  [{ state: 'sleeping', temperature: 35, stale: false }, false],
  [{ state: 'unknown', temperature: 35, stale: false }, false],
  [{ state: 'unavailable', temperature: 35, stale: false }, false],
  [{ state: 'active', temperature: null, stale: false }, false],
  [undefined, false],
])
  assert.equal(diskTemperatureCurrent(disk), expected, JSON.stringify(disk))

const volumes = exports.mountedVolumes({
  mounts: [
    { source: '/dev/mmcblk0p2', target: '/', size: 60, used: 20, avail: 40 },
    { source: 'server:/media', target: '/mnt/media', size: 500, used: 200, avail: 300 },
    { source: '/dev/md127', target: '/srv/storage', size: 1000, used: 600, avail: 400 },
    { source: '/dev/sdb1', target: '/mnt/offline', size: 100, used: null, avail: null },
  ],
})
assert.deepEqual(
  Array.from(volumes, (volume) => volume.target),
  ['/srv/storage', '/'],
)

const disk = { model: 'WDC disk', serial: 'ABC' }
const preferences = { smartCrcBaselines: { 'WDC disk:ABC': 12 } }
assert.equal(exports.smartBaseline(disk, preferences), 12)
const warning = {
  health: 'warning',
  warnings: ['UDMA_CRC_Error_Count'],
  attributes: [{ id: 199, raw: { value: 12 } }],
}
assert.equal(exports.smartCrcAcknowledged(warning, 12), true)
assert.equal(exports.smartCrcAcknowledged(warning, 11), false)
assert.equal(
  exports.smartCrcAcknowledged(
    { ...warning, warnings: ['UDMA_CRC_Error_Count', 'Current_Pending_Sector'] },
    12,
  ),
  false,
)

const diskLoadStorage = (kname) => ({
  devices: [{ type: 'disk', kname, serial: 'WD-123', model: 'WDC', children: [] }],
  arrays: [{ device: '/dev/md127', uuid: 'array-uuid', name: 'Data' }],
})
const firstDevices = exports.diskLoadDevices(diskLoadStorage('sdb'))
const renamedDevices = exports.diskLoadDevices(diskLoadStorage('sdd'))
assert.equal(
  firstDevices.find((device) => device.name === 'sdb').key,
  renamedDevices.find((device) => device.name === 'sdd').key,
)
assert.equal(firstDevices.find((device) => device.name === 'md127').key, 'array:array-uuid')
assert.equal(exports.selectedDiskLoadDevices(), null)
assert.equal(exports.selectedDiskLoadDevices({ devices: '' }).size, 0)
assert.ok(exports.selectedDiskLoadDevices({ devices: 'disk:WD-123' }).has('disk:WD-123'))
