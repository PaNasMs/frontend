import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { loadTypeScript } from './helpers/typescript.mjs'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const { useRouteTab, useQueryValue, updateQuery, queryValue } = loadTypeScript(
  new URL('../src/app/navigation.ts', import.meta.url),
)

test('a retained disk settings panel cannot redirect navigation outside its route', () => {
  const code = ts.transpileModule(
    readFileSync(new URL('../src/app/navigation.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText
  for (const [pathname, expected] of [
    ['/settings/cpu-cooling', undefined],
    ['/settings/users', undefined],
    ['/settings', undefined],
    ['/settings/storage-other', undefined],
    ['/storage/disks', undefined],
    ['/settings/storage/normal', undefined],
    ['/settings/storage/advanced', undefined],
    ['/settings/storage', '/settings/storage/normal'],
    ['/settings/storage/', '/settings/storage/normal'],
    ['/settings/storage/unknown', '/settings/storage/normal'],
  ]) {
    const effects = []
    const navigations = []
    const exports = {}
    vm.runInNewContext(code, {
      exports,
      require: (name) => {
        if (name === 'react') return { useEffect: (effect) => effects.push(effect) }
        if (name === 'react-router-dom')
          return {
            useLocation: () => ({ pathname, search: '?panel=jobs' }),
            useNavigate:
              () =>
              (...args) =>
                navigations.push(args),
          }
        throw Error(`Unexpected dependency: ${name}`)
      },
    })
    exports.useRouteTab('/settings/storage', ['normal', 'advanced'], 'normal')
    effects.forEach((effect) => effect())
    assert.equal(navigations.length, expected ? 1 : 0, pathname)
    if (expected) {
      assert.equal(navigations[0][0].pathname, expected)
      assert.equal(navigations[0][0].search, '?panel=jobs')
      assert.equal(navigations[0][1].replace, true)
    }
  }
})

test('deep links and Back/Forward derive the selected tab from the URL', async () => {
  function Screen() {
    const [tab] = useRouteTab('/storage', ['disks', 'mounts'], 'disks')
    return React.createElement('span', null, tab)
  }
  const router = createMemoryRouter([{ path: '/storage/:tab', element: React.createElement(Screen) }], {
    initialEntries: ['/storage/mounts'],
  })
  const render = () => renderToString(React.createElement(RouterProvider, { router }))
  try {
    assert.match(render(), />mounts</)
    await router.navigate('/storage/disks')
    assert.match(render(), />disks</)
    await router.navigate(-1)
    assert.match(render(), />mounts</)
    await router.navigate(1)
    assert.match(render(), />disks</)
  } finally {
    router.dispose()
  }
})

test('file paths round-trip reserved characters without losing other view filters', () => {
  const path = '/home/pasha/Звіти & фото/#100% + ?.txt'
  const initial = new URLSearchParams('view=grid&sort=size&panel=jobs')
  const next = updateQuery(initial, 'path', path, '')
  assert.equal(queryValue(new URLSearchParams(next.toString()), 'path', ''), path)
  assert.equal(next.get('view'), 'grid')
  assert.equal(next.get('sort'), 'size')
  assert.equal(next.get('panel'), 'jobs')
  assert.equal(initial.has('path'), false)
  const home = updateQuery(next, 'path', '', '')
  assert.equal(home.has('path'), false)
  assert.equal(home.get('view'), 'grid')
})

test('invalid query options cannot reach history API; URL hooks preserve valid deep-link filters', () => {
  function Screen() {
    const [hours] = useQueryValue('hours', '24', ['1', '24', '168'])
    const [disk] = useQueryValue('disk')
    return React.createElement('span', null, hours + ':' + disk)
  }
  const router = createMemoryRouter([{ path: '/history', element: React.createElement(Screen) }], {
    initialEntries: ['/history?hours=999999&disk=md127'],
  })
  try {
    assert.match(renderToString(React.createElement(RouterProvider, { router })), />24:md127</)
  } finally {
    router.dispose()
  }
})
