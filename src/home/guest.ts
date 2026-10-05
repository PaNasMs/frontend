import { language, languages, type Language } from '../i18n'
import { themes, type Theme } from './theme'

// What the sign-in page looks like before anyone is signed in. It is a per-browser convenience:
// the account's own language and theme take over after sign-in and are remembered here for next time.
const languageKey = 'panasms-guest-language'
const themeKey = 'panasms-guest-theme'

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Private windows may refuse storage; the page still works with defaults. */
  }
}
export function guestLanguage(): Language {
  const stored = read(languageKey)
  if (languages.includes(stored as Language)) return stored as Language
  const preferred = typeof navigator === 'undefined' ? '' : navigator.language.slice(0, 2).toLowerCase()
  return language(preferred)
}
export function guestTheme(): Theme {
  const stored = read(themeKey)
  if (themes.includes(stored as Theme)) return stored as Theme
  const light = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches
  return light ? 'light' : 'dark'
}
export const rememberGuestLanguage = (value: Language) => write(languageKey, value)
export const rememberGuestTheme = (value: Theme) => write(themeKey, value)
