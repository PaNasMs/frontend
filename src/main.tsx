import { registerServerMessages } from './i18n/server'
import messages from './i18n/server-messages.json'
import { initializeLanguage } from './i18n'
async function start() {
  let selected: unknown = 'en'
  try {
    const response = await fetch('/api/v1/preferences', { credentials: 'same-origin' })
    if (response.ok) selected = (await response.json()).language
  } catch {
    /* The login screen and offline shell still use English. */
  }
  await initializeLanguage(selected)
  registerServerMessages('core', messages)
  await import('./application')
}
void start()
