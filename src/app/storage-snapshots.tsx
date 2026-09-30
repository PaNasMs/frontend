import { useQuery } from '@tanstack/react-query'
import { mdiContentCopy, mdiRestore, mdiDeleteOutline } from '@mdi/js'
import { tr } from '../i18n/index'
import { Notice } from '../shared/ui'
import { managed, OperationButton } from './operations'

export function SnapshotActions({ target }: { target: string }) {
  const snapshots = useQuery({
    queryKey: ['storage-snapshots', target],
    queryFn: () => managed<{ snapshots: { name: string }[] }>('storage-snapshots', undefined, target),
  })
  const choices = { snapshot: (snapshots.data?.snapshots ?? []).map((s) => ({ id: s.name, label: s.name })) }
  return (
    <>
      <OperationButton
        icon={mdiContentCopy}
        label={tr('storage.snapshot_create')}
        actions={['filesystem.snapshot-create']}
        initial={{ target }}
        context={[{ key: 'target', label: tr('volume_e36475fc'), value: target }]}
        onDone={() => void snapshots.refetch()}
      />
      <OperationButton
        icon={mdiRestore}
        label={tr('storage.snapshot_restore')}
        actions={['filesystem.snapshot-restore']}
        initial={{ target }}
        context={[{ key: 'target', label: tr('volume_e36475fc'), value: target }]}
        choices={choices}
        disabled={!choices.snapshot.length}
        onDone={() => void snapshots.refetch()}
      />
      <OperationButton
        icon={mdiDeleteOutline}
        label={tr('storage.snapshot_delete')}
        actions={['filesystem.snapshot-delete']}
        initial={{ target }}
        context={[{ key: 'target', label: tr('volume_e36475fc'), value: target }]}
        choices={choices}
        disabled={!choices.snapshot.length}
        onDone={() => void snapshots.refetch()}
      />
      {snapshots.error && <Notice error>{snapshots.error.message}</Notice>}
    </>
  )
}
