import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { mdiClose, mdiFolderOutline, mdiUpload } from '@mdi/js'
import { Button, Icon, bytes } from '../shared/ui'
import { tr } from '../i18n'

// Session-local transfer contract published by the Files module, never persisted.
const uploadKey = ['file-uploads'] as const
export type UploadTask = {
  id: string
  destination: string
  name: string
  count: number
  completed: number
  loaded: number
  total: number
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  errors: string[]
  cancel: () => void
}
export const uploadActive = (task: UploadTask) => task.status === 'queued' || task.status === 'running'
export const uploadPercent = (task: UploadTask) =>
  task.status === 'succeeded'
    ? 100
    : Math.min(99, task.total ? Math.floor((task.loaded / task.total) * 100) : 0)
export function useFileUploads() {
  const q = useQueryClient()
  return (
    useQuery<UploadTask[]>({
      queryKey: uploadKey,
      enabled: false,
      gcTime: Infinity,
      initialData: () => q.getQueryData<UploadTask[]>(uploadKey) ?? [],
    }).data ?? []
  )
}
export function FileUploadTasks() {
  const tasks = useFileUploads()
  const q = useQueryClient()
  return (
    <div className="upload-tasks">
      {tasks.map((task) => (
        <article className="upload-task" key={task.id}>
          <div className="upload-task-heading">
            <Icon path={mdiUpload} size={18} />
            <strong>{tr('uploads.title')}</strong>
            <span className={task.status === 'failed' ? 'text-error' : 'muted'}>
              {tr(`uploads.${task.status}`)}
            </span>
            <Link
              className="button icon-only"
              to={'/files?path=' + encodeURIComponent(task.destination)}
              title={tr('uploads.open')}
              aria-label={tr('uploads.open')}
            >
              <Icon path={mdiFolderOutline} />
            </Link>
            <Button
              title={tr(uploadActive(task) ? 'uploads.cancel' : 'uploads.dismiss')}
              onClick={() => {
                if (uploadActive(task)) task.cancel()
                else
                  q.setQueryData<UploadTask[]>(uploadKey, (old) => old?.filter((item) => item.id !== task.id))
              }}
            >
              <Icon path={mdiClose} />
            </Button>
          </div>
          <p className="upload-task-path" title={task.destination}>
            {task.destination}
          </p>
          {uploadActive(task) && (
            <>
              <p className="upload-task-path">{task.name}</p>
              <progress max={100} value={uploadPercent(task)} aria-label={tr('uploads.title')} />
            </>
          )}
          <small>
            {task.completed}/{task.count} · {bytes(task.loaded)} / {bytes(task.total)}
            {uploadActive(task) ? ` · ${uploadPercent(task)}%` : ''}
          </small>
          {task.errors.length > 0 && (
            <details>
              <summary>{tr('uploads.errors', { count: task.errors.length })}</summary>
              <ul>
                {task.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </details>
          )}
        </article>
      ))}
    </div>
  )
}
