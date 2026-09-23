import { tr, locale } from '../i18n/index'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { request } from '../api/client'
import { Notice, Button, Icon, CloseIcon } from '../shared/ui'
import {
  mdiTextBoxSearchOutline,
  mdiClose,
  mdiArrowRight,
  mdiInformationOutline,
  mdiCheckCircleOutline,
  mdiAlertOutline,
  mdiAlertCircleOutline,
} from '@mdi/js'
import { JobRecovery, managed, type Job } from './operations'
export type Alert = {
  severity?: 'info' | 'success' | 'warning' | 'error'
  id: string
  message: string
  active: boolean
  created: string
  updated: string
}
const severityIcons = {
  info: mdiInformationOutline,
  success: mdiCheckCircleOutline,
  warning: mdiAlertOutline,
  error: mdiAlertCircleOutline,
}
function Importance({ alert }: { alert: Alert }) {
  const severity = alert.severity ?? 'info'
  return (
    <span
      className={'notification-severity ' + severity}
      role="img"
      aria-label={tr('alerts.severity.' + severity)}
      title={tr('alerts.severity.' + severity)}
    >
      <Icon path={severityIcons[severity]} />
    </span>
  )
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
  const q = useQueryClient()
  const [selected, setSelected] = useState<Job | null>(null)
  const inspect = useMutation({
    mutationFn: (id: string) => managed<Job>('job', undefined, id),
    onSuccess: setSelected,
  })
  const dismiss = useMutation({
    mutationFn: (id: string) => request('notifications?id=' + encodeURIComponent(id), 'DELETE'),
    onSuccess: () => q.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const data = useQuery({
    queryKey: ['notifications'],
    queryFn: () => request<Alert[]>('notifications'),
    refetchInterval: 10000,
  })
  return (
    <>
      {data.error && <Notice error>{data.error.message}</Notice>}
      {(inspect.error || dismiss.error) && <Notice error>{(inspect.error || dismiss.error)?.message}</Notice>}
      {selected && <JobRecovery job={selected} onClose={() => setSelected(null)} />}
      {data.data?.map((a) => (
        <article className="surface notification-item" key={a.id}>
          <div className="notification-message">
            <Importance alert={a} />
            <p>{a.message}</p>
          </div>
          {a.active && !a.id.startsWith('job:') && <p className="small muted">{tr('alerts.problemHint')}</p>}
          <div className="notification-footer">
            <time className="small muted" dateTime={a.updated}>
              {new Date(a.updated).toLocaleString(locale())}
            </time>
            <div className="job-actions">
              {a.id.startsWith('job:') ? (
                <Button
                  title={tr('alerts.inspect')}
                  aria-label={tr('alerts.inspect')}
                  disabled={inspect.isPending}
                  onClick={() => inspect.mutate(a.id.slice(4))}
                >
                  <Icon path={mdiTextBoxSearchOutline} />
                </Button>
              ) : (
                <Link
                  className="button"
                  title={tr('alerts.openSource')}
                  aria-label={tr('alerts.openSource')}
                  to={
                    a.id.startsWith('update:')
                      ? '/settings/updates'
                      : a.id.startsWith('cpu-') || a.id.startsWith('cooling-')
                        ? '/settings/general'
                        : '/storage/disks'
                  }
                >
                  <Icon path={mdiArrowRight} />
                </Link>
              )}
              {!a.active && (
                <Button
                  title={tr('dismiss_notification_5e107a81')}
                  aria-label={tr('dismiss_notification_5e107a81')}
                  disabled={dismiss.isPending}
                  onClick={() => dismiss.mutate(a.id)}
                >
                  <Icon path={mdiClose} />
                </Button>
              )}
            </div>
          </div>
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
          (a.active || a.id.startsWith('device:') || a.id.startsWith('update:')) &&
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
          <CloseIcon
            className="toast-close"
            aria-label={tr('dismiss_notification_5e107a81')}
            onClick={() => setToasts((old) => old.filter((x) => x.id !== a.id))}
          />
          <p>{a.message}</p>
          <div>
            {!a.id.startsWith('local:') && (
              <Link
                to={
                  a.id.startsWith('update:')
                    ? '/settings/updates'
                    : a.id.startsWith('device:')
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
          </div>
        </div>
      ))}
    </div>
  )
}
