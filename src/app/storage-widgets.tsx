import { tr } from '../i18n/index'
import { useQuery } from '@tanstack/react-query'
import { mdiThermometer } from '@mdi/js'
import { request, type Metrics, type Preferences, type Storage, type Device } from '../api/client'
import type { CoolingState } from './cooling'
import { bytes } from '../shared/ui'
import { Ring, WidgetFoot, ZoneBar } from '../shared/widget-ui'
import { diskTone, tempFraction } from './system-widgets'
import type { WidgetDefinition } from './module-registry'
const flatten = <
  T extends {
    children?: T[]
  },
>(
  nodes: T[],
): T[] => nodes.flatMap((n) => [n, ...flatten(n.children ?? [])])
export const DISK_TEMP = 'disk-temp:'
/**
 * Ключ виджета — серийный номер, а не /dev/sdX: имена устройств переезжают
 * между загрузками, серийный номер остаётся. Набор символов сужен, потому что
 * этот ключ проверяет сервер.
 */
const fold = (value: string) => {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 0x01000193) >>> 0
  return hash.toString(36)
}
const safeKey = (value: string) => {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '-')
  // И замена символов, и обрезка по длине склеили бы два разных диска
  // в один виджет, поэтому любой изменённый ключ получает отпечаток оригинала.
  if (cleaned === value && cleaned.length <= 64) return cleaned
  return `${cleaned.slice(0, 48)}-${fold(value)}`
}
export const diskWidgetKind = (d: Device) => DISK_TEMP + safeKey(d.serial || d.kname)
const diskLabel = (d: Device) => d.model?.trim() || d.kname
const useStorage = () => useQuery({ queryKey: ['storage'], queryFn: () => request<Storage>('storage') })
const useTelemetry = () =>
  useQuery({ queryKey: ['cooling'], queryFn: () => request<CoolingState>('cooling') })
const useMetrics = () => useQuery({ queryKey: ['metrics'], queryFn: () => request<Metrics>('metrics') })
const physicalDisks = (s?: Storage) =>
  flatten((s?.devices ?? []) as Device[]).filter((d) => d.type === 'disk')
export function SystemDiskWidget() {
  const metrics = useMetrics()
  const m = metrics.data
  const used = m ? m.systemTotal - m.systemAvailable : 0
  const percent = m?.systemTotal ? (100 * used) / m.systemTotal : null
  return (
    <>
      <div className="widget-ring-row">
        <Ring
          fraction={percent == null ? null : percent / 100}
          center={percent == null ? '—' : `${Math.round(percent)}%`}
          sub={tr('used_fe26786c')}
          label={tr('system_drive_usage_e5c9ca63', {
            v0:
              percent == null
                ? ' ' + tr('unknown_478fa305')
                : tr('percent_024d1473', { v0: Math.round(percent) }),
          })}
        />
      </div>
      <WidgetFoot>
        {m ? tr('of_ad242546', { v0: bytes(used), v1: bytes(m.systemTotal) }) : tr('loading_b6819e91')}
      </WidgetFoot>
    </>
  )
}
export function DiskLoadWidget() {
  const metrics = useMetrics()
  const rows = Object.entries(metrics.data?.disks ?? {}).filter(([n]) =>
    /^(sd[a-z]+|md\d+|nvme\d+n\d+|mmcblk\d+)$/.test(n),
  )
  if (!rows.length) return <WidgetFoot>{tr('no_activity_data_0dad95e5')}</WidgetFoot>
  return (
    <div className="widget-rates">
      {rows.map(([name, r]) => (
        <div key={name}>
          <strong>{name}</strong>
          <span>
            ↓ {bytes(r.read)}
            {tr('s_a9208f04')}
            <br />↑ {bytes(r.write)}
            {tr('s_a9208f04')}
          </span>
        </div>
      ))}
    </div>
  )
}
export function DiskTemperatureWidget({ kind }: { kind: string }) {
  const storage = useStorage()
  const telemetry = useTelemetry()
  const disk = physicalDisks(storage.data).find((d) => diskWidgetKind(d) === kind)
  if (!disk)
    return (
      <div className="widget-strip">
        <span className="widget-strip-name">
          {storage.isPending
            ? tr('loading_b6819e91')
            : storage.error
              ? tr('data_unavailable_9d99b9e6')
              : tr('disk_not_found_a43d67e3')}
        </span>
        <span className="widget-strip-note">
          {storage.data
            ? tr('it_was_disconnected_or_replaced_5d14142c')
            : tr('waiting_for_storage_data_cdd4d36f')}
        </span>
      </div>
    )
  const sample = telemetry.data?.status.disks.find((s) => s.device === disk.path)
  const value = sample?.temperature ?? null
  const stale = !!sample?.stale || telemetry.data?.available === false
  const asleep = sample?.state === 'sleeping'
  return (
    <div className="widget-strip">
      <div className="widget-strip-head">
        <span className="widget-strip-name" title={`${diskLabel(disk)} · ${disk.path}`}>
          {diskLabel(disk)}
        </span>
        <strong className={`widget-strip-value tone-${value == null ? 'muted' : diskTone(value)}`}>
          {value == null ? '—' : `${Math.round(value)} °C`}
        </strong>
      </div>
      <ZoneBar
        fraction={value == null ? null : tempFraction(value, 70)}
        tone={value == null ? 'muted' : diskTone(value)}
        zones={[
          { share: 0.5, tone: 'good' },
          { share: 0.2, tone: 'warn' },
          { share: 0.3, tone: 'crit' },
        ]}
        label={tr('temperature_3a03d001', {
          v0: diskLabel(disk),
          v1:
            value == null ? ' ' + tr('unknown_8fe3b697') : tr('degrees_980ea19d', { v0: Math.round(value) }),
        })}
      />
      <span className="widget-strip-note">
        {value == null
          ? tr('no_reading_fc98df5e')
          : asleep
            ? tr('disk_asleep_last_reading_c6138350')
            : stale
              ? tr('data_is_out_of_date_ea94b7bf')
              : disk.path}
      </span>
    </div>
  )
}
/**
 * Состав этих виджетов известен только во время работы — по одному на найденный
 * диск. Плитки, уже стоящие на столе, остаются в каталоге даже если их диск
 * пропал: иначе плитка молча исчезла бы вместе с сохранённой раскладкой.
 */
export function useDiskTemperatureWidgets(): Record<string, WidgetDefinition> {
  const storage = useStorage()
  const prefs = useQuery({ queryKey: ['preferences'], queryFn: () => request<Preferences>('preferences') })
  const result: Record<string, WidgetDefinition> = {}
  const shared = {
    width: 2,
    height: 1,
    module: tr('storage_5347bdf6'),
    icon: mdiThermometer,
    bare: true,
    component: DiskTemperatureWidget,
  } as const
  for (const d of physicalDisks(storage.data))
    result[diskWidgetKind(d)] = {
      ...shared,
      title: tr('temperature_dd3a7636', { v0: diskLabel(d), v1: d.serial || d.kname }),
    }
  for (const tiles of Object.values(prefs.data?.desktopLayouts ?? {}))
    for (const tile of tiles)
      if (tile.kind.startsWith(DISK_TEMP) && !result[tile.kind])
        result[tile.kind] = { ...shared, title: tr('disk_temperature_0cbaf9a7') }
  return result
}
export function HddCoolingWidget() {
  const telemetry = useTelemetry()
  const state = telemetry.data
  const disks = state?.status.disks ?? []
  const temperatures = disks.flatMap((disk) => (disk.temperature == null ? [] : [disk.temperature]))
  const temperature = temperatures.length ? Math.max(...temperatures) : null
  const stale =
    !state?.available ||
    disks.some((disk) => disk.stale || disk.state !== 'active' || disk.temperature == null)
  const fan = state?.available ? state.status.dutyPercent : null
  return (
    <>
      <div className="widget-ring-row">
        <Ring
          fraction={temperature == null ? null : tempFraction(temperature, 70)}
          tone={temperature == null || stale ? 'muted' : diskTone(temperature)}
          center={temperature == null ? '—' : `${Math.round(temperature)}°`}
          sub={tr('hottest_disk_60e1db4d')}
          label={
            temperature == null
              ? tr('hdd_temperature_unknown_5736696c')
              : tr('hottest_hdd_temperature_degrees_41857569', { v0: Math.round(temperature) })
          }
        />
      </div>
      <WidgetFoot>
        <strong className="widget-state">
          {temperature == null
            ? tr('no_temperature_data_d4c65083')
            : stale
              ? tr('last_readings_de14326f')
              : temperature >= 55
                ? tr('overheating_17bd9f41')
                : temperature >= 45
                  ? tr('hot_a52970c6')
                  : tr('temperature_normal_c0591d63')}
        </strong>
        <span>{fan == null ? tr('fan_speed_unavailable_0afbdb35') : tr('fan_6c98836d', { v0: fan })}</span>
      </WidgetFoot>
    </>
  )
}
