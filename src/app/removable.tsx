import { WaitingOverlay } from '../shared/ui'
import { DialogContent } from '../shared/ui'
import { tr } from '../i18n/index'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { waitForJob } from '../shared/job-completion'
import { newID } from './dashboard'
import { mdiLink, mdiEject, mdiUsbFlashDrive, mdiMicroSd, mdiHarddisk } from '@mdi/js'
import * as Dialog from '@radix-ui/react-dialog'
import { managed, type Job } from './operations'
import { Button, Icon, bytes } from '../shared/ui'
import type { MediaInfo } from './storage-volumes'
export type Removable = {
  filesystemHealth?: {
    identity: string
    status: string
    reason: string
    repairAvailable: boolean
    checkedAt: number
  } | null
  path: string
  parent?: string
  tran?: string
  type: string
  fstype?: string
  uuid?: string
  model?: string
  name: string
  size: number
  ejectable: boolean
  protectedReason?: string
  media?: MediaInfo
  ro?: boolean
  mountpoints?: string[]
  mountSettings?: {
    point: string
    automount: boolean
    readOnly: boolean
  }
}
const mounted = (d: Removable) => d.mountpoints?.filter(Boolean) ?? []
export function volumeMountParams(v: Removable) {
  return {
    target: v.path,
    point: v.mountSettings?.point ?? `/mnt/usb/${encodeURIComponent(v.uuid!).replaceAll('.', '%2E')}`,
    automount: v.mountSettings?.automount ?? false,
    readOnly: !!v.ro || !!v.mountSettings?.readOnly,
  }
}
export function deviceVolumes(device: Removable, devices: Removable[]) {
  return devices.filter(
    (v) =>
      (v.path === device.path || v.parent === device.path) &&
      v.fstype &&
      v.uuid &&
      !v.protectedReason &&
      ['disk', 'part'].includes(v.type) &&
      !['linux_raid_member', 'crypto_LUKS', 'swap', 'LVM2_member'].includes(v.fstype),
  )
}
export function singleVolume(device: Removable, devices: Removable[]) {
  const volumes = deviceVolumes(device, devices)
  return volumes.length === 1 &&
    devices.filter((v) => v.parent === device.path && v.type === 'part').length <= 1
    ? volumes[0]
    : undefined
}
type RecoveryMode = 'auto' | 'repair' | 'repair-only' | 'readonly'
export class VolumeChoice extends Error {
  constructor(
    public reason: string,
    public repairAvailable: boolean,
  ) {
    super(reason)
  }
}
const readonlyChoices = new Set<string>()
export function recoveryKey(volume: Removable) {
  const health = volume.filesystemHealth
  return `${volume.path}:${volume.uuid}:${health?.identity}:${health?.checkedAt}`
}
function loadRecovery() {
  try {
    return JSON.parse(sessionStorage.getItem('panasms-offered-recovery') ?? '[]') as string[]
  } catch {
    return []
  }
}
const offeredRecovery = new Set<string>(loadRecovery())
function rememberRecovery(volume: Removable) {
  offeredRecovery.add(recoveryKey(volume))
  try {
    sessionStorage.setItem('panasms-offered-recovery', JSON.stringify([...offeredRecovery]))
  } catch {}
}
const pendingMounts = new Map<string, Promise<string>>()
export function openVolume(volume: Removable, mode: RecoveryMode = 'auto'): Promise<string> {
  const key = volume.path + ':' + volume.uuid
  const pending = pendingMounts.get(key)
  if (pending) return pending
  const operation = (async () => {
    const latest = await managed<{
      devices: Removable[]
    }>('storage-options')
    const current = latest.devices.find((v) => v.path === volume.path && v.uuid === volume.uuid)
    if (!current) throw Error(tr('the_drive_was_disconnected_or_the_partition_change_6034a82c'))
    if (!mounted(current).length) readonlyChoices.delete(key)
    const selected = mode === 'auto' && readonlyChoices.has(key) ? 'readonly' : mode
    const params = {
      ...volumeMountParams(current),
      point: mounted(current)[0] || volumeMountParams(current).point,
      mode: selected,
    }
    const action = 'mount.open'
    const plan = await managed<{
      fingerprint: string
      confirmation: string
    }>('plan', { action, params })
    const job = await managed<{
      id: string
    }>('run', {
      id: newID(),
      action,
      params,
      fingerprint: plan.fingerprint,
      confirmation: plan.confirmation,
    })
    let completed: Job | undefined
    await waitForJob(
      async () => {
        completed = (await managed<Job[]>('jobs')).find((j) => j.id === job.id)
        return completed
      },
      undefined,
      14400,
    )
    const result = completed?.result
    if (result?.needsChoice) throw new VolumeChoice(String(result.reason), !!result.repairAvailable)
    if (selected === 'repair-only' && result?.repaired) return ''
    if (typeof result?.point !== 'string')
      throw Error(tr('the_system_did_not_confirm_the_volume_mount_c6f6928e'))
    if (selected === 'readonly') readonlyChoices.add(key)
    else readonlyChoices.delete(key)
    return result.point
  })()
  pendingMounts.set(key, operation)
  void operation.finally(() => pendingMounts.delete(key)).catch(() => {})
  return operation
}
export function useVolumeAccess() {
  const query = useQueryClient()
  const [prompt, setPrompt] = useState<{
    volume: Removable
    choice: VolumeChoice
    discovery?: boolean
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const completion = useRef<{
    resolve: (point: string) => void
    reject: (error: Error) => void
  } | null>(null)
  useEffect(() => () => completion.current?.reject(Error(tr('mount_cancelled_1d01ec14'))), [])
  async function refresh() {
    await Promise.all(
      ['files', 'file-places', 'management-storage', 'jobs'].map((key) =>
        query.invalidateQueries({ queryKey: [key] }),
      ),
    )
  }
  async function open(volume: Removable) {
    try {
      const point = await openVolume(volume)
      await refresh()
      return point
    } catch (e) {
      if (!(e instanceof VolumeChoice)) throw e
      if (completion.current) throw Error(tr('finish_mounting_the_previous_volume_first_b8145ecb'))
      rememberRecovery(volume)
      setError('')
      setPrompt({ volume, choice: e })
      return new Promise<string>((resolve, reject) => {
        completion.current = { resolve, reject }
      })
    }
  }
  function cancel() {
    if (busy) return
    completion.current?.reject(Error(tr('mount_cancelled_1d01ec14')))
    completion.current = null
    setPrompt(null)
  }
  async function choose(mode: RecoveryMode) {
    if (!prompt || busy) return
    setBusy(true)
    setError('')
    try {
      const point = await openVolume(
        prompt.volume,
        prompt.discovery && mode === 'repair' ? 'repair-only' : mode,
      )
      await refresh()
      completion.current?.resolve(point)
      completion.current = null
      setPrompt(null)
    } catch (e) {
      if (e instanceof VolumeChoice) setPrompt({ ...prompt, choice: e })
      else setError((e as Error).message)
      await refresh()
    } finally {
      setBusy(false)
    }
  }
  const dialog = (
    <Dialog.Root
      open={!!prompt}
      onOpenChange={(value) => {
        if (!value) cancel()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <DialogContent
          busy={busy}
          className="eject-confirm-dialog"
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault()
          }}
          onPointerDownOutside={(e) => {
            if (busy) e.preventDefault()
          }}
        >
          <Dialog.Title>{tr('drive_errors_53b12628')}</Dialog.Title>
          <Dialog.Description>
            {tr('volume_3c0fb401') + ' '}
            <strong>{prompt?.volume.name}</strong>
            {' ' + tr('has_a_file_system_problem_902df8e5')}{' '}
            {prompt?.discovery
              ? tr('repair_now_the_volume_will_remain_unmounted_7578f67c')
              : tr('it_must_be_repaired_before_mounting_you_can_also_o_0ac3ec97')}
          </Dialog.Description>
          <p className="small muted">{tr('repair_may_modify_damaged_files_e0203e09')}</p>
          {prompt && (
            <details className="small">
              <summary>{tr('reason_4a9ea52c')}</summary>
              <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>
                {prompt.choice.reason}
              </pre>
            </details>
          )}
          {!prompt?.choice.repairAvailable && (
            <p className="small muted">{tr('automatic_repair_is_not_available_for_this_volume_47b2501e')}</p>
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          {busy && (
            <p role="status">
              {prompt?.discovery
                ? tr('checking_and_repairing_7b6f3b2f')
                : tr('checking_and_mounting_a11d30a6')}
            </p>
          )}
          <div className="actions">
            <Button disabled={busy || !prompt?.choice.repairAvailable} onClick={() => void choose('repair')}>
              {tr('repair_9b1c9a02')}
            </Button>
            {!prompt?.discovery && (
              <Button disabled={busy} onClick={() => void choose('readonly')}>
                {tr('read_only_c5eb2661')}
              </Button>
            )}
            <Button disabled={busy} onClick={cancel}>
              {prompt?.discovery ? tr('skip_fe100801') : tr('cancel_0ec753be')}
            </Button>
          </div>
        </DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
  function offer(volume: Removable) {
    if (prompt || pendingMounts.has(volume.path + ':' + volume.uuid)) return false
    const health = volume.filesystemHealth
    if (!health) return false
    rememberRecovery(volume)
    setError('')
    setPrompt({ volume, choice: new VolumeChoice(health.reason, health.repairAvailable), discovery: true })
    return true
  }
  return { open, dialog, offer, prompting: !!prompt }
}
export function MountVolumeButton({ volume, disabled = false }: { volume: Removable; disabled?: boolean }) {
  const access = useVolumeAccess()
  const mutation = useMutation({ mutationFn: () => access.open(volume) })
  return (
    <>
      {access.dialog}
      <Button
        className="raid-action"
        title={tr('mount_volume_9aa3b71f')}
        aria-label={tr('mount_volume_9aa3b71f')}
        disabled={disabled || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        <Icon path={mdiLink} />
      </Button>
      {mutation.error && (
        <p className="error-text" role="alert">
          {mutation.error.message}
        </p>
      )}
    </>
  )
}
export function EjectButton({
  device,
  disabled = false,
}: {
  device: {
    path: string
    name: string
    model?: string | null
  }
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const query = useQueryClient()
  const cancel = useRef<HTMLButtonElement>(null)
  const eject = useMutation({
    mutationFn: async () => {
      const action = 'disk.eject'
      const params = { target: device.path }
      const plan = await managed<{
        fingerprint: string
        confirmation: string
      }>('plan', { action, params })
      return managed<{
        id: string
      }>('run', {
        id: newID(),
        action,
        params,
        fingerprint: plan.fingerprint,
        confirmation: plan.confirmation,
      })
    },
    onSuccess: async () => {
      await query.invalidateQueries({ queryKey: ['jobs'] })
      setOpen(false)
    },
  })
  const label = device.model?.trim() || device.name
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!eject.isPending) {
          setOpen(value)
          eject.reset()
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          className="raid-action"
          aria-label={tr('eject_0751a5d4', { v0: label })}
          title={tr('eject_0751a5d4', { v0: label })}
          disabled={disabled}
        >
          <Icon path={mdiEject} />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <DialogContent
          busy={eject.isPending}
          className="eject-confirm-dialog"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            cancel.current?.focus()
          }}
        >
          <Dialog.Title>
            {tr('eject_15625872')}
            {label}»?
          </Dialog.Title>
          <Dialog.Description className="muted">
            {tr('mounted_partitions_will_be_unmounted_e6ec4adc')}
          </Dialog.Description>
          {eject.error && (
            <p className="error-text" role="alert">
              {eject.error.message}
            </p>
          )}
          <div className="actions">
            <Button className="primary" disabled={eject.isPending} onClick={() => eject.mutate()}>
              {tr('yes_8d2fab2d')}
            </Button>
            <Dialog.Close asChild>
              <button ref={cancel} className="button" disabled={eject.isPending}>
                {tr('no_f82a8219')}
              </button>
            </Dialog.Close>
          </div>
        </DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
export function RemovableMenu() {
  const menu = useRef<HTMLDetailsElement>(null)
  const query = useQueryClient()
  const access = useVolumeAccess()
  const mount = useMutation({
    mutationFn: access.open,
    onSuccess: async () => {
      await query.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
  const data = useQuery({
    queryKey: ['management-storage', 'all'],
    queryFn: () =>
      managed<{
        devices: Removable[]
      }>('storage-options'),
    refetchInterval: 10000,
  })
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => managed<Job[]>('jobs') })
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (
        menu.current &&
        !menu.current.contains(e.target as Node) &&
        !(e.target as Element).closest('[role="dialog"]')
      )
        menu.current.open = false
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menu.current) menu.current.open = false
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', key)
    }
  }, [])
  useEffect(() => {
    if (!data.data) return
    const currentKeys = new Set((data.data?.devices ?? []).map(recoveryKey))
    for (const key of offeredRecovery) if (!currentKeys.has(key)) offeredRecovery.delete(key)
    for (const volume of data.data?.devices ?? []) {
      if (mounted(volume).length) continue
      const health = volume.filesystemHealth
      if (!health || !['errors', 'unavailable'].includes(health.status)) continue
      const key = recoveryKey(volume)
      if (!offeredRecovery.has(key) && access.offer(volume)) break
    }
  }, [data.data, access])
  const devices = data.data?.devices.filter((d) => d.ejectable) ?? []
  if (!devices.length) return null
  return (
    <>
      {access.dialog}
      <details className="removable-menu" ref={menu}>
        <summary
          className="topbar-action"
          title={tr('removable_devices_a99b2360')}
          aria-label={tr('removable_devices_a99b2360')}
        >
          <Icon path={mdiEject} />
        </summary>
        <div className="removable-dropdown">
          {mount.isPending && !access.prompting && <WaitingOverlay message={tr('mount_volume_9aa3b71f')} />}
          <h3>{tr('disks_and_devices_a52adeda')}</h3>
          {devices.map((d) => {
            const volumes = deviceVolumes(d, data.data?.devices ?? [])
            const busy =
              mount.isPending ||
              jobs.data?.some(
                (j) =>
                  [d.path, ...volumes.map((v) => v.path)].includes(j.target) &&
                  ['queued', 'running'].includes(j.status),
              )
            const points = volumes.flatMap(mounted)
            const single = d.tran === 'usb' ? singleVolume(d, data.data?.devices ?? []) : undefined
            return (
              <section className="removable-device" key={d.path}>
                <div className="removable-row">
                  <Icon
                    path={
                      d.media?.kind === 'usb-flash'
                        ? mdiUsbFlashDrive
                        : d.media?.kind === 'sd'
                          ? mdiMicroSd
                          : mdiHarddisk
                    }
                  />
                  <div>
                    <strong>{d.model?.trim() || d.media?.name || d.name}</strong>
                    <small>
                      {bytes(d.size)} · {d.path}
                    </small>
                    <small>
                      {busy
                        ? tr('operation_in_progress_10a75370')
                        : volumes.some((v) => v.filesystemHealth?.status === 'checking')
                          ? tr('checking_file_system_47671c8f')
                          : volumes.some((v) => v.filesystemHealth?.status === 'errors')
                            ? tr('file_system_errors_detected_ac8d683d')
                            : points.length
                              ? single
                                ? points.join(', ')
                                : tr('volumes_mounted_998512e1')
                              : tr('not_mounted_f3e5f0eb')}
                    </small>
                  </div>
                  {single && !mounted(single).length && (
                    <Button
                      className="raid-action"
                      aria-label={tr('mount_aa8039aa', { v0: d.model?.trim() || d.name })}
                      title={tr('mount_aa8039aa', { v0: d.model?.trim() || d.name })}
                      disabled={busy}
                      onClick={() => mount.mutate(single)}
                    >
                      <Icon path={mdiLink} />
                    </Button>
                  )}
                  <EjectButton device={d} disabled={!!busy} />
                </div>
                {d.tran === 'usb' &&
                  !single &&
                  volumes.map((v) => {
                    const paths = mounted(v)
                    return (
                      <div className="removable-volume" key={v.path}>
                        <div>
                          <strong>
                            {v.name} · {v.fstype}
                          </strong>
                          <small>
                            {v.filesystemHealth?.status === 'checking'
                              ? tr('checking_file_system_47671c8f')
                              : paths.length
                                ? paths.join(', ')
                                : bytes(v.size)}
                          </small>
                        </div>
                        {!paths.length && (
                          <Button
                            className="raid-action"
                            aria-label={tr('mount_aa8039aa', { v0: v.name })}
                            title={tr('mount_aa8039aa', { v0: v.name })}
                            disabled={busy}
                            onClick={() => mount.mutate(v)}
                          >
                            <Icon path={mdiLink} />
                          </Button>
                        )}
                      </div>
                    )
                  })}
                {mount.error && volumes.some((v) => v.path === mount.variables?.path) && (
                  <p className="error-text" role="alert">
                    {mount.error.message}
                  </p>
                )}
                {d.tran === 'usb' && !volumes.length && (
                  <p className="small muted">{tr('no_file_systems_available_to_mount_4d76996e')}</p>
                )}
              </section>
            )
          })}
        </div>
      </details>
    </>
  )
}
