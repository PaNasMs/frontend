import { language, i18n, tr } from '../i18n'
import './module-sdk'
import { managed } from './operations'
import { modules } from './module-registry'
export type InstalledModule = {
  translations?: Partial<Record<'en' | 'ru' | 'uk', { title: string; description?: string }>>
  id: string
  title: string
  version: string
  enabled: boolean
  signer: string
  core: string
  description?: string
  dependencies?: Record<string, string>
  packages?: Record<string, string>
  requiredBy: string[]
  files: Record<string, string>
}
export type ModuleCatalog = { core: string; api: number; installed: InstalledModule[] }
export const moduleErrors: string[] = []
export async function loadInstalledModules() {
  let catalog: ModuleCatalog
  try {
    catalog = await moduleCatalog()
  } catch {
    return
  }
  for (const module of catalog.installed.filter((m) => m.enabled)) {
    try {
      if (module.files['ui/index.css']) {
        const css = document.createElement('link')
        css.rel = 'stylesheet'
        css.href = `/api/v1/module-assets/${module.id}/index.css?v=${module.version}`
        document.head.append(css)
      }
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = `/api/v1/module-assets/${module.id}/index.js?v=${module.version}`
        const timeout = setTimeout(() => {
          script.remove()
          reject(new Error('timeout'))
        }, 10000)
        script.onload = () => {
          clearTimeout(timeout)
          resolve()
        }
        script.onerror = () => {
          clearTimeout(timeout)
          reject(new Error('load failed'))
        }
        document.head.append(script)
      })
      if (!modules().some((m) => m.id === module.id)) throw new Error('missing registration')
    } catch {
      moduleErrors.push(tr('modules.loadFailed', { name: module.title }))
    }
  }
}

export async function moduleCatalog(): Promise<ModuleCatalog> {
  const result = await managed<ModuleCatalog>('modules')
  return {
    ...result,
    installed: result.installed.map((module) => {
      const labels = module.translations?.[language(i18n.language)] ?? module.translations?.en
      return {
        ...module,
        title: labels?.title || module.translations?.en?.title || module.title,
        description: labels?.description || module.translations?.en?.description || module.description,
      }
    }),
  }
}

export type AvailableModule = InstalledModule & {
  reason: string
  updateAvailable: boolean
  repository: string
}
export async function availableModules(): Promise<{
  available: AvailableModule[]
  errors: { repository: string; error: string }[]
}> {
  const result = await managed<{
    available: AvailableModule[]
    errors?: { repository: string; error: string }[]
  }>('module-catalog')
  return {
    errors: result.errors ?? [],
    available: result.available.map((module) => {
      const labels = module.translations?.[language(i18n.language)] ?? module.translations?.en
      return {
        ...module,
        title: labels?.title || module.title,
        description: labels?.description || module.description,
      }
    }),
  }
}
