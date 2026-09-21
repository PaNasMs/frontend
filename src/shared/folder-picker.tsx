import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { mdiFolderOutline, mdiArrowUp, mdiCheck } from '@mdi/js'
import { managed } from '../app/operations'
import { tr } from '../i18n'
import { Button, Icon, Notice } from './ui'

export function FolderPicker({ onChoose }: { onChoose: (path: string) => void }) {
  const [path, setPath] = useState('')
  const data = useQuery({
    queryKey: ['share-folders', path],
    queryFn: () =>
      managed<{ roots: string[]; path: string; folders: { name: string; path: string }[] }>(
        'share-folders',
        undefined,
        path,
      ),
  })
  const rows = path ? data.data?.folders : data.data?.roots.map((root) => ({ name: root, path: root }))
  return (
    <div className="folder-picker">
      <div className="folder-picker-heading">
        <Button
          title={tr('ui.up')}
          disabled={!path}
          onClick={() => setPath(data.data?.roots.includes(path) ? '' : path.slice(0, path.lastIndexOf('/')))}
        >
          <Icon path={mdiArrowUp} />
        </Button>
        <strong>{path || tr('ui.browse')}</strong>
        <Button
          title={tr('ui.browse')}
          aria-label={tr('ui.browse')}
          disabled={!path || data.isPending || !!data.error}
          onClick={() => onChoose(path)}
        >
          <Icon path={mdiCheck} />
        </Button>
      </div>
      {data.isPending && <Notice>{tr('loading_interface_f69ec4bd')}</Notice>}
      {data.error && <Notice error>{data.error.message}</Notice>}
      <ul>
        {rows?.map((row) => (
          <li key={row.path}>
            <button type="button" onClick={() => setPath(row.path)}>
              <Icon path={mdiFolderOutline} />
              <span>{row.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {rows?.length === 0 && <p className="muted">{tr('ui.noMatches')}</p>}
    </div>
  )
}
