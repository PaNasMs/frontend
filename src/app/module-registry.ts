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
  component: ComponentType
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
export const modules = () => registered
export const settingsSections = () => registered.flatMap((m) => m.settings ?? [])

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
  return Object.assign({}, widgets, ...produced)
}
