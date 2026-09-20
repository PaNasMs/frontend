import { tr, locale } from '../i18n/index'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { request } from '../api/client'
import { Notice } from '../shared/ui'
export type Alert = {
  id: string
  message: string
  active: boolean
  created: string
  updated: string
}
let toastSequence = 0
export function createLocalAlert(message: string): Alert {
  const now = new Date().toISOString()
  return { id: 'local:' + ++toastSequence, message, active: false, created: now, updated: now }
}
export function notify(message: string) {
  window.dispatchEvent(new CustomEvent('ostojaos:toast', { detail: message }))
}
export function NotificationsList() {
  const data = useQuery({
    queryKey: ['notifications'],
    queryFn: () => request<Alert[]>('notifications'),
    refetchInterval: 10000,
  })
  return (
    <>
      {data.error && <Notice error>{data.error.message}</Notice>}
      {data.data?.map((a) => (
        <article className="surface" key={a.id}>
          <span className={`badge ${a.active ? 'warning' : ''}`}>
            {a.active
              ? tr('needs_attention_925c5165')
              : a.id.startsWith('device:')
                ? tr('event_bb92633b')
                : tr('resolved_b6c73843')}
          </span>
          <p>{a.message}</p>
          <span className="small muted">{new Date(a.updated).toLocaleString(locale())}</span>
        </article>
      ))}
      {data.data?.length === 0 && <Notice>{tr('no_notifications_yet_be3ce152')}</Notice>}
    </>
  )
}
export function NotificationToasts() {
  const data = useQuery({
    queryKey: ['notifications'],
    queryFn: () => request<Alert[]>('notifications'),
    refetchInterval: 10000,
  })
  const seen = useRef<Map<string, string> | null>(null)
  const [toasts, setToasts] = useState<Alert[]>([])
  useEffect(() => {
    const receive = (event: Event) => {
      const toast = createLocalAlert((event as CustomEvent<string>).detail)
      setToasts((old) => [toast, ...old].slice(0, 4))
    }
    window.addEventListener('ostojaos:toast', receive)
    return () => window.removeEventListener('ostojaos:toast', receive)
  }, [])
  useEffect(() => {
    if (!data.data) return
    const current = new Map(data.data.map((a) => [a.id, a.updated]))
    if (seen.current) {
      const fresh = data.data.filter(
        (a) =>
          seen.current!.get(a.id) !== a.updated &&
          (a.active || a.id.startsWith('device:')) &&
          Date.now() - Date.parse(a.updated) < 30000,
      )
      if (fresh.length) setToasts((old) => [...fresh, ...old].slice(0, 4))
    }
    seen.current = current
  }, [data.data])
  useEffect(() => {
    if (!toasts.length) return
    const timer = setTimeout(() => setToasts((old) => old.slice(0, -1)), 8000)
    return () => clearTimeout(timer)
  }, [toasts])
  return (
    <div className="notification-toasts" aria-live="polite">
      {toasts.map((a) => (
        <div className={`notification-toast ${a.active ? 'warning' : ''}`} key={a.id}>
          <p>{a.message}</p>
          <div>
            {!a.id.startsWith('local:') && (
              <Link
                to={a.id.startsWith('device:') ? '/storage' : '/?panel=notifications'}
                onClick={() => setToasts((old) => old.filter((x) => x.id !== a.id))}
              >
                {tr('open_1259571a')}
              </Link>
            )}
            <button
              aria-label={tr('dismiss_notification_5e107a81')}
              onClick={() => setToasts((old) => old.filter((x) => x.id !== a.id))}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
