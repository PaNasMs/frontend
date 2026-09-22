import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { mdiClose, mdiFolderOutline, mdiUpload, mdiAlertCircleOutline, mdiContentCopy, mdiContentCut, mdiTrashCanOutline, mdiDeleteOutline } from '@mdi/js'
import { Button, Icon, bytes, DialogContent } from '../shared/ui'
import { tr } from '../i18n'

// Session-local transfer contract published by the Files module, never persisted.
const uploadKey = ['file-uploads'] as const
export type UploadTask = {
  id: string
  kind?: 'upload' | 'copy' | 'move' | 'trash' | 'delete'
  processed?: number
  skipped?: number
  stage?: string
  jobIds?: string[]
  jobId?: string
  cancelling?: boolean
  conflict?: { name: string; destination: string; suggested: string; directory: boolean; replaceAllowed: boolean; resolve: (choice: { mode: 'replace' | 'rename' | 'skip'; name?: string; all?: boolean }) => void }
  destination: string
  name: string
  count: number
  completed: number
  loaded: number
  total: number
  status: 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled'
  errors: string[]
  cancel: () => void
}
export const uploadActive = (task: UploadTask) => task.status === 'queued' || task.status === 'running' || task.status === 'waiting'
export const uploadPercent = (task: UploadTask) =>
  task.status === 'succeeded'
    ? 100
    : Math.min(99, task.kind && task.kind !== 'upload' ? Math.floor(((task.processed ?? task.completed) / task.count) * 100) : task.total ? Math.floor((task.loaded / task.total) * 100) : 0)
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
export const fileTaskTitle = (task: UploadTask) => task.kind && task.kind !== 'upload' ? tr('fileTasks.' + task.kind) : tr('uploads.title')
const taskIcon = (task: UploadTask) => task.status === 'waiting' ? mdiAlertCircleOutline : ({ copy: mdiContentCopy, move: mdiContentCut, trash: mdiTrashCanOutline, delete: mdiDeleteOutline, upload: mdiUpload })[task.kind ?? 'upload']
export function FileUploadTasks() {
  const tasks = useFileUploads()
  const q = useQueryClient()
  const [resolving, setResolving] = useState<string | null>(null)
  const selected = tasks.find(task => task.id === resolving && task.conflict)
  return <div className="upload-tasks">
    {tasks.map(task => <article className="upload-task" key={task.id}>
      <div className="upload-task-heading">
        <Icon path={taskIcon(task)} size={18} />
        <strong>{fileTaskTitle(task)}</strong>
        <span className={task.status === 'failed' || task.status === 'waiting' ? 'text-error' : 'muted'}>{tr(`uploads.${task.status}`)}</span>
        {task.conflict && <Button title={tr('fileTasks.resolve')} onClick={() => setResolving(task.id)}><Icon path={mdiAlertCircleOutline} /></Button>}
        <Link className="button icon-only" to={'/files?path=' + encodeURIComponent(task.destination)} title={tr('uploads.open')} aria-label={tr('uploads.open')}><Icon path={mdiFolderOutline} /></Link>
        <Button disabled={task.cancelling} title={tr(uploadActive(task) ? 'fileTasks.cancel' : 'uploads.dismiss')} onClick={() => {
          if (uploadActive(task)) task.cancel()
          else q.setQueryData<UploadTask[]>(uploadKey, old => old?.filter(item => item.id !== task.id))
        }}><Icon path={mdiClose} /></Button>
      </div>
      <p className="upload-task-path" title={task.destination}>{task.destination}</p>
      {uploadActive(task) && <><p className="upload-task-path">{task.name}</p><progress max={100} value={uploadPercent(task)} aria-label={fileTaskTitle(task)} /></>}
      <small>{task.completed}/{task.count}{(task.skipped ?? 0) > 0 ? ' · ' + tr('fileTasks.skipped', { count: task.skipped }) : ''}
        {(!task.kind || task.kind === 'upload') && <> · {bytes(task.loaded)} / {bytes(task.total)}</>}
        {uploadActive(task) ? ` · ${uploadPercent(task)}%` : ''}</small>
      {task.stage && <p className="muted small">{task.stage}</p>}
      {task.errors.length > 0 && <details><summary>{tr('uploads.errors', { count: task.errors.length })}</summary><ul>{task.errors.map((error, i) => <li key={i}>{error}</li>)}</ul></details>}
    </article>)}
    {selected?.conflict && <ConflictDialog key={selected.id + selected.conflict.destination} task={selected} onClose={() => setResolving(null)} />}
  </div>
}
function ConflictDialog({ task, onClose }: { task: UploadTask; onClose: () => void }) {
  const conflict = task.conflict!
  const [name, setName] = useState(conflict.suggested)
  const [all, setAll] = useState(false)
  const valid = !!name && name === name.trim() && !/[\/\x00-\x1f\x7f]/.test(name) && !['.', '..'].includes(name) && new TextEncoder().encode(name).length <= 255
  function resolve(mode: 'replace' | 'rename' | 'skip') { conflict.resolve({ mode, name: mode === 'rename' ? name : undefined, all }); onClose() }
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}><Dialog.Portal>
    <Dialog.Overlay className="dialog-overlay" /><DialogContent className="dialog file-conflict-dialog">
      <Dialog.Title>{tr('fileTasks.conflict')}</Dialog.Title>
      <Dialog.Description>{tr('fileTasks.exists')}</Dialog.Description>
      <p className="file-destination-path"><strong>{conflict.destination}</strong></p>
      {conflict.directory && <p className="muted">{tr('fileTasks.directoryReplace')}</p>}
      {!conflict.replaceAllowed && <p className="muted">{tr('fileTasks.replaceUnavailable')}</p>}
      <label className="field">{tr('fileTasks.newName')}<input value={name} maxLength={255} onChange={e => setName(e.target.value)} aria-invalid={!valid} /></label>
      <label className="check"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />{tr('fileTasks.applyAll')}</label>
      <div className="actions">
        <Button disabled={!conflict.replaceAllowed} onClick={() => resolve('replace')}>{tr('fileTasks.replace')}</Button>
        <Button disabled={!valid} onClick={() => resolve('rename')}>{tr('fileTasks.rename')}</Button>
        <Button onClick={() => resolve('skip')}>{tr('fileTasks.skip')}</Button>
        <Button onClick={onClose}>{tr('fileTasks.later')}</Button>
      </div>
    </DialogContent>
  </Dialog.Portal></Dialog.Root>
}
