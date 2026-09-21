import { tr, locale } from '../i18n/index'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
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
  window.dispatchEvent(new CustomEvent('panasms:toast', { detail: message }))
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
            {a.id.startsWith('job:')
              ? tr(a.active ? 'ui.reviewOperation' : 'ui.operationHistory')
              : a.active
                ? tr('needs_attention_925c5165')
                : (a.id.startsWith('device:') || a.id.startsWith('update:'))
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
  const location = useLocation()
  const [paused, setPaused] = useState(false)
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
      setToasts((old) => [toast, ...old].slice(0, 3))
    }
    window.addEventListener('panasms:toast', receive)
    return () => window.removeEventListener('panasms:toast', receive)
  }, [])
  useEffect(() => {
    if (!data.data) return
    const current = new Map(data.data.map((a) => [a.id, a.updated]))
    if (seen.current) {
      const fresh = data.data.filter(
        (a) =>
          seen.current!.get(a.id) !== a.updated &&
          (a.active || (a.id.startsWith('device:') || a.id.startsWith('update:'))) &&
          Date.now() - Date.parse(a.updated) < 30000,
      )
      if (fresh.length) setToasts((old) => [...fresh, ...old].slice(0, 3))
    }
    seen.current = current
  }, [data.data])
  useEffect(() => {
    if (!toasts.length || paused) return
    const timer = setTimeout(() => setToasts((old) => old.slice(0, -1)), 8000)
    return () => clearTimeout(timer)
  }, [toasts, paused])
  return (
    <div
      className="notification-toasts"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false)
      }}
    >
      {toasts.map((a) => (
        <div className={`notification-toast ${a.active ? 'warning' : ''}`} key={a.id}>
          <p>{a.message}</p>
          <div>
            {!a.id.startsWith('local:') && (
              <Link
                to={
                  a.id.startsWith('update:') ? '/settings/updates' : a.id.startsWith('device:')
                    ? '/storage/disks'
                    : {
                        pathname: location.pathname,
                        search: (() => {
                          const params = new URLSearchParams(location.search)
                          params.set('panel', 'notifications')
                          return params.toString()
                        })(),
                      }
                }
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
