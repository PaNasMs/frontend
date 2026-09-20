import { translations } from './helpers/typescript.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'
import vm from 'node:vm'
import ts from 'typescript'
const exports = {}
// Виджеты разных размеров: сетка обязана держать их без наложений.
const widgets = {
  clock: { width: 2, height: 1 },
  cpu: { width: 2, height: 2 },
  memory: { width: 2, height: 2 },
  cooling: { width: 2, height: 2 },
  systemDisk: { width: 2, height: 2 },
  network: { width: 2, height: 2 },
  'disk-temp:WD-1': { width: 2, height: 1 },
}
const modules = () => ['users', 'storage', 'files'].map((id) => ({ id, title: id, path: '/' + id, icon: id }))
const code = ts.transpileModule(
  readFileSync(new URL('../src/app/desktop-layout.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText
vm.runInNewContext(code, {
  exports,
  crypto: webcrypto,
  require: (name) =>
    name === './module-registry' ? { widgets, modules } : name.includes('i18n') ? translations : {},
})
exports.registerShortcuts()
const layouts = exports.toggleShortcut(undefined, 'files', true)
for (const [mode, tiles] of Object.entries(layouts)) {
  assert.equal(tiles.filter((t) => t.kind === 'files').length, 1)
  assert.ok(tiles.every((t) => exports.free(t, tiles, exports.columns(mode))))
  assert.equal(tiles.filter((t) => !widgets[t.kind].href).length, 5)
}
assert.equal(JSON.stringify(exports.toggleShortcut(layouts, 'files', true)), JSON.stringify(layouts))
const removed = exports.toggleShortcut(layouts, 'files', false)
assert.ok(Object.values(removed).every((tiles) => tiles.every((t) => t.kind !== 'files')))
assert.ok(Object.values(layouts).every((tiles) => tiles.some((t) => t.kind === 'files')))
assert.deepEqual([...exports.reorder(['a', 'b', 'c'], 'a', 'c')], ['b', 'c', 'a'])
assert.deepEqual([...exports.reorder(['a', 'b', 'c'], 'c', 'a')], ['c', 'a', 'b'])
assert.deepEqual([...exports.reorder(['a', 'b', 'c'], 'missing', 'b')], ['a', 'b', 'c'])

// Плитки разной ширины и высоты не накладываются и не вылезают за сетку.
for (const cols of [8, 6, 2]) {
  const placed = []
  for (const kind of ['clock', 'network', 'cpu', 'disk-temp:WD-1', 'memory', 'systemDisk']) {
    const tile = exports.place(kind, placed, cols)
    if (tile) placed.push(tile)
  }
  for (const tile of placed) {
    assert.ok(exports.free(tile, placed, cols), `${tile.kind} не помещается при ${cols} колонках`)
    assert.ok(tile.x + widgets[tile.kind].width <= cols, `${tile.kind} вылез за ${cols} колонок`)
  }
  assert.ok(placed.some((t) => t.kind === 'network'))
}

// Неизвестный вид приходит из старой раскладки или пропавшего диска.
assert.ok(exports.place('disk-temp:GONE', [], 8))
assert.equal(exports.free({ id: 'x', kind: 'disk-temp:GONE', x: 0, y: 0 }, [], 8), true)
console.log('Размещение, брейкпоинты, разные размеры, неизвестные виджеты и порядок панели проверены')

const saved = [{ id: 'disk', kind: 'disk-temp:DISCONNECTED', x: 0, y: 0 }]
assert.equal(exports.free({ id: 'cpu', kind: 'cpu', x: 0, y: 0 }, saved, 8), false)

const dragged = { id: 'dragged', kind: 'cpu', x: 0, y: 0 }
const obstacle = { id: 'obstacle', kind: 'users', x: 3, y: 1 }
assert.equal(exports.free({ ...dragged, x: 2, y: 0 }, [dragged, obstacle], 8), false)
assert.equal(exports.free({ ...dragged, x: 1, y: 0 }, [dragged, obstacle], 8), true)
assert.equal(exports.free({ ...dragged, x: 7, y: 0 }, [dragged], 8), false)
assert.equal(exports.free({ ...dragged, x: -1, y: 0 }, [dragged], 8), false)
