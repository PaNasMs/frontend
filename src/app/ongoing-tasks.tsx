import { useFileUploads, uploadActive, uploadPercent, fileTaskTitle } from './file-uploads'
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
function useOngoing() {
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
  const fileTasks = useFileUploads()
  const activeFileJobs = new Set(fileTasks.flatMap((task) => task.jobIds ?? (task.jobId ? [task.jobId] : [])))
  const uploads = fileTasks.filter(uploadActive).map((task) => ({
    id: task.id,
    title: fileTaskTitle(task),
    target: task.destination,
    stage: task.status === 'waiting' ? tr('uploads.waiting') : task.stage || task.name,
    paused: task.status === 'waiting',
    percent: uploadPercent(task),
    href: undefined,
  }))
  const tasks = [
    ...uploads,
    ...updates,
    ...raids,
    ...longJobs(
      (jobs.data ?? []).filter((job) => !activeFileJobs.has(job.id)),
      now,
      operations,
    ),
  ]
  return { tasks, jobsHref, stale: !!(error || jobs.error) }
}
/** Number of long-running tasks, for the counter on the Tasks button. */
export function useOngoingCount() {
  return useOngoing().tasks.length
}
export function OngoingTasks({ row = false }: { row?: boolean }) {
  const { tasks, jobsHref, stale } = useOngoing()
  if (!tasks.length) return null
  if (row) {
    const task = tasks[0]
    return (
      <Link
        className={`ongoing-row ${task.paused ? 'paused' : ''}`}
        to={task.id === 'system-update' ? task.href! : jobsHref}
        aria-label={`${task.title}: ${task.target}, ${task.paused ? tr('paused_de6ceb5b') : taskPercent(task) || tr('in_progress_169836f8')}`}
      >
        <span className="ongoing-row-title">{task.title}</span>
        <progress max={100} value={task.percent} aria-hidden="true" />
        <span className="ongoing-task-percent">{taskPercent(task)}</span>
        {tasks.length > 1 && <span className="ongoing-row-more">+{tasks.length - 1}</span>}
      </Link>
    )
  }
  return (
    <div className="ongoing-tasks" aria-label={tr('long_running_tasks_ef6b1f6c')}>
      {tasks.slice(0, 2).map((task) => (
        <Link
          className={`ongoing-task ${task.paused ? 'paused' : ''}`}
          key={task.id}
          to={task.id === 'system-update' ? task.href! : jobsHref}
          title={`${task.title} · ${task.target} · ${[taskPercent(task), task.stage].filter(Boolean).join(' · ')}${stale ? ' ' + tr('data_may_be_out_of_date_f878d6a7') : ''}`}
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
