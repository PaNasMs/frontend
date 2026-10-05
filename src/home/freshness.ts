// After a panel update an open tab, or a page the browser kept in its cache, still runs the previous
// interface. The page that the server sends names the current bundle; when it differs from the one
// that is running, reload once so the interface always matches the installed version.
const marker = 'panasms-reloaded-for'

function runningBundle() {
  const script = [...document.scripts].find((item) => /\/assets\/index-[\w-]+\.js$/.test(item.src))
  return script ? new URL(script.src).pathname : ''
}
async function servedBundle() {
  const response = await fetch('/', { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) return ''
  return (await response.text()).match(/\/assets\/index-[\w-]+\.js/)?.[0] ?? ''
}
export function bundleChanged(running: string, served: string) {
  return !!running && !!served && running !== served
}
export function watchInterfaceVersion() {
  const running = runningBundle()
  if (!running) return
  let checked = 0
  const check = async () => {
    if (document.visibilityState !== 'visible' || Date.now() - checked < 60_000) return
    checked = Date.now()
    try {
      const served = await servedBundle()
      if (!bundleChanged(running, served)) return
      // The marker stops a loop if the reload still gets the old page.
      if (sessionStorage.getItem(marker) === served) return
      sessionStorage.setItem(marker, served)
      location.reload()
    } catch {
      /* Offline or restarting: the next check will see the new version. */
    }
  }
  void check()
  document.addEventListener('visibilitychange', () => void check())
  window.addEventListener('focus', () => void check())
}
