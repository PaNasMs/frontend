import { useUpdateTask } from './system-updates'
import { tr } from '../i18n/index'
import { useRaidTasks } from './raid-tasks'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { mdiSync, mdiPause, mdiProgressClock, mdiDotsHorizontal } from '@mdi/js'
import { request } from '../api/client'
import { Icon } from '../shared/ui'
import { operations, type Job } from './operations'
import { longJobs, taskPercent } from './active-tasks'
export function OngoingTasks() {
  const { tasks: raids, error } = useRaidTasks(true)
  const jobs = useQuery({
    queryKey: ['jobs'],
    queryFn: () => request<Job[]>('manage?view=jobs'),
    refetchInterval: 5000,
  })
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  params.set('panel', 'jobs')
  const jobsHref = `${location.pathname}?${params}`
  const updates = useUpdateTask()
  const tasks = [...updates, ...raids, ...longJobs(jobs.data ?? [], now, operations)]
  if (!tasks.length) return null
  return (
    <div className="ongoing-tasks" aria-label={tr('long_running_tasks_ef6b1f6c')}>
      {tasks.slice(0, 2).map((task) => (
        <Link
          className={`ongoing-task ${task.paused ? 'paused' : ''}`}
          key={task.id}
          to={task.id === 'system-update' ? task.href! : jobsHref}
          title={`${task.title} · ${task.target} · ${[taskPercent(task), task.stage].filter(Boolean).join(' · ')}${error || jobs.error ? ' ' + tr('data_may_be_out_of_date_f878d6a7') : ''}`}
          aria-label={`${task.title}: ${task.target}, ${task.paused ? tr('paused_de6ceb5b') : taskPercent(task) || tr('in_progress_169836f8')}`}
        >
          <Icon path={task.paused ? mdiPause : task.href ? mdiSync : mdiProgressClock} size={18} />
          <span className="ongoing-task-percent">{taskPercent(task)}</span>
          <progress max={100} value={task.percent} aria-label={task.title} />
        </Link>
      ))}
      {tasks.length > 2 && (
        <Link
          className="ongoing-overflow"
          to={jobsHref}
          title={tr('all_long_running_tasks_ee8c43c9', { v0: tasks.length })}
          aria-label={tr('more_tasks_81c9cbd0', { v0: tasks.length - 2 })}
        >
          <Icon path={mdiDotsHorizontal} />
          <span>+{tasks.length - 2}</span>
        </Link>
      )}
    </div>
  )
}
