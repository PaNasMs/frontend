import { registerServerMessages } from './i18n/server'
import messages from './i18n/server-messages.json'
import { initializeLanguage } from './i18n'
import { guestLanguage } from './home/guest'
async function start() {
  // Before sign-in the page uses the language last used in this browser, else the browser's own.
  let selected: unknown = guestLanguage()
  try {
    const response = await fetch('/api/v1/preferences', {
      credentials: 'same-origin',
      signal: AbortSignal.timeout(15000),
    })
    if (response.ok) selected = (await response.json()).language
  } catch {
    /* The sign-in page and offline shell keep the guest language. */
  }
  await initializeLanguage(selected)
  registerServerMessages('core', messages)
  await import('./application')
}
void start()
