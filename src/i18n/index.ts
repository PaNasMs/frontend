import i18next from 'i18next'
import en from './locales/en.json'
import ru from './locales/ru.json'
import uk from './locales/uk.json'
export const languages = ['en', 'ru', 'uk'] as const
export type Language = (typeof languages)[number]
export type Dictionary = Record<string, string>
export type Translations = { en: Dictionary; ru?: Dictionary; uk?: Dictionary }
export const languageNames: Record<Language, string> = { en: 'English', ru: 'Русский', uk: 'Українська' }
export const i18n = i18next.createInstance()
export const language = (value: unknown): Language =>
  languages.includes(value as Language) ? (value as Language) : 'en'
export const locale = () => ({ en: 'en-US', ru: 'ru-RU', uk: 'uk-UA' })[language(i18n.language)]
export async function initializeLanguage(selected: unknown = 'en') {
  await i18n.init({
    lng: language(selected),
    fallbackLng: 'en',
    supportedLngs: [...languages],
    ns: ['core'],
    defaultNS: 'core',
    keySeparator: false,
    nsSeparator: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    resources: { en: { core: en }, ru: { core: ru }, uk: { core: uk } },
    initAsync: false,
  })
  if (typeof document !== 'undefined') document.documentElement.lang = language(i18n.language)
}
export function registerTranslations(namespace: string, dictionaries: Translations) {
  if (namespace === 'core' || !/^[a-z][a-z0-9-]{1,39}$/.test(namespace))
    throw Error('Invalid translation namespace')
  for (const lng of languages) i18n.addResourceBundle(lng, namespace, dictionaries[lng] ?? {}, true, true)
}
export const translator =
  (namespace: string) =>
  (key: string, values: Record<string, unknown> = {}): string =>
    String(i18n.t(key, { ...values, ns: namespace }))
export const tr = translator('core')

export { registerServerMessages, serverText } from './server'
