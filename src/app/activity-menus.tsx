import { tr } from '../i18n/index'
import { useEffect, useRef, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { mdiBellOutline, mdiFormatListChecks, mdiDeleteSweepOutline } from '@mdi/js'
import { request, type Identity } from '../api/client'
import { Button, Icon, Notice } from '../shared/ui'
import { JobsList, managed, type Job } from './operations'
import { NotificationsList, type Alert } from './notifications'
function ActivityMenu({
  id,
  title,
  icon,
  clearLabel,
  canClear,
  clear,
  children,
}: {
  id: string
  title: string
  icon: string
  clearLabel: string
  canClear: boolean
  clear: () => Promise<unknown>
  children: ReactNode
}) {
  const menu = useRef<HTMLDetailsElement>(null)
  const query = useQueryClient()
  const [params, setParams] = useSearchParams()
  const mutation = useMutation({
    mutationFn: clear,
    onSuccess: () => query.invalidateQueries({ queryKey: [id] }),
  })
  useEffect(() => {
    if (params.get('panel') === id && menu.current) {
      menu.current.open = true
      const next = new URLSearchParams(params)
      next.delete('panel')
      setParams(next, { replace: true })
    }
  }, [params, setParams, id])
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) menu.current.open = false
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menu.current?.open) {
        menu.current.open = false
        menu.current.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  return (
    <details className="activity-menu" ref={menu}>
      <summary className="topbar-action" title={title} aria-label={title}>
        <Icon path={icon} />
      </summary>
      <section className="activity-dropdown" aria-label={title}>
        <div className="activity-heading">
          <h3>{title}</h3>
          <Button
            className="activity-clear"
            title={clearLabel}
            aria-label={clearLabel}
            disabled={!canClear || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <Icon path={mdiDeleteSweepOutline} />
          </Button>
        </div>
        {mutation.error && <Notice error>{mutation.error.message}</Notice>}
        <div className="activity-list">{children}</div>
      </section>
    </details>
  )
}
export function ActivityMenus() {
  const session = useQuery({ queryKey: ['session'], queryFn: () => request<Identity>('session') })
  const admin = session.data?.role === 'admin'
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => managed<Job[]>('jobs'), enabled: admin })
  const alerts = useQuery({ queryKey: ['notifications'], queryFn: () => request<Alert[]>('notifications') })
  return (
    <>
      {admin && (
        <ActivityMenu
          id="jobs"
          title={tr('tasks_2ff08344')}
          icon={mdiFormatListChecks}
          clearLabel={tr('clear_completed_task_history_be777d80')}
          canClear={
            !!jobs.data?.some((j) => ['succeeded', 'failed', 'interrupted', 'cancelled'].includes(j.status))
          }
          clear={() => managed('clear-history', {})}
        >
          <JobsList />
        </ActivityMenu>
      )}
      <ActivityMenu
        id="notifications"
        title={tr('notifications_ee3c35f3')}
        icon={mdiBellOutline}
        clearLabel={tr('clear_history_active_warnings_will_remain_03fdf588')}
        canClear={admin && !!alerts.data?.some((a) => !a.active)}
        clear={() => request('notifications', 'DELETE')}
      >
        <NotificationsList />
      </ActivityMenu>
    </>
  )
}
