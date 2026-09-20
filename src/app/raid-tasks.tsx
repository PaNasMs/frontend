import { tr } from '../i18n/index'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { mdiPause, mdiSync, mdiArrowTopRight } from '@mdi/js'
import { request, type Storage } from '../api/client'
import { Icon, Notice } from '../shared/ui'
import { raidTasks, taskPercent } from './active-tasks'
export function useRaidTasks(poll = false) {
  const storage = useQuery({
    queryKey: ['storage'],
    queryFn: () => request<Storage>('storage'),
    refetchInterval: poll ? 5000 : false,
  })
  return { tasks: raidTasks(storage.data?.arrays), error: storage.error }
}
export function SystemTasks({ tasks, error }: ReturnType<typeof useRaidTasks>) {
  return (
    <>
      {error && (
        <Notice error>
          {tr('could_not_refresh_system_tasks_373f6b24') + ' '}
          {error.message}
        </Notice>
      )}
      {tasks.map((task) => (
        <article className="system-task" key={task.id}>
          <div className="volume-heading">
            <h3>
              <Icon path={task.paused ? mdiPause : mdiSync} size={18} />
              {task.title}
            </h3>
            <Link
              to={task.href!}
              onClick={(event) => {
                const menu = event.currentTarget.closest('details')
                if (menu) menu.open = false
              }}
              title={tr('open_storage_abae2f84')}
              aria-label={tr('open_storage_bad1842b', { v0: task.target })}
            >
              <Icon path={mdiArrowTopRight} size={18} />
            </Link>
          </div>
          <div className="system-task-progress">
            <span>{task.target}</span>
            <strong>{taskPercent(task)}</strong>
          </div>
          <progress max={100} value={task.percent} aria-label={`${task.title}: ${task.target}`} />
          <p className="small muted">{error ? tr('data_is_out_of_date_91b76e66') : task.stage}</p>
        </article>
      ))}
    </>
  )
}
