import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const exports = {}
const mdi = new Proxy({}, { get: (_, name) => name })
const code = ts.transpileModule(
  readFileSync(new URL('../../modules/files/frontend/file-visual.tsx', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText
vm.runInNewContext(code, { exports, require: (name) => (name === '@mdi/js' ? mdi : {}) })
const file = {
  path: '/home/test/a.JPG',
  name: 'a.JPG',
  size: 1000,
  modified: 1,
  directory: false,
  link: false,
}
assert.equal(exports.fileIcon(file), 'mdiFileImageOutline')
assert.ok(exports.hasThumbnail(file))
for (const [name, icon] of [
  ['a.pdf', 'mdiFilePdfBox'],
  ['a.docx', 'mdiFileWordOutline'],
  ['a.xlsx', 'mdiFileExcelOutline'],
  ['a.zip', 'mdiFolderZipOutline'],
  ['a.mp3', 'mdiFileMusicOutline'],
  ['a.mp4', 'mdiFileVideoOutline'],
  ['a.go', 'mdiFileCodeOutline'],
  ['a.xyz', 'mdiFileOutline'],
])
  assert.equal(exports.fileIcon({ ...file, name }), icon)
for (const change of [
  { directory: true },
  { link: true },
  { size: 65 * 1024 * 1024 },
  { name: 'a.svg' },
  { name: 'a.pdf' },
])
  assert.equal(exports.hasThumbnail({ ...file, ...change }), false)
console.log('File type icons and thumbnail eligibility passed')
