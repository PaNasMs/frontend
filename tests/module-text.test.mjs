import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTypeScript } from './helpers/typescript.mjs'
const { localizedModuleText } = loadTypeScript(new URL('../src/app/module-text.ts', import.meta.url))
test('descriptions use independent language fallback', () => {
 const m={title:'Files',description:'Short',longDescription:'Detailed',translations:{en:{longDescription:'English details'},ru:{title:'Файлы',description:'Кратко'}}}
 const r=localizedModuleText(m,'ru')
 assert.equal(r.description,'Кратко');assert.equal(r.longDescription,'English details');assert.equal(r.title,'Файлы')
 assert.equal(localizedModuleText({...m,translations:{uk:{longDescription:'Докладно'}}},'uk').longDescription,'Докладно')
})
test('old modules keep their short summary and blank details fall back', () => {
 const m={title:'Old',description:'Summary'}
 assert.equal(localizedModuleText(m,'uk').longDescription,undefined)
 assert.equal(localizedModuleText(m,'uk').description,'Summary')
 assert.equal(localizedModuleText({...m,longDescription:'Details',translations:{ru:{longDescription:'  '}}},'ru').longDescription,'Details')
})
