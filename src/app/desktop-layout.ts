import { tr } from '../i18n/index'
import { widgets, modules, isAdministrator } from './module-registry'
import { mdiCogOutline, mdiChartLine } from '@mdi/js'
export type Tile = {
  id: string
  kind: string
  x: number
  y: number
}
export const newID = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, '0')).join('')
export const screen = () => (innerWidth < 640 ? 'mobile' : innerWidth < 1100 ? 'medium' : 'wide')
export const columns = (mode: string) => (mode === 'mobile' ? 2 : mode === 'medium' ? 6 : 8)
export const apps = () => [
  ...modules()
    .filter((m) => ['users', 'storage'].includes(m.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .reverse(),
  ...(isAdministrator()
    ? [{ id: 'settings', title: tr('settings_7f17c7c6'), path: '/settings', icon: mdiCogOutline }]
    : []),
  ...modules().filter((m) => !['users', 'storage'].includes(m.id)),
  { id: 'history', title: tr('metrics_history_50331506'), path: '/history', icon: mdiChartLine },
]
export const shortcutKind = (id: string) => (['users', 'storage', 'files'].includes(id) ? id : 'app-' + id)
export function registerShortcuts() {
  for (const app of apps())
    widgets[shortcutKind(app.id)] = {
      title: app.title,
      width: 1,
      height: 1,
      module: app.title,
      href: app.path,
    }
}
const dimensions = (kind: string) =>
  widgets[kind] ?? (/^disk-temp:[A-Za-z0-9._-]{1,64}$/.test(kind) ? { width: 2, height: 1 } : undefined)
export function free(tile: Tile, all: Tile[], cols: number) {
  const w = dimensions(tile.kind)
  // Виджет модуля может быть ещё не объявлен: место под неизвестное не держим.
  if (!w) return false
  return (
    tile.x >= 0 &&
    tile.y >= 0 &&
    tile.x + w.width <= cols &&
    tile.y + w.height <= 100 &&
    !all.some((t) => {
      const v = dimensions(t.kind)
      if (!v) return false
      return (
        t.id !== tile.id &&
        tile.x < t.x + v.width &&
        tile.x + w.width > t.x &&
        tile.y < t.y + v.height &&
        tile.y + w.height > t.y
      )
    })
  )
}
export function place(kind: string, all: Tile[], cols: number) {
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < cols; x++) {
      const t = { id: newID(), kind, x, y }
      if (free(t, all, cols)) return t
    }
  return undefined
}
export function defaults(cols: number) {
  const all: Tile[] = []
  for (const kind of [
    'clock',
    'cpu',
    'memory',
    'cooling',
    'systemDisk',
    ...(isAdministrator() ? ['users', 'storage'] : ['files']),
  ]) {
    const t = place(kind, all, cols)
    if (t) all.push(t)
  }
  return all
}
export function toggleShortcut(layouts: Record<string, Tile[]> | undefined, id: string, show: boolean) {
  const kind = shortcutKind(id)
  const result = { ...layouts }
  for (const mode of ['wide', 'medium', 'mobile']) {
    const all = [...(layouts?.[mode] ?? defaults(columns(mode)))].filter((t) => show || t.kind !== kind)
    if (show && !all.some((t) => t.kind === kind)) {
      const tile = place(kind, all, columns(mode))
      if (!tile) throw Error(tr('no_free_space_on_the_desktop_7b121d2c'))
      all.push(tile)
    }
    result[mode] = all
  }
  return result
}
export function reorder(ids: string[], source: string, target: string) {
  const result = ids.filter((id) => id !== source)
  const at = ids.indexOf(target)
  if (!ids.includes(source) || at < 0) return ids
  result.splice(at, 0, source)
  return result
}
