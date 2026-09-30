import { useQuery } from '@tanstack/react-query'
import {
  mdiKeyPlus,
  mdiKeyRemove,
  mdiLockOpenVariantOutline,
  mdiLockOutline,
  mdiContentSaveOutline,
  mdiRestore,
} from '@mdi/js'
import { tr } from '../i18n/index'
import { Notice } from '../shared/ui'
import { managed, OperationButton } from './operations'

export function LuksActions({ target, unlocked }: { target: string; unlocked: boolean }) {
  const state = useQuery({
    queryKey: ['storage-luks', target],
    queryFn: () =>
      managed<{
        slots: number[]
        automatic: boolean
        managedSlot: number | null
      }>('storage-luks', undefined, target),
  })
  const choices = {
    slot: (state.data?.slots ?? [])
      .filter((s) => s !== state.data?.managedSlot)
      .map((s) => ({ id: String(s), label: String(s) })),
  }
  const configured = state.data?.managedSlot != null
  const refresh = () => {
    void state.refetch()
  }
  return (
    <>
      <OperationButton
        icon={mdiKeyPlus}
        label={tr('storage.key_add')}
        actions={['luks.key-add']}
        initial={{ target }}
        context={[{ key: 'target', label: tr('volume_e36475fc'), value: target }]}
        onDone={refresh}
      />
      <OperationButton
        icon={mdiKeyRemove}
        label={tr('storage.key_remove')}
        actions={['luks.key-remove']}
        initial={{ target }}
        context={[{ key: 'target', label: tr('volume_e36475fc'), value: target }]}
        choices={choices}
        disabled={!state.data || state.data.slots.length < 2}
        onDone={refresh}
      />
      <OperationButton
        icon={configured ? mdiLockOutline : mdiLockOpenVariantOutline}
        label={tr(configured ? 'storage.auto_disable' : 'storage.auto_enable')}
        actions={[configured ? 'luks.auto-disable' : 'luks.auto-enable']}
        initial={{ target }}
        context={[{ key: 'target', label: tr('volume_e36475fc'), value: target }]}
        disabled={!state.data}
        onDone={refresh}
      />
      <OperationButton
        icon={mdiContentSaveOutline}
        label={tr('storage.header_backup')}
        actions={['luks.header-backup']}
        initial={{ target }}
        context={[{ key: 'target', label: tr('volume_e36475fc'), value: target }]}
      />
      <OperationButton
        icon={mdiRestore}
        label={tr('storage.header_restore')}
        actions={['luks.header-restore']}
        initial={{ target }}
        context={[{ key: 'target', label: tr('volume_e36475fc'), value: target }]}
        disabled={unlocked || !!state.data?.automatic}
        onDone={refresh}
      />
      {state.error && <Notice error>{state.error.message}</Notice>}
    </>
  )
}
