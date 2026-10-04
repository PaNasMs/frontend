import { useSyncExternalStore } from 'react'

const phone = '(max-width: 639px)'
const subscribe = (notify: () => void) => {
  const media = matchMedia(phone)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}
/** True below 640px: the taskbar moves to the bottom and menus open as sheets. */
export function usePhone() {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(phone).matches,
    () => false,
  )
}
