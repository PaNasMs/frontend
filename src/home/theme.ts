import type { Preferences } from '../api/client'

export type Theme = Preferences['theme']
export const themes: readonly Theme[] = ['light', 'dark', 'light-glass', 'dark-glass']

/** A theme is a base palette plus a surface: solid panels or translucent ones. */
export function applyTheme(theme: Theme = 'dark') {
  const root = document.documentElement
  root.dataset.theme = theme.startsWith('light') ? 'light' : 'dark'
  root.dataset.surface = theme.endsWith('-glass') ? 'glass' : 'solid'
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme.startsWith('light') ? '#dfe7f2' : '#1b212b')
}
