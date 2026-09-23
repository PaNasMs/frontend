import type { ComponentType } from 'react'
export type WidgetDefinition = {
  title: string
  width: number
  height: number
  module: string
  href?: string
  /**
   * Отрисовку виджета даёт сам модуль. Оболочка рисует только рамку и заголовок,
   * поэтому новый виджет не требует правок рабочего стола.
   */
  component?: ComponentType<{ kind: string }>
  icon?: string
  /** Показывать ссылку на страницу истории показателей в заголовке. */
  history?: boolean
  /** Низкому виджету заголовок не по росту: модуль рисует карточку целиком сам. */
  bare?: boolean
}
export type SettingsSection = {
  id: string
  title: string
  icon: string
  component: ComponentType
  routes?: string[]
}
export type ModuleDefinition = {
  id: string
  title: string
  path: string
  routes?: string[]
  icon: string
  keepAlive?: boolean
  backgroundIndicator?: ComponentType
  component: ComponentType<{ active?: boolean }>
  settings?: SettingsSection[]
  widgets?: Record<string, WidgetDefinition>
}
const registered: ModuleDefinition[] = []
export const widgets: Record<string, WidgetDefinition> = {}
export function registerModule(module: ModuleDefinition) {
  if (registered.some((m) => m.id === module.id)) throw new Error('Duplicate module ' + module.id)
  registered.push(module)
  Object.assign(widgets, module.widgets)
}
let administrator = true
export const isAdministrator = () => administrator
export function setModuleAccess(admin: boolean) {
  administrator = admin
}
export const modules = () => registered.filter((m) => administrator || m.id === 'files')
export const settingsSections = () =>
  modules()
    .flatMap((m) => m.settings ?? [])
    .sort((a, b) => Number(b.id === 'general') - Number(a.id === 'general'))

/**
 * Источник виджетов, состав которых известен только во время работы: например по
 * виджету температуры на каждый найденный диск. Это React-хук; список источников
 * фиксируется при импорте модулей, поэтому порядок вызова хуков стабилен.
 */
export type WidgetSource = () => Record<string, WidgetDefinition>
const sources: WidgetSource[] = []
export function registerWidgetSource(source: WidgetSource) {
  sources.push(source)
}
export function useModuleWidgets(): Record<string, WidgetDefinition> {
  const produced = sources.map((source) => source())
  const result: Record<string, WidgetDefinition> = Object.assign({}, widgets, ...produced)
  if (!administrator) {
    for (const [key, value] of Object.entries(result)) {
      if (value.href && !['/', '/files', '/history'].includes(value.href)) delete result[key]
    }
  }
  return result
}
