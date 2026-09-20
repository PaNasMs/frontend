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
