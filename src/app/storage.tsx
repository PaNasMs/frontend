import { DialogContent } from '../shared/ui'
import { useRouteTab } from './navigation'
import { tr, locale } from '../i18n/index'
import { waitForJob } from '../shared/job-completion'
import { newID } from './dashboard'
import {
  mdiPause,
  mdiTimerOutline,
  mdiClipboardSearchOutline,
  mdiFan,
  mdiPlay,
  mdiLinux,
  mdiUsb,
  mdiUsbFlashDrive,
  mdiMicroSd,
  mdiChip,
  mdiCheckCircleOutline,
  mdiLockOutline,
  mdiPulse,
  mdiWeatherNight,
  mdiSync,
  mdiHelpCircleOutline,
  mdiHarddiskRemove,
  mdiAlertOutline,
} from '@mdi/js'
import { EjectButton } from './removable'
import { registerModule, registerWidgetSource } from './module-registry'
import {
  HddCoolingWidget,
  DiskLoadWidget,
  SystemDiskWidget,
  useDiskTemperatureWidgets,
} from './storage-widgets'
import { DiskSettings } from './disk-settings'
import { OperationButton, managed, type Job } from './operations'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { StorageVolumes, type StorageOptions, type MediaInfo } from './storage-volumes'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  mdiHarddisk,
  mdiRefresh,
  mdiSwapHorizontal,
  mdiShieldCheckOutline,
  mdiStopCircleOutline,
  mdiTrashCanOutline,
  mdiCheckCircle,
} from '@mdi/js'
import { request, type Storage, type Device, type Mount, type Preferences, type Metrics } from '../api/client'
import type { CoolingState } from './cooling'
import { Button, Icon, Notice, bytes } from '../shared/ui'
type Telemetry = CoolingState['status']['disks'][number]
const flatten = <
  T extends {
    children?: T[]
  },
>(
  nodes: T[],
): T[] => nodes.flatMap((n) => [n, ...flatten(n.children ?? [])])
const unique = (devices: Device[]) => [...new Map(devices.map((d) => [d.path, d])).values()]
const warningNames: Record<string, string> = {
  UDMA_CRC_Error_Count: tr('sata_communication_errors_crc_81c8e4c3'),
  Reallocated_Sector_Ct: tr('reallocated_sectors_13219513'),
  Current_Pending_Sector: tr('pending_sectors_e032444d'),
  Offline_Uncorrectable: tr('uncorrectable_sector_errors_abd3b620'),
  Command_Timeout: tr('command_timeouts_2f6b66b6'),
  Reported_Uncorrect: tr('reported_uncorrectable_errors_e0e13a18'),
}
const healthNames: Record<string, string> = {
  passed: tr('smart_healthy_a7834f96'),
  warning: tr('smart_warning_f20e2aee'),
  failed: tr('smart_failing_37a15268'),
  unknown: tr('smart_no_data_909f9952'),
}
function StatusIcon({
  icon,
  label,
  warning = false,
  spin = false,
}: {
  icon: string
  label: string
  warning?: boolean
  spin?: boolean
}) {
  return (
    <span
      tabIndex={0}
      role="img"
      aria-label={label}
      title={label}
      className={`status-icon ${warning ? 'warning' : ''} ${spin ? 'spinning' : ''}`}
    >
      <Icon path={icon} />
      <span className="status-tooltip" aria-hidden="true">
        {label}
      </span>
    </span>
  )
}
type DiskSelection = {
  active: boolean
  label: string
  toggle: () => void
  clear: () => void
}
function Disk({
  d,
  t,
  live,
  compact = false,
  baseline,
  onSmart,
  rate,
  selection,
  footer,
  status,
  media,
  actions,
  system = false,
}: {
  d: Device
  t?: Telemetry
  live: boolean
  compact?: boolean
  baseline?: number
  onSmart: () => void
  rate?: {
    read: number
    write: number
  }
  selection?: DiskSelection
  footer?: ReactNode
  status?: ReactNode
  media?: MediaInfo
  actions?: ReactNode
  system?: boolean
}) {
  const crc = t?.attributes?.find((a) => a.id === 199)?.raw?.value
  const acknowledged =
    baseline !== undefined &&
    crc === baseline &&
    t?.health === 'warning' &&
    t.warnings?.length === 1 &&
    t.warnings[0] === 'UDMA_CRC_Error_Count'
  const portable = media?.kind === 'sd' || media?.kind === 'emmc' || media?.kind === 'usb-flash'
  const hasSmart = !portable || !!t?.attributes?.length
  const mediaIcon =
    media?.kind === 'sd'
      ? mdiMicroSd
      : media?.kind === 'emmc'
        ? mdiChip
        : media?.kind === 'usb-flash'
          ? mdiUsbFlashDrive
          : media?.kind === 'usb'
            ? mdiUsb
            : mdiHarddisk
  const mediaTitle =
    media?.kind === 'sd'
      ? 'microSD · ' + (media.name || d.name)
      : media?.kind === 'emmc'
        ? 'eMMC · ' + (media.name || d.name)
        : d.model?.trim() || d.label || d.name
  const mediaLabel =
    media?.kind === 'sd' ? 'SD' : media?.kind === 'emmc' ? 'eMMC' : d.tran?.toUpperCase() || d.type
  const state = !live ? 'unknown' : (t?.state ?? (d.tran === 'mmc' ? 'active' : 'unknown'))
  const states: Record<string, string> = {
    active: tr('active_667904ef'),
    sleeping: tr('sleeping_14220af3'),
    unavailable: tr('unavailable_425e209c'),
    unknown: tr('unknown_state_d6b355ad'),
  }
  return (
    <article
      className={`disk-card ${compact ? 'compact' : ''} ${selection ? 'selectable' : ''} ${selection?.active ? 'selected' : ''}`}
    >
      {selection && (
        <button
          className="disk-select"
          aria-label={tr('select_disk_78b1ce66', { v0: selection.label })}
          aria-pressed={selection.active}
          onClick={selection.toggle}
          onKeyDown={(e) => {
            if (e.key === 'Escape') selection.clear()
          }}
        />
      )}
      <div className="disk-top">
        <div className="disk-identity">
          <Icon path={selection?.active ? mdiCheckCircle : mediaIcon} size={compact ? 24 : 30} />
          <span className="badge">{mediaLabel}</span>
        </div>
        <div className="disk-card-actions">
          {hasSmart && d.tran !== 'mmc' && (
            <Button
              className="disk-action"
              onClick={onSmart}
              title="SMART"
              aria-label={`SMART ${d.serial || d.name}`}
            >
              <Icon path={mdiShieldCheckOutline} />
            </Button>
          )}
          {actions}
        </div>
      </div>
      <h3 title={mediaTitle}>{mediaTitle}</h3>
      <div className="disk-capacity">{bytes(d.size)}</div>
      <div className="disk-status">
        <div className="disk-status-icons">
          {system && <StatusIcon icon={mdiLinux} label={tr('system_eca17171')} />}
          {portable ? (
            <StatusIcon
              icon={media.readOnly ? mdiLockOutline : mdiCheckCircleOutline}
              label={media.readOnly ? tr('read_only_c5eb2661') : tr('drive_connected_78b8d7d5')}
            />
          ) : (
            <StatusIcon
              icon={
                {
                  active: mdiPulse,
                  sleeping: mdiWeatherNight,
                  unavailable: mdiHarddiskRemove,
                  unknown: mdiHelpCircleOutline,
                }[state] ?? mdiHelpCircleOutline
              }
              label={states[state]}
              warning={state === 'unavailable'}
            />
          )}{' '}
          {hasSmart && (
            <StatusIcon
              icon={
                d.tran === 'mmc'
                  ? mdiHelpCircleOutline
                  : acknowledged || t?.health === 'passed'
                    ? mdiCheckCircleOutline
                    : t?.health === 'failed' || t?.health === 'warning'
                      ? mdiAlertOutline
                      : mdiHelpCircleOutline
              }
              label={
                d.tran === 'mmc'
                  ? tr('smart_not_supported_6b090f41')
                  : acknowledged
                    ? tr('smart_crc_acknowledged_9e205124')
                    : healthNames[t?.health ?? 'unknown']
              }
              warning={!acknowledged && (t?.health === 'failed' || t?.health === 'warning')}
            />
          )}{' '}
          {status}
        </div>
        {(!portable || t?.temperature != null) && (
          <strong>
            {t?.temperature == null ? '—' : `${t.temperature} °C`}
            {(t?.stale || !live) && t?.temperature != null ? ' *' : ''}
          </strong>
        )}
      </div>

      <dl>
        <dt>{tr('device_bc791dbe')}</dt>
        <dd>{d.path}</dd>
        {media?.usbVersion && (
          <>
            <dt>{tr('usb_standard_37593038')}</dt>
            <dd>USB {media.usbVersion}</dd>
          </>
        )}
        {media?.linkMbps && (
          <>
            <dt title={tr('usb_link_speed_not_read_write_speed_5d1ae10d')}>
              {tr('usb_connection_af69d8f9')}
            </dt>
            <dd>
              {media.linkMbps}
              {' ' + tr('mbit_s_1041d9f6')}
            </dd>
          </>
        )}
        {media?.usbId && (
          <>
            <dt>USB VID:PID</dt>
            <dd>{media.usbId}</dd>
          </>
        )}
        {media?.manufactured && (
          <>
            <dt>{tr('manufacture_date_a7a2c37c')}</dt>
            <dd>{media.manufactured}</dd>
          </>
        )}
        {media?.manufacturerId && (
          <>
            <dt>{tr('manufacturer_id_7659cc5d')}</dt>
            <dd>{media.manufacturerId}</dd>
          </>
        )}
        {d.serial && (
          <>
            <dt>{tr('serial_number_e787b0c8')}</dt>
            <dd>{d.serial}</dd>
          </>
        )}
        {portable && (
          <>
            <dt>{tr('access_mode_3cd68c51')}</dt>
            <dd>{media.readOnly ? tr('read_only_c5eb2661') : tr('read_and_write_823409cc')}</dd>
          </>
        )}
      </dl>
      {t?.observedAt && (
        <p className="muted small">
          {t.stale || !live ? tr('last_reading_8cb720b8') : tr('measured_fe4f59b5')}{' '}
          {new Date(t.observedAt * 1000).toLocaleTimeString(locale())}
        </p>
      )}
      {rate && (
        <p className="small muted">
          ↓ {bytes(rate.read)}
          {tr('s_f49d3336') + ' '}
          {bytes(rate.write)}
          {tr('s_a9208f04')}
        </p>
      )}
      {footer && <div className="disk-footer">{footer}</div>}
    </article>
  )
}
function smartTestType(value: string) {
  const types: Record<string, string> = {
    'Short offline': 'short_test_adb0ab92',
    'Extended offline': 'extended_test_00c16405',
    'Conveyance offline': 'smartDetails.conveyance',
    'Selective offline': 'smartDetails.selective',
  }
  return types[value] ? tr(types[value]) : value
}
function smartTestStatus(value: string) {
  const states: Record<string, string> = {
    'completed without error': 'smartDetails.passed',
    'aborted by host': 'smartDetails.aborted',
    'interrupted (host reset)': 'smartDetails.interrupted',
    'completed: read failure': 'smartDetails.readFailure',
    'completed: electrical failure': 'smartDetails.electricalFailure',
    'completed: servo/seek failure': 'smartDetails.seekFailure',
    'completed: unknown failure': 'smartDetails.failed',
    'self-test routine in progress': 'smartDetails.running',
  }
  return states[value.toLowerCase()] ? tr(states[value.toLowerCase()]) : value
}
function SmartDialog({
  d,
  t,
  live,
  baseline,
  pending,
  error,
  onBaseline,
}: {
  d: Device
  t?: Telemetry
  live: boolean
  baseline?: number
  pending: boolean
  error?: string
  onBaseline: (value?: number) => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [smartTab, setSmartTab] = useState('attributes')
  const scrollPositions = useRef<Record<string, number>>({})
  useLayoutEffect(() => {
    const body = dialogRef.current?.querySelector('.modal-body')
    if (body) body.scrollTop = scrollPositions.current[smartTab] ?? 0
  }, [smartTab])
  const tests = useQuery({
    queryKey: ['smart-tests', d.path],
    queryFn: () =>
      managed<{
        ata_smart_data?: {
          self_test?: {
            status?: {
              string?: string
              remaining_percent?: number
            }
          }
        }
        ata_smart_self_test_log?: {
          standard?: {
            table?: {
              num?: number
              remaining_percent?: number
              lba_first_error?: number | string
              type: {
                string: string
              }
              status: {
                string: string
                passed?: boolean
              }
              lifetime_hours: number
            }[]
          }
        }
      }>('smart', undefined, d.path),
    refetchInterval: 60000,
  })
  const crc = t?.attributes?.find((a) => a.id === 199)?.raw?.value
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <DialogContent
        className="settings-dialog smart-dialog"
        ref={dialogRef}
        header={
          <>
            {' '}
            <div className="dialog-heading smart-heading">
              <div className="dialog-heading">
                <Dialog.Title>SMART · {d.model?.trim() || d.name}</Dialog.Title>
              </div>
              <div className="smart-meta-row">
                <Dialog.Description className="muted small">
                  {d.serial || d.name} · {d.path}
                  {t?.observedAt
                    ? ` · ${t.stale || !live ? tr('last_reading_8cb720b8') : tr('measured_fe4f59b5')} ${new Date(t.observedAt * 1000).toLocaleString(locale())}`
                    : ''}
                </Dialog.Description>
                <div className="smart-test-toolbar" aria-label={tr('disk_tests_7d387b78')}>
                  {['smart.short', 'smart.long', 'smart.abort'].map((action) => (
                    <OperationButton
                      key={action}
                      label={
                        {
                          'smart.short': tr('short_test_adb0ab92'),
                          'smart.long': tr('extended_test_00c16405'),
                          'smart.abort': tr('stop_test_21590215'),
                        }[action]
                      }
                      icon={
                        {
                          'smart.short': mdiTimerOutline,
                          'smart.long': mdiClipboardSearchOutline,
                          'smart.abort': mdiStopCircleOutline,
                        }[action]
                      }
                      onDone={() => {
                        void tests.refetch()
                      }}
                      actions={[action]}
                      initial={{ target: d.path }}
                      context={[
                        {
                          key: 'target',
                          label: tr('disk_ca040760'),
                          value: `${d.serial || d.name} · ${d.path}`,
                        },
                      ]}
                      autoReview
                    />
                  ))}
                </div>
              </div>
            </div>{' '}
          </>
        }
        variant="details"
        intent="inspect"
        dirty={false}
      >
        {t?.warnings?.length ? (
          <Notice error>
            {t.warnings
              .map((w) => {
                const a = t.attributes?.find((a) => a.name === w)
                return `${warningNames[w] ?? w}${a?.raw?.value != null ? `: ${a.raw.value}` : ''}`
              })
              .join('; ')}
          </Notice>
        ) : null}
        {crc != null && crc > 0 && (
          <section className="smart-crc">
            <h3>{tr('sata_communication_errors_crc_81c8e4c3')}</h3>
            <p className="small muted">{tr('the_disk_s_cumulative_counter_cannot_be_reset_with_4d3165ae')}</p>
            {baseline !== undefined && (
              <p className="small">
                {tr('acknowledged_922c5561') + ' '}
                {baseline} ·{' '}
                {crc >= baseline
                  ? tr('new_errors_d5f4ff0c', { v0: crc - baseline })
                  : tr('the_counter_decreased_a_new_baseline_is_required_6ce36675')}
              </p>
            )}
            <div className="actions">
              <Button
                disabled={pending || !live || !!t?.stale || t?.state !== 'active' || crc === baseline}
                onClick={() => onBaseline(crc)}
              >
                {tr('acknowledge_current_crc_count_3ad8bb52')}
              </Button>
              {baseline !== undefined && (
                <Button disabled={pending} onClick={() => onBaseline()}>
                  {tr('reset_baseline_66fff5ba')}
                </Button>
              )}
            </div>
          </section>
        )}
        {error && <Notice error>{error}</Notice>}
        {tests.error && <Notice error>{tests.error.message}</Notice>}
        <Tabs.Root
          value={smartTab}
          onValueChange={(value) => {
            scrollPositions.current[smartTab] =
              dialogRef.current?.querySelector('.modal-body')?.scrollTop ?? 0
            setSmartTab(value)
          }}
          className="smart-tabs"
        >
          <Tabs.List className="tabs">
            <Tabs.Trigger value="attributes">{tr('smartDetails.attributes')}</Tabs.Trigger>
            <Tabs.Trigger value="results">{tr('smartDetails.results')}</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="attributes">
            {t?.attributes?.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>{tr('attribute_5338f9a4')}</th>
                      <th>{tr('raw_value_5ede9cfc')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.attributes.map((a) => (
                      <tr key={a.id}>
                        <td>{a.id}</td>
                        <td>{warningNames[a.name] ?? a.name}</td>
                        <td>{a.raw?.string ?? a.raw?.value ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Notice>{tr('smart_attributes_are_not_available_yet_a2fed2da')}</Notice>
            )}
          </Tabs.Content>
          <Tabs.Content value="results">
            {tests.data?.ata_smart_data?.self_test?.status && (
              <p className="smart-current-status">
                {tr('smartDetails.current')}:{' '}
                {tests.data.ata_smart_data.self_test.status.remaining_percent != null
                  ? tr('smartDetails.remaining', {
                      value: tests.data.ata_smart_data.self_test.status.remaining_percent,
                    })
                  : smartTestStatus(tests.data.ata_smart_data.self_test.status.string ?? '')}
              </p>
            )}
            <p className="small muted">{tr('smartDetails.historyHint')}</p>
            {tests.data?.ata_smart_self_test_log?.standard?.table?.length ? (
              <ol className="smart-test-history">
                {tests.data.ata_smart_self_test_log.standard.table.map((row, index) => (
                  <li key={index}>
                    <div className="smart-result-heading">
                      <strong>{smartTestType(row.type.string)}</strong>
                      <span className={row.status.passed === false ? 'smart-result-failed' : undefined}>
                        {smartTestStatus(row.status.string)}
                      </span>
                    </div>
                    <dl className="module-facts">
                      <dt>{tr('smartDetails.powerOnHours')}</dt>
                      <dd>
                        {row.lifetime_hours.toLocaleString(locale())} {tr('h_285cc400')}
                      </dd>
                      {row.remaining_percent != null && (
                        <>
                          <dt>{tr('smartDetails.remainingLabel')}</dt>
                          <dd>{row.remaining_percent}%</dd>
                        </>
                      )}
                      {row.lba_first_error != null && (
                        <>
                          <dt>{tr('smartDetails.firstError')}</dt>
                          <dd>{row.lba_first_error}</dd>
                        </>
                      )}
                    </dl>
                  </li>
                ))}
              </ol>
            ) : (
              !tests.isPending && !tests.error && <Notice>{tr('smartDetails.noHistory')}</Notice>
            )}
          </Tabs.Content>
        </Tabs.Root>
      </DialogContent>
    </Dialog.Portal>
  )
}
export function StoragePage() {
  const [tab, setTab] = useRouteTab('/storage', ['disks', 'mounts'], 'disks')
  const [freeSelection, setFreeSelection] = useState<string[]>([])
  const q = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => {
    setFreeSelection([])
    setSelectedMember(null)
    setSelected(null)
  }, [tab])
  const [selectedMember, setSelectedMember] = useState<{
    array: string
    member: string
  } | null>(null)
  const prefs = useQuery({ queryKey: ['preferences'], queryFn: () => request<Preferences>('preferences') })
  const save = useMutation({
    mutationFn: async ({ key, value }: { key: string; value?: number }) => {
      const current = await request<Preferences>('preferences')
      const smartCrcBaselines = { ...current.smartCrcBaselines }
      if (value === undefined) delete smartCrcBaselines[key]
      else smartCrcBaselines[key] = value
      return request<Preferences>('preferences', 'PUT', { ...current, smartCrcBaselines })
    },
    onSuccess: (p) => {
      q.setQueryData(['preferences'], p)
      void q.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
  const metrics = useQuery({ queryKey: ['metrics'], queryFn: () => request<Metrics>('metrics') })
  const data = useQuery({
    queryKey: ['storage'],
    queryFn: () => request<Storage>('storage'),
    refetchInterval: (query) =>
      query.state.data?.arrays.some(
        (a) => a.reshapePending || (!!a.sync && !['idle', 'frozen'].includes(a.sync)),
      )
        ? 5000
        : false,
  })
  const telemetry = useQuery({ queryKey: ['cooling'], queryFn: () => request<CoolingState>('cooling') })
  const options = useQuery({
    queryKey: ['management-storage', 'all'],
    queryFn: () => managed<StorageOptions>('storage-options'),
  })
  const s = data.data
  const devices = unique(flatten(s?.devices ?? []))
  const disks = devices.filter((d) => d.type === 'disk')
  const memberDisks = (members: string[]) =>
    disks.filter((d) => flatten([d]).some((x) => members.includes(x.kname)))
  const assigned = new Set((s?.arrays ?? []).flatMap((a) => memberDisks(a.members).map((d) => d.path)))
  const mounts = flatten<Mount>(s?.mounts ?? [])
  const samples = telemetry.data?.status.disks ?? []
  const live = !!telemetry.data?.available
  const keyFor = (d: Device) => (d.serial ? `${d.model?.trim() || ''}:${d.serial}` : undefined)
  const baselineFor = (d: Device) => {
    const key = keyFor(d)
    return key ? prefs.data?.smartCrcBaselines?.[key] : undefined
  }
  const disk = (
    d: Device,
    compact = false,
    selection?: DiskSelection,
    footer?: ReactNode,
    status?: ReactNode,
  ) => (
    <Disk
      key={d.path}
      system={!!options.data?.devices.find((p) => p.path === d.path)?.protectedReason}
      actions={
        !compact && options.data?.devices.find((p) => p.path === d.path)?.ejectable ? (
          <EjectButton device={d} />
        ) : undefined
      }
      media={options.data?.devices.find((p) => p.path === d.path)?.media}
      footer={footer}
      status={status}
      selection={selection}
      d={d}
      t={samples.find((t) => t.device === d.path)}
      live={live || d.tran === 'mmc'}
      compact={compact}
      rate={metrics.data?.disks?.[d.kname]}
      baseline={baselineFor(d)}
      onSmart={() => {
        save.reset()
        setSelected(d.path)
      }}
    />
  )
  const selectedDisk = devices.find((d) => d.path === selected)
  const volumes = devices.filter(
    (d) => (d.type === 'disk' && !assigned.has(d.path)) || d.type.startsWith('raid') || d.type === 'md',
  )
  const free = disks.filter(
    (d) =>
      !assigned.has(d.path) &&
      options.data?.devices.find((p) => p.path === d.path)?.raidEligible &&
      freeSelection.includes(d.path),
  )
  const levels =
    free.length >= 2
      ? [
          '1',
          '0',
          ...(free.length >= 3 ? ['5'] : []),
          ...(free.length >= 4 ? ['6'] : []),
          ...(free.length >= 4 && free.length % 2 === 0 ? ['10'] : []),
        ]
      : []
  const arrayChoices = (s?.arrays ?? []).map((a) => {
    const size = Math.min(...a.members.map((k) => devices.find((d) => d.kname === k)?.size ?? Infinity))
    const reason = !['raid1', 'raid5', 'raid6', 'raid10'].includes(a.level)
      ? tr('level_not_supported_c37dd3a6')
      : a.sync !== 'idle'
        ? tr('array_is_busy_c5895071')
        : free[0] && free[0].size < size
          ? tr('disk_is_too_small_65f0d21a')
          : ''
    return {
      id: a.device,
      label: `${a.name} · ${a.level.toUpperCase()}${reason ? ' — ' + reason : ''}`,
      disabled: !!reason,
    }
  })
  const eligibleArrays = arrayChoices.filter((a) => !a.disabled)
  const growChoices = (s?.arrays ?? []).map((a) => {
    const base = arrayChoices.find((c) => c.id === a.device)!
    const reason = !['raid5', 'raid6'].includes(a.level)
      ? tr('expansion_is_supported_for_raid5_raid6_e598638e')
      : a.sync !== 'idle'
        ? tr('wait_for_synchronization_to_finish_a927b56f')
        : a.degraded !== '0'
          ? tr('recover_the_array_first_bfc15749')
          : Object.values(a.memberStates ?? {}).some((v) => !v.split(',').includes('in_sync'))
            ? tr('there_are_unsynchronized_or_spare_members_7f246b83')
            : base.disabled
              ? tr('new_disk_is_too_small_9e9a3769')
              : ''
    return {
      id: a.device,
      label: `${a.name} · ${a.level.toUpperCase()}${reason ? ' — ' + reason : ''}`,
      disabled: !!reason,
    }
  })
  const growEligible = growChoices.filter((a) => !a.disabled)
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{tr('your_data_c1eb6512')}</span>
          <h1>{tr('storage_5347bdf6')}</h1>
          <p className="muted">{tr('disks_arrays_and_file_systems_6e7c20dc')}</p>
        </div>
        <div className="actions">
          <Button onClick={() => void data.refetch()} disabled={data.isFetching}>
            <Icon path={mdiRefresh} />
            {tr('refresh_c2f668e5')}
          </Button>
        </div>
      </div>
      <Tabs.Root
        className="tabbed-page"
        activationMode="manual"
        value={tab}
        onValueChange={(v) => {
          setTab(v)
          setFreeSelection([])
          setSelectedMember(null)
        }}
      >
        <Tabs.List className="tabs" aria-label={tr('storage_5347bdf6')}>
          <Tabs.Trigger value="disks">{tr('disks_and_arrays_a0066b23')}</Tabs.Trigger>
          <Tabs.Trigger value="mounts">{tr('partitions_and_mounts_c5a470d6')}</Tabs.Trigger>
        </Tabs.List>
        {data.isPending && <Notice>{tr('discovering_storage_2689e168')}</Notice>}
        {data.error && <Notice error>{data.error.message}</Notice>}
        <Tabs.Content value="disks">
          <div className="storage-tab-intro">
            <p className="muted">{tr('select_unused_disks_to_create_an_array_or_one_disk_91ae0bec')}</p>
          </div>
          {options.error && <Notice error>{options.error.message}</Notice>}
          {free.length > 0 && (
            <div className="selection-bar disk-selection-bar" aria-label={tr('selected_disks_3524e0a0')}>
              <div>
                <strong>
                  {tr('disks_selected_af32749d') + ' '}
                  {free.length}
                </strong>
                <p className="small muted">{free.map((d) => d.serial || d.path).join(' · ')}</p>
              </div>
              <div className="actions">
                {free.length > 1 && (
                  <OperationButton
                    key={free.map((d) => d.path).join()}
                    label={tr('create_array_f5677d02')}
                    actions={['raid.create']}
                    initial={{ members: free.map((d) => d.path), level: levels[0] }}
                    context={[
                      {
                        key: 'members',
                        label: tr('array_disks_657a53d1'),
                        value: free.map((d) => `${d.serial || d.name} · ${bytes(d.size)}`).join(', '),
                      },
                    ]}
                    choices={{ level: levels.map((l) => ({ id: l, label: 'RAID ' + l })) }}
                    description={tr('the_selected_disks_will_form_an_array_specify_its__7bbcab16')}
                  />
                )}
                {free.length === 1 && (
                  <>
                    <OperationButton
                      key={'grow' + free[0].path}
                      label={tr('expand_raid_da511029')}
                      tooltip={
                        growEligible.length
                          ? tr('add_disk_as_an_active_member_and_increase_raid5_ra_28395440')
                          : growChoices.length
                            ? growChoices.map((c) => c.label).join('; ')
                            : tr('no_array_ready_for_expansion_b40efb11')
                      }
                      actions={['raid.grow']}
                      disabled={!growEligible.length}
                      initial={{
                        replacement: free[0].path,
                        target: growEligible.length === 1 ? growEligible[0].id : '',
                      }}
                      context={[
                        {
                          key: 'replacement',
                          label: tr('disk_to_add_1e216810'),
                          value: `${free[0].serial || free[0].name} · ${free[0].path}`,
                        },
                      ]}
                      choices={{ target: growChoices }}
                      description={tr('the_disk_will_become_an_active_raid5_raid6_member__1aa39718')}
                    />
                    <OperationButton
                      key={free[0].path}
                      label={tr('add_spare_disk_861721d2')}
                      tooltip={
                        eligibleArrays.length
                          ? tr('add_spare_disk_without_increasing_array_capacity_6eae52ee')
                          : arrayChoices.length
                            ? arrayChoices.map((c) => c.label).join('; ')
                            : tr('no_suitable_array_8b2e0804')
                      }
                      actions={['raid.add']}
                      disabled={!eligibleArrays.length}
                      initial={{
                        replacement: free[0].path,
                        target: eligibleArrays.length === 1 ? eligibleArrays[0].id : '',
                      }}
                      context={[
                        {
                          key: 'replacement',
                          label: tr('disk_to_add_1e216810'),
                          value: `${free[0].serial || free[0].name} · ${free[0].path}`,
                        },
                      ]}
                      choices={{ target: arrayChoices }}
                      description={tr('select_an_array_the_disk_will_become_a_spare_or_st_72a210d1')}
                    />
                  </>
                )}
                <Button onClick={() => setFreeSelection([])}>{tr('clear_selection_91471074')}</Button>
              </div>
            </div>
          )}
          <div className="storage-items">
            {s?.arrays.map((a) => {
              const rows = a.members.flatMap((k) => {
                const member = devices.find((d) => d.kname === k)
                const physical = memberDisks([k])[0]
                return member && physical ? [{ member, physical }] : []
              })
              const picked =
                selectedMember?.array === a.device
                  ? rows.find((r) => r.member.path === selectedMember.member)
                  : undefined
              const context = [
                {
                  key: 'target',
                  label: tr('array_e1bef103'),
                  value: `${a.name} · ${a.level.toUpperCase()} · ${a.device}`,
                },
              ]
              const idle = (!a.sync || a.sync === 'idle') && !a.reshapePending
              const paused = !!a.reshapePending && ['idle', 'frozen'].includes(a.sync)
              const checking = a.sync === 'check'
              const missing = a.missing ?? 0
              const syncing = ['recover', 'resync', 'reshape', 'check', 'repair'].includes(a.sync)
              const syncLabel: Record<string, string> = {
                recover: tr('member_synchronization_c0051cf1'),
                resync: tr('array_synchronization_9a8b25a1'),
                reshape: tr('array_reshape_c2246aa3'),
                check: tr('array_check_43a8678a'),
                repair: tr('array_repair_5b32800e'),
                frozen: tr('synchronization_paused_2f6ca759'),
              }
              return (
                <section
                  className="raid"
                  style={
                    {
                      '--raid-basis': `${Math.max(670, Math.min(rows.length + Math.min(missing, 32), 6) * 187 + 30)}px`,
                    } as CSSProperties
                  }
                  key={a.device}
                  aria-label={tr('array_184de58c', { v0: a.name })}
                >
                  <div className="raid-heading">
                    <div>
                      <span className="eyebrow">{tr('array_cfb5d429')}</span>
                      <h2>
                        {a.name} <span className="badge accent">{a.level.toUpperCase()}</span>
                      </h2>
                      <p className="muted small">
                        {bytes(a.size)} · {a.members.length}
                        {' ' + tr('disks_3c37da8d')}
                      </p>
                      {metrics.data?.disks?.[a.device.replace('/dev/', '')] && (
                        <p className="small muted">
                          {tr('array_9147c2e6') + ' '}
                          {bytes(metrics.data.disks[a.device.replace('/dev/', '')].read)}
                          {tr('s_f49d3336')} {bytes(metrics.data.disks[a.device.replace('/dev/', '')].write)}
                          {tr('s_a9208f04')}
                        </p>
                      )}
                    </div>
                    {(syncing || a.reshapePending) && (
                      <div className="raid-progress">
                        <div>
                          <strong>{paused ? tr('reshape_paused_2340f662') : syncLabel[a.sync]}</strong>
                          <span>
                            {a.syncPercent == null
                              ? tr('waiting_for_progress_b421e2ab')
                              : `${a.syncPercent.toLocaleString(locale(), { maximumFractionDigits: 1 })}%`}
                          </span>
                        </div>
                        <div className="raid-progress-controls">
                          <progress
                            aria-label={paused ? tr('reshape_paused_2340f662') : syncLabel[a.sync]}
                            max={100}
                            value={a.syncPercent}
                          />
                          {a.reshapePending && <ReshapeControl array={a} />}
                        </div>
                        <p className="small muted">
                          {paused
                            ? a.state === 'read-auto' || a.state === 'readonly'
                              ? tr('waiting_to_resume_after_startup_db8b2d1a')
                              : tr('position_saved_09e12116')
                            : a.syncSpeed != null
                              ? tr('s_1278e806', { v0: bytes(a.syncSpeed) })
                              : ''}
                          {!paused && a.syncRemaining != null
                            ? ' ' +
                              tr('about_min_remaining_72684c62', { v0: Math.ceil(a.syncRemaining / 60) })
                            : ''}
                        </p>
                      </div>
                    )}
                    <div className="raid-heading-right">
                      <div
                        className="raid-actions"
                        role="group"
                        aria-label={tr('manage_array_71bcc102', { v0: a.name })}
                      >
                        {picked && a.level !== 'raid0' && (
                          <OperationButton
                            key={picked.member.path}
                            label={tr('replace_selected_disk_c5d43c1f')}
                            icon={mdiSwapHorizontal}
                            disabled={!idle}
                            actions={['raid.replace']}
                            autoReview
                            initial={{ target: a.device, member: picked.member.path }}
                            candidatesFor={a.device}
                            context={[
                              ...context,
                              {
                                key: 'member',
                                label: tr('disk_to_replace_1d8dff98'),
                                value: `${picked.physical.model?.trim() || picked.physical.name} · ${picked.physical.serial || picked.member.path} · ${picked.member.path}`,
                              },
                            ]}
                          />
                        )}

                        <OperationButton
                          label={checking ? tr('stop_array_check_befc81d8') : tr('check_array_80a1807f')}
                          icon={checking ? mdiStopCircleOutline : mdiShieldCheckOutline}
                          disabled={a.level === 'raid0' || (!idle && !checking)}
                          actions={[checking ? 'raid.check-stop' : 'raid.check']}
                          initial={{ target: a.device }}
                          context={context}
                          autoReview
                        />
                        <OperationButton
                          label={tr('delete_array_9849a1e4')}
                          icon={mdiTrashCanOutline}
                          disabled={!idle}
                          actions={['raid.delete']}
                          initial={{ target: a.device }}
                          context={context}
                          autoReview
                        />
                      </div>
                      {(!syncing || missing > 0) && (
                        <StatusIcon
                          icon={
                            missing > 0
                              ? mdiHarddiskRemove
                              : a.degraded === '0' || a.level === 'raid0'
                                ? mdiCheckCircleOutline
                                : mdiAlertOutline
                          }
                          label={
                            missing > 0
                              ? tr('unavailable_70053813', { v0: missing })
                              : a.degraded === '0' || a.level === 'raid0'
                                ? tr('all_members_available_de81b260')
                                : tr('array_is_running_with_reduced_redundancy_87541530')
                          }
                          warning={missing > 0 || (!syncing && a.degraded !== '0' && a.level !== 'raid0')}
                        />
                      )}
                    </div>
                  </div>

                  {!syncing && !idle && !a.reshapePending && (
                    <p className="small muted">
                      {syncLabel[a.sync] ?? tr('waiting_for_a_background_operation_db838035')}
                    </p>
                  )}
                  <p className="raid-selection-hint small muted" aria-live="polite">
                    {picked
                      ? tr('selected_disk_8dfc2992', {
                          v0: picked.physical.serial || picked.member.path,
                          v1: picked.member.path !== picked.physical.path ? ' · ' + picked.member.path : '',
                        })
                      : tr('select_a_disk_in_the_array_to_replace_it_6595cd15')}
                  </p>
                  <div className="disk-grid">
                    {rows.map(({ member, physical }) => (
                      <div className="raid-member" key={member.path}>
                        {disk(
                          physical,
                          true,
                          {
                            active: picked?.member.path === member.path,
                            label: `${physical.serial || physical.name} · ${member.path}`,
                            toggle: () => {
                              setFreeSelection([])
                              setSelectedMember(
                                picked?.member.path === member.path
                                  ? null
                                  : { array: a.device, member: member.path },
                              )
                            },
                            clear: () => setSelectedMember(null),
                          },
                          undefined,
                          a.memberStates?.[member.kname] === 'recovering' ? (
                            <StatusIcon icon={mdiSync} label={tr('synchronizing_34500557')} spin />
                          ) : a.memberStates?.[member.kname]?.includes('faulty') ? (
                            <StatusIcon
                              icon={mdiAlertOutline}
                              label={tr('member_failure_46f4c07c')}
                              warning
                            />
                          ) : undefined,
                        )}
                        {member.path !== physical.path && (
                          <p className="small muted">
                            {tr('member_0a55cbbe') + ' '}
                            {member.path}
                          </p>
                        )}
                      </div>
                    ))}
                    {Array.from({ length: Math.min(missing, 32) }, (_, i) => (
                      <article className="disk-card compact" key={'missing' + i}>
                        <StatusIcon
                          icon={mdiHarddiskRemove}
                          label={tr('member_unavailable_65419fac')}
                          warning
                        />
                        <p className="muted small">
                          {tr('check_the_connection_or_add_a_new_disk_to_the_arra_6624e482')}
                        </p>
                      </article>
                    ))}
                  </div>
                  {missing > 0 && (
                    <Notice error>
                      {tr('missing_array_members_b618bf0a') + ' '}
                      {missing}
                      {tr('check_disk_connections_8a30d596')}
                    </Notice>
                  )}
                </section>
              )
            })}
            {disks
              .filter((d) => !assigned.has(d.path))
              .map((d) => {
                const p = options.data?.devices.find((p) => p.path === d.path)
                return disk(
                  d,
                  false,
                  p?.raidEligible
                    ? {
                        active: free.some((f) => f.path === d.path),
                        label: d.serial || d.path,
                        toggle: () => {
                          setSelectedMember(null)
                          setFreeSelection((current) =>
                            current.includes(d.path)
                              ? current.filter((v) => v !== d.path)
                              : [...current, d.path],
                          )
                        },
                        clear: () => setFreeSelection([]),
                      }
                    : undefined,
                  <>
                    {!p?.protectedReason && (
                      <span className="badge">
                        {p?.raidEligible ? tr('unused_242028cc') : tr('standalone_drive_452b9f5e')}
                      </span>
                    )}
                    {!p?.raidEligible && (
                      <p className="small muted">
                        {p?.raidReason || tr('checking_selection_availability_9b43b4d0')}
                      </p>
                    )}
                  </>,
                )
              })}
          </div>
          {telemetry.data && (
            <p className="small muted">
              {tr('disk_cooling_074f9995') + ' '}
              {live ? `${telemetry.data.status.dutyPercent}%` : tr('data_is_out_of_date_ea94b7bf')}
              {' ' + tr('requested_power_9ddc5388')}
              {telemetry.data.status.reason === 'initializing-sensors' &&
                ` · ${tr('cooling_initializing_sensors')}`}
            </p>
          )}
        </Tabs.Content>
        <Tabs.Content value="mounts">
          <StorageVolumes
            devices={volumes}
            mounts={mounts}
            options={options.data}
            arrayNames={Object.fromEntries((s?.arrays ?? []).map((a) => [a.device, a.name]))}
          />
        </Tabs.Content>
      </Tabs.Root>
      <Dialog.Root
        open={!!selectedDisk}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        {selectedDisk && (
          <SmartDialog
            d={selectedDisk}
            t={samples.find((t) => t.device === selectedDisk.path)}
            live={live}
            baseline={baselineFor(selectedDisk)}
            pending={save.isPending || !prefs.data || !keyFor(selectedDisk)}
            error={save.error?.message}
            onBaseline={(value) => {
              const key = keyFor(selectedDisk)
              if (key) save.mutate({ key, value })
            }}
          />
        )}
      </Dialog.Root>
      <p className="small muted">
        {s && tr('checked_1771db82', { v0: new Date(s.observedAt).toLocaleTimeString(locale()) })}
      </p>
    </>
  )
}
registerModule({
  id: 'storage',
  title: tr('disks_and_storage_590f2632'),
  path: '/storage',
  routes: ['disks', 'mounts'],
  icon: mdiHarddisk,
  component: StoragePage,
  settings: [
    {
      id: 'storage',
      routes: ['general', 'advanced', 'normal'],
      title: tr('disk_subsystem_e8f8c086'),
      icon: mdiHarddisk,
      component: DiskSettings,
    },
  ],
  widgets: {
    hddCooling: {
      title: tr('hdd_cooling_cf586d44'),
      width: 2,
      height: 2,
      module: tr('storage_5347bdf6'),
      icon: mdiFan,
      component: HddCoolingWidget,
    },
    systemDisk: {
      title: tr('system_drive_0bc8689b'),
      width: 2,
      height: 2,
      module: tr('storage_5347bdf6'),
      icon: mdiHarddisk,
      component: SystemDiskWidget,
    },
    disks: {
      title: tr('disk_activity_22396434'),
      width: 2,
      height: 2,
      module: tr('storage_5347bdf6'),
      icon: mdiHarddisk,
      component: DiskLoadWidget,
      history: true,
    },
    storage: {
      title: tr('storage_5347bdf6'),
      width: 1,
      height: 1,
      module: tr('storage_5347bdf6'),
      href: '/storage',
    },
  },
})
// Температура — по виджету на каждый найденный диск, поэтому это источник, а не список.
registerWidgetSource(useDiskTemperatureWidgets)
function ReshapeControl({ array }: { array: Storage['arrays'][number] }) {
  const query = useQueryClient()
  const paused = ['idle', 'frozen'].includes(array.sync)
  const action = paused ? 'raid.resume' : 'raid.pause'
  const label = paused ? tr('resume_reshape_6ac07018') : tr('pause_reshape_8ab3f7ba')
  const mutation = useMutation({
    mutationFn: async () => {
      const params = { target: array.device }
      const plan = await managed<{
        fingerprint: string
        confirmation: string
      }>('plan', { action, params })
      const job = await managed<{
        id: string
      }>('run', {
        action,
        params,
        id: newID(),
        fingerprint: plan.fingerprint,
        confirmation: plan.confirmation,
      })
      await waitForJob(async () => {
        const jobs = await managed<Job[]>('jobs')
        query.setQueryData(['jobs'], jobs)
        return jobs.find((j) => j.id === job.id)
      })
    },
    onSettled: async () => {
      await Promise.all(
        ['storage', 'management-storage', 'jobs'].map((key) => query.invalidateQueries({ queryKey: [key] })),
      )
    },
  })
  return (
    <>
      <Button
        className="raid-action"
        title={label}
        aria-label={label}
        disabled={mutation.isPending || (paused && array.degraded !== '0')}
        onClick={() => mutation.mutate()}
      >
        <Icon path={paused ? mdiPlay : mdiPause} />
      </Button>
      {mutation.error && (
        <span role="alert" className="error-text small">
          {mutation.error.message}
        </span>
      )}
    </>
  )
}
