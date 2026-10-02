export type ModuleText = {
  title: string
  description?: string
  longDescription?: string
  translations?: Partial<Record<'en' | 'ru' | 'uk', { title?: string; description?: string; longDescription?: string }>>
}
export function localizedModuleText<T extends ModuleText>(module: T, language: 'en' | 'ru' | 'uk'): T {
  const labels = module.translations?.[language]
  const english = module.translations?.en
  const text = (value?: string) => value?.trim() || undefined
  return {
    ...module,
    title: text(labels?.title) || text(english?.title) || module.title,
    description: text(labels?.description) || text(english?.description) || module.description,
    longDescription: text(labels?.longDescription) || text(english?.longDescription) || text(module.longDescription),
  }
}
