import { tr } from '../i18n/index'
import {
  mdiPlus,
  mdiFormatPaint,
  mdiLock,
  mdiLockOpen,
  mdiArrowExpand,
  mdiDeleteOutline,
  mdiEraser,
  mdiLink,
  mdiLinkOff,
  mdiCogOutline,
  mdiClose,
  mdiChevronRight,
  mdiHarddisk,
  mdiNas,
  mdiMicroSd,
  mdiUsbFlashDrive,
  mdiFolderNetworkOutline,
  mdiCheckCircleOutline,
  mdiMinusCircleOutline,
  mdiShieldLockOutline,
  mdiSelectAll,
} from '@mdi/js'
import { useState, type ReactNode } from 'react'
import { MountVolumeButton } from './removable'
import { OperationButton } from './operations'
import { Button, Icon, Notice, bytes } from '../shared/ui'
import type { Device, Mount } from '../api/client'
export type MediaInfo = {
  kind: string
  readOnly: boolean
  name?: string
  manufacturerId?: string
  manufactured?: string
  revision?: string
  usbId?: string
  usbVersion?: string
  linkMbps?: string
  manufacturer?: string
}
export type StorageOptions = {
  sleepSettings?: {
    minutes: number
  } | null
  sleepStatus?: Record<
    string,
    {
      device: string
      minutes: number | null
      status: string
      error?: string
    }
  >
  devices: {
    smartSchedules?: {
      test: string
      weekday: number
      hour: number
      weeks: number
      startDate?: string
    }[]
    smartSchedule?: {
      test: string
      weekday: number
      hour: number
    } | null
    media?: MediaInfo
    path: string
    kname: string
    mountSettings?: {
      point: string
      automount: boolean
      readOnly: boolean
    }
    protectedReason: string
    busyReason: string
    raidReason: string
    raidEligible: boolean
    ejectable: boolean
  }[]
  formats: string[]
}
const flatten = (nodes: Device[]): Device[] => nodes.flatMap((d) => [d, ...flatten(d.children ?? [])])
const mounted = (d: Device) => d.mountpoints?.some(Boolean) ?? false
const context = (d: Device) => [
  {
    key: 'target',
    label: tr('volume_e36475fc'),
    value: `${d.label || d.model?.trim() || d.name} · ${d.path}`,
  },
]
type Selection = {
  root: string
  path?: string
  start?: number
  end?: number
  network?: string
}
export function StorageVolumes({
  devices,
  mounts,
  options,
  arrayNames = {},
}: {
  devices: Device[]
  mounts: Mount[]
  options?: StorageOptions
  arrayNames?: Record<string, string>
}) {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (key: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setSelection(null)
  }
  const root = devices.find((d) => d.path === selection?.root)
  const selected =
    root && selection?.path ? flatten([root]).find((d) => d.path === selection.path) : undefined
  const policy = options?.devices.find(
    (d) => d.path === (selected ?? root)?.path || d.kname === (selected ?? root)?.kname,
  )
  const systemReason = policy?.protectedReason
  const protectedDevice = !options || !policy || !!systemReason
  const attached = selected && mounted(selected)
  const point = selected?.mountpoints?.find(Boolean) ?? ''
  const children = selected?.children?.length ?? 0
  const free = !!root && selection?.path === undefined
  const offlineReason = attached
    ? tr('unmount_the_volume_first_413b34be')
    : children
      ? tr('unmount_dependent_volumes_first_88434b0a')
      : ''
  const object = selected ?? root
  const actionIcons: Record<string, string> = {
    'partition.create': mdiPlus,
    'filesystem.format': mdiFormatPaint,
    'luks.create': mdiLock,
    'luks.open': mdiLockOpen,
    'luks.close': mdiLock,
    'filesystem.resize': mdiArrowExpand,
    'partition.resize': mdiArrowExpand,
    'partition.delete': mdiDeleteOutline,
    'disk.prepare': mdiEraser,
    'mount.attach': mdiLink,
    'mount.detach': mdiLinkOff,
    'mount.settings': mdiCogOutline,
  }
  const choose = (next: Selection) =>
    setSelection((current) =>
      current?.root === next.root &&
      current.path === next.path &&
      current.start === next.start &&
      current.network === next.network
        ? null
        : next,
    )
  const action = (name: string, label: string, reason = '', initial: Record<string, unknown> = {}) =>
    object && name === 'mount.attach' && root?.tran === 'usb' ? (
      <MountVolumeButton
        volume={{
          path: object.path,
          name: object.name,
          type: object.type,
          uuid: object.uuid ?? undefined,
          size: object.size,
          ejectable: false,
          mountSettings: policy?.mountSettings,
        }}
        disabled={protectedDevice || !!reason}
      />
    ) : (
      object && (
        <span className="context-action" title={reason || undefined}>
          <OperationButton
            key={`${object.path}:${selection?.start}:${name}`}
            icon={actionIcons[name]}
            label={reason ? `${label} — ${reason}` : label}
            actions={[name]}
            initial={{
              target: object.path,
              ...(name === 'mount.attach' ? { point: '/srv/' + (object.label || object.name) } : {}),
              ...initial,
            }}
            fields={
              name === 'partition.create'
                ? [
                    {
                      key: 'sizeMiB',
                      label: tr('partition_size_mib_5990daed'),
                      type: 'number',
                      value: selection!.end! - selection!.start!,
                    },
                  ]
                : undefined
            }
            context={context(object)}
            description={
              name === 'mount.settings'
                ? tr('the_options_will_apply_the_next_time_the_volume_is_7e732f3d')
                : undefined
            }
            autoReview
            disabled={protectedDevice || !!reason}
          />
        </span>
      )
    )
  const network = mounts.filter((m) => m.fstype === 'nfs' || m.fstype === 'nfs4' || m.fstype === 'cifs')
  const selectedNetwork = network.find((m) => m.target === selection?.network)
  const servers = new Map<string, Mount[]>()
  for (const mount of network) {
    const server = mount.source.startsWith('//')
      ? mount.source.slice(2).split('/')[0]
      : mount.source.split(':/')[0]
    servers.set(server, [...(servers.get(server) ?? []), mount])
  }
  const usage = (mount?: Mount) =>
    mount?.used != null && Number(mount.size) > 0 ? (
      <span className="hierarchy-usage">
        <progress
          aria-label={tr('used_space_2e2871cb')}
          aria-valuetext={`${bytes(Number(mount.used))} / ${bytes(Number(mount.size))} · ${Math.round((Number(mount.used) / Number(mount.size)) * 100)}%`}
          max={Number(mount.size)}
          value={Number(mount.used)}
        />
        <small>
          {bytes(Number(mount.used))} / {bytes(Number(mount.size))}
        </small>
      </span>
    ) : null
  const volume = (device: Device, owner: Device): ReactNode => {
    const mount = mounts.find((m) => m.source === device.path || device.mountpoints?.includes(m.target))
    const connected = !!mount || mounted(device)
    return (
      <li key={device.path}>
        <button
          className="hierarchy-volume"
          aria-pressed={selection?.root === owner.path && selection.path === device.path}
          onClick={() => choose({ root: owner.path, path: device.path })}
        >
          <Icon path={device.fstype === 'crypto_LUKS' ? mdiLock : mdiHarddisk} />
          <span className="hierarchy-name">
            <strong>{device.label || arrayNames[device.path] || device.name}</strong>
            <small>
              {device.path}
              {connected
                ? ` → ${device.mountpoints?.filter(Boolean).join(', ') || mount?.target}`
                : ' ' + tr('not_mounted_c02135e1')}
            </small>
          </span>
          <span className="hierarchy-format">
            {device.fstype === 'crypto_LUKS'
              ? 'LUKS'
              : device.fstype?.toUpperCase() || tr('no_file_system_23c36271')}
          </span>
          {usage(mount) || <span className="hierarchy-capacity">{bytes(device.size)}</span>}
          {mount && (
            <span className="hierarchy-access">
              {mount.options.split(',').includes('ro')
                ? tr('read_only_c5eb2661')
                : tr('read_and_write_823409cc')}
            </span>
          )}
          <span
            className={connected ? 'status-icon' : 'muted'}
            title={connected ? tr('mounted_81e0cd16') : tr('not_mounted_f3902829')}
            role="img"
            aria-label={connected ? tr('mounted_81e0cd16') : tr('not_mounted_f3902829')}
          >
            <Icon path={connected ? mdiCheckCircleOutline : mdiMinusCircleOutline} />
          </span>
        </button>
        {!!device.children?.length && (
          <ul className="hierarchy-children">{device.children.map((child) => volume(child, owner))}</ul>
        )}
      </li>
    )
  }
  return (
    <>
      <div className="storage-tab-intro">
        <p className="muted">{tr('volumes_are_grouped_by_device_network_shares_are_g_027d7f17')}</p>
        <OperationButton
          icon={mdiLink}
          label={tr('mount_network_share_350fe799')}
          actions={['nfs.mount', 'smb.mount']}
          description={tr('choose_nfs_or_smb_then_specify_the_share_address_a_e9557204')}
        />
      </div>
      <div className="volume-action-slot hierarchy-action-slot">
        {selectedNetwork && (
          <div className="selection-bar volume-selection" aria-label={tr('selected_mount_actions_fbf1152b')}>
            <strong>{selectedNetwork.source.split('/').filter(Boolean).at(-1)}</strong>
            <span className="small muted">{selectedNetwork.target}</span>
            <div className="context-actions">
              <OperationButton
                icon={mdiLinkOff}
                label={tr('unmount_network_share_dd0cee6d')}
                actions={[selectedNetwork.fstype === 'cifs' ? 'smb.unmount' : 'nfs.unmount']}
                initial={{ target: selectedNetwork.target }}
                context={[
                  {
                    key: 'target',
                    label: tr('mount_79e350f7'),
                    value: `${selectedNetwork.source} → ${selectedNetwork.target}`,
                  },
                ]}
                autoReview
              />
            </div>
            <Button
              aria-label={tr('clear_selection_91471074')}
              title={tr('clear_selection_91471074')}
              onClick={() => setSelection(null)}
            >
              <Icon path={mdiClose} />
            </Button>
          </div>
        )}
        {root && (
          <div className="selection-bar volume-selection" aria-label={tr('selected_item_actions_8037b8be')}>
            <div>
              <strong>{free ? tr('unallocated_space_a9769454') : selected?.label || selected?.name}</strong>
              <p className="small muted">
                {object?.path}
                {free ? ` · ${bytes((selection!.end! - selection!.start!) * 1048576)}` : ''}
              </p>
            </div>{' '}
            {protectedDevice ? (
              <Notice>{systemReason || tr('checking_available_actions_8f7ab614')}</Notice>
            ) : (
              <div className="context-actions">
                {free && (
                  <>
                    {action(
                      'partition.create',
                      tr('create_partition_cc6989af'),
                      flatten([root]).some(mounted)
                        ? tr('unmount_the_volumes_on_this_device_first_b760465a')
                        : '',
                      { startMiB: selection!.start, endMiB: selection!.end },
                    )}
                    {!root.children?.length && (
                      <>
                        {action('filesystem.format', tr('create_file_system_6dca1ae4'))}
                        {action('luks.create', tr('create_encrypted_volume_a70fa700'))}
                      </>
                    )}
                  </>
                )}
                {selected && (
                  <>
                    {selected.fstype === 'crypto_LUKS' ? (
                      <>
                        {action(
                          'luks.open',
                          tr('unlock_volume_60949765'),
                          children ? tr('the_volume_is_already_unlocked_1872685b') : '',
                        )}
                      </>
                    ) : (
                      <>
                        {selected.fstype && (
                          <>
                            {action(
                              attached ? 'mount.detach' : 'mount.attach',
                              attached ? tr('unmount_volume_045babe0') : tr('mount_volume_9aa3b71f'),
                              children ? tr('select_the_target_volume_first_bbfb3e40') : '',
                            )}
                            {action('mount.settings', tr('mount_options_64cffcf3'), '', {
                              point: point || '/srv/' + (selected.label || selected.name),
                              automount: false,
                              readOnly: false,
                              ...policy?.mountSettings,
                            })}
                            {['ext2', 'ext3', 'ext4', 'xfs', 'btrfs'].includes(selected.fstype) &&
                              action(
                                'filesystem.resize',
                                tr('file_system_size_c7bfc545'),
                                selected.fstype.startsWith('ext')
                                  ? offlineReason
                                  : !attached
                                    ? tr('mount_the_volume_first_fc3ff5a5')
                                    : '',
                                {
                                  sizeMiB: selected.fstype.startsWith('ext')
                                    ? Math.floor(selected.size / 1048576)
                                    : 0,
                                },
                              )}
                          </>
                        )}
                        {action(
                          'filesystem.format',
                          selected.fstype ? tr('format_volume_01553c8e') : tr('create_file_system_6dca1ae4'),
                          offlineReason,
                        )}
                        {!selected.fstype &&
                          action('luks.create', tr('create_encrypted_volume_a70fa700'), offlineReason)}
                      </>
                    )}
                    {selected.type === 'part' && (
                      <>
                        {(!selected.fstype || selected.fstype.startsWith('ext')) &&
                          action('partition.resize', tr('partition_size_8669469a'), offlineReason, {
                            sizeMiB: Math.floor(selected.size / 1048576),
                          })}
                        {action('partition.delete', tr('delete_partition_74a0d7ba'), offlineReason)}
                      </>
                    )}
                    {selected.type === 'crypt' &&
                      action('luks.close', tr('lock_volume_dd9f2c5c'), offlineReason)}
                    {['disk', 'part'].includes(selected.type) &&
                      action(
                        'disk.prepare',
                        tr('wipe_device_79e13b21'),
                        flatten([selected]).some(mounted)
                          ? tr('unmount_all_volumes_on_this_device_first_285d5f2a')
                          : '',
                      )}
                  </>
                )}
              </div>
            )}
            <Button
              aria-label={tr('clear_selection_91471074')}
              title={tr('clear_selection_91471074')}
              onClick={() => setSelection(null)}
            >
              <Icon path={mdiClose} />
            </Button>
          </div>
        )}
      </div>
      <div
        className="storage-hierarchy"
        onKeyDown={(e) => {
          if (e.key === 'Escape') setSelection(null)
        }}
      >
        {devices.map((d) => {
          const parts = (d.children ?? []).filter((p) => p.type === 'part')
          const locked = options?.devices.find((p) => p.path === d.path)?.protectedReason
          const segments: {
            path?: string
            label: string
            size: number
            start?: number
            end?: number
          }[] = []
          if (parts.length && parts.every((p) => p.start != null)) {
            let end = 1048576
            for (const p of [...parts].sort((a, b) => a.start! - b.start!)) {
              if (p.start! - end >= 1048576)
                segments.push({
                  label: tr('free_dc5d8e60'),
                  size: p.start! - end,
                  start: Math.ceil(end / 1048576),
                  end: Math.floor(p.start! / 1048576),
                })
              segments.push({ path: p.path, label: p.label || p.name, size: p.size })
              end = p.start! + p.size
            }
            if (d.size - end > 2 * 1048576)
              segments.push({
                label: tr('free_dc5d8e60'),
                size: d.size - end - 1048576,
                start: Math.ceil(end / 1048576),
                end: Math.floor(d.size / 1048576) - 1,
              })
          } else if (parts.length)
            parts.forEach((p) => segments.push({ path: p.path, label: p.label || p.name, size: p.size }))
          else if (d.fstype || d.children?.length)
            segments.push({ path: d.path, label: d.label || d.fstype || d.name, size: d.size })
          else
            segments.push({
              label: tr('unused_device_130c8741'),
              size: d.size,
              start: 1,
              end: Math.floor(d.size / 1048576) - 1,
            })
          const groupKey = 'device:' + d.path
          const closed = collapsed.has(groupKey)
          const deviceIcon = d.type.startsWith('raid')
            ? mdiNas
            : d.tran === 'usb'
              ? mdiUsbFlashDrive
              : d.name.startsWith('mmc')
                ? mdiMicroSd
                : mdiHarddisk
          const title = d.type.startsWith('raid')
            ? tr('array_184de58c', { v0: arrayNames[d.path] || d.name })
            : d.name.startsWith('mmc')
              ? locked
                ? tr('microsd_system_7dab2f12')
                : 'microSD'
              : d.model?.trim() || d.name
          const volumes = d.children?.length && !d.fstype ? d.children : [d]
          return (
            <section className="hierarchy-group" key={d.path}>
              <div className="hierarchy-heading">
                <button className="hierarchy-toggle" aria-expanded={!closed} onClick={() => toggle(groupKey)}>
                  <span className={`hierarchy-chevron ${closed ? '' : 'expanded'}`}>
                    <Icon path={mdiChevronRight} />
                  </span>
                  <Icon path={deviceIcon} />
                  <span className="hierarchy-name">
                    <strong>{title}</strong>
                    <small>
                      {d.path} · {bytes(d.size)}
                    </small>
                  </span>
                </button>
                {locked && (
                  <span title={locked} role="img" aria-label={tr('system_drive_protected_9bfda749')}>
                    <Icon path={mdiShieldLockOutline} />
                  </span>
                )}
                <Button
                  title={tr('select_entire_device_db3da97b')}
                  aria-label={tr('select_entire_device_3359b3b4', { v0: d.name })}
                  onClick={() => choose({ root: d.path, path: d.path })}
                >
                  <Icon path={mdiSelectAll} />
                </Button>
              </div>
              {!closed && (
                <ul className="hierarchy-children">
                  {(d.fstype || d.children?.length) && volumes.map((v) => volume(v, d))}
                  {segments
                    .filter((segment) => !segment.path)
                    .map((segment) => (
                      <li key={segment.start}>
                        <button
                          className="hierarchy-volume hierarchy-free"
                          aria-pressed={
                            selection?.root === d.path && !selection.path && selection.start === segment.start
                          }
                          onClick={() => choose({ root: d.path, start: segment.start, end: segment.end })}
                        >
                          <Icon path={mdiPlus} />
                          <span className="hierarchy-name">
                            <strong>{tr('unallocated_space_a9769454')}</strong>
                            <small>
                              {locked
                                ? tr('system_partitions_read_only_87aa82fa')
                                : tr('for_creating_a_partition_d3a2b110')}
                            </small>
                          </span>
                          <span className="hierarchy-capacity">{bytes(segment.size)}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      <div
        className="storage-hierarchy"
        onKeyDown={(e) => {
          if (e.key === 'Escape') setSelection(null)
        }}
      >
        {[...servers].map(([server, connections]) => {
          const groupKey = 'server:' + server
          const closed = collapsed.has(groupKey)
          return (
            <section className="hierarchy-group" key={server}>
              <div className="hierarchy-heading">
                <button className="hierarchy-toggle" aria-expanded={!closed} onClick={() => toggle(groupKey)}>
                  <span className={`hierarchy-chevron ${closed ? '' : 'expanded'}`}>
                    <Icon path={mdiChevronRight} />
                  </span>
                  <Icon path={mdiFolderNetworkOutline} />
                  <span className="hierarchy-name">
                    <strong>{server}</strong>
                    <small>
                      {tr('network_mounts_253b59a8') + ' '}
                      {connections.length}
                    </small>
                  </span>
                </button>
              </div>
              {!closed && (
                <ul className="hierarchy-children">
                  {connections.map((m) => (
                    <li key={m.target}>
                      <button
                        className="hierarchy-volume"
                        aria-pressed={selection?.network === m.target}
                        onClick={() => choose({ root: '', network: m.target })}
                      >
                        <Icon path={mdiFolderNetworkOutline} />
                        <span className="hierarchy-name">
                          <strong>{m.source.split('/').filter(Boolean).at(-1)}</strong>
                          <small>
                            {m.source} → {m.target}
                          </small>
                        </span>
                        <span className="hierarchy-format">{m.fstype === 'cifs' ? 'SMB' : 'NFS'}</span>
                        <span className="hierarchy-access">
                          {m.options.split(',').includes('ro')
                            ? tr('read_only_c5eb2661')
                            : tr('read_and_write_823409cc')}
                        </span>
                        <span title={tr('mounted_81e0cd16')} role="img" aria-label={tr('mounted_81e0cd16')}>
                          <Icon path={mdiCheckCircleOutline} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
