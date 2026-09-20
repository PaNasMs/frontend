import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const cache = new Map()
export function loadTypeScript(input) {
  const file = input instanceof URL ? fileURLToPath(input) : input
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }
  cache.set(file, module)
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  vm.runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      setTimeout,
      clearTimeout,
      URLSearchParams,
      console,
      require: (name) => {
        if (!name.startsWith('.')) return require(name)
        const path = resolve(dirname(file), name)
        if (path.endsWith('.json')) return JSON.parse(readFileSync(path, 'utf8'))
        const target = [path + '.ts', path + '.tsx', path + '/index.ts'].find(existsSync)
        if (!target) throw Error('Cannot load ' + path)
        return loadTypeScript(target)
      },
    },
    { filename: file },
  )
  return module.exports
}
export const translations = loadTypeScript(new URL('../../src/i18n/index.ts', import.meta.url))
await translations.initializeLanguage()
