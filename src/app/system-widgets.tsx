import { tr, locale } from '../i18n/index'
import { useQuery } from '@tanstack/react-query'
import { request, type Metrics } from '../api/client'
import { bytes } from '../shared/ui'
import {
  MirrorSpark,
  Ring,
  Sparkline,
  StatusChip,
  WidgetFoot,
  useClock,
  useShortHistory,
  uptimeWords,
  type Tone,
} from '../shared/widget-ui'
const useMetrics = () => useQuery({ queryKey: ['metrics'], queryFn: () => request<Metrics>('metrics') })
/** Шкала фиксированная: простаивающий процессор обязан выглядеть спокойным. */
const percentOf = (used: number, total: number) => (total ? (100 * used) / total : null)
export function cpuTone(celsius: number): Tone {
  return celsius >= 80 ? 'crit' : celsius >= 70 ? 'warn' : 'good'
}
export function diskTone(celsius: number): Tone {
  return celsius >= 55 ? 'crit' : celsius >= 45 ? 'warn' : 'good'
}
/** Метка на шкале: 20 °C слева, верх шкалы справа. */
export const tempFraction = (celsius: number, top: number) =>
  Math.max(0, Math.min(1, (celsius - 20) / (top - 20)))
export function CpuWidget() {
  const metrics = useMetrics()
  const history = useShortHistory()
  const value = metrics.data?.cpu
  const word =
    value == null
      ? ''
      : value < 25
        ? tr('idle_2939e033')
        : value < 60
          ? tr('working_fab213b1')
          : tr('busy_bad83d79')
  return (
    <>
      <div className="widget-ring-row">
        <Ring
          fraction={value == null ? null : value / 100}
          center={value == null ? '—' : `${Math.round(value)}%`}
          sub={word}
          label={tr('cpu_usage_dfc9c220', {
            v0:
              value == null
                ? ' ' + tr('unknown_8fe3b697')
                : tr('percent_024d1473', { v0: Math.round(value) }),
          })}
        />
      </div>
      <Sparkline
        values={(history.data ?? []).map((m) => m.cpu)}
        max={100}
        label={tr('cpu_usage_over_the_last_hour_52db39fc')}
      />
    </>
  )
}
export function MemoryWidget() {
  const metrics = useMetrics()
  const m = metrics.data
  const percent = m ? percentOf(m.memoryUsed, m.memoryTotal) : null
  return (
    <>
      <div className="widget-ring-row">
        <Ring
          fraction={percent == null ? null : percent / 100}
          center={percent == null ? '—' : `${Math.round(percent)}%`}
          sub={tr('used_fe26786c')}
          label={tr('memory_usage_f643b00a', {
            v0:
              percent == null
                ? ' ' + tr('unknown_478fa305')
                : tr('percent_024d1473', { v0: Math.round(percent) }),
          })}
        />
      </div>
      <WidgetFoot>
        {m
          ? tr('of_ad242546', { v0: bytes(m.memoryUsed), v1: bytes(m.memoryTotal) })
          : tr('loading_b6819e91')}
      </WidgetFoot>
    </>
  )
}
export function CoolingWidget() {
  const metrics = useMetrics()
  const m = metrics.data
  const t = m?.cpuTemperature ?? null
  return (
    <>
      <div className="widget-ring-row">
        <Ring
          fraction={t == null ? null : tempFraction(t, 90)}
          tone={t == null ? 'accent' : cpuTone(t)}
          center={t == null ? '—' : `${Math.round(t)}°`}
          sub={tr('processor_a5ae7ef5')}
          label={tr('cpu_temperature_e8bc9b51', {
            v0: t == null ? ' ' + tr('unknown_8fe3b697') : tr('degrees_980ea19d', { v0: Math.round(t) }),
          })}
        />
      </div>
      <WidgetFoot>
        {t != null && (
          <strong className="widget-state">
            {t >= 80
              ? tr('overheating_17bd9f41')
              : t >= 70
                ? tr('hot_a52970c6')
                : tr('temperature_normal_c0591d63')}
          </strong>
        )}
        <span>
          {m?.cpuFanPercent == null
            ? tr('fan_speed_unavailable_0afbdb35')
            : tr('fan_6c98836d', { v0: m.cpuFanPercent })}
        </span>
      </WidgetFoot>
    </>
  )
}
export function UptimeWidget() {
  const metrics = useMetrics()
  const power = useQuery({
    queryKey: ['power'],
    queryFn: () =>
      request<{
        throttled?: string
        undervoltage?: boolean
        throttling?: boolean
        pastUndervoltage?: boolean
      }>('manage?view=power'),
    refetchInterval: 60000,
  })
  const p = power.data
  const tone: Tone = !p?.throttled ? 'muted' : p.undervoltage || p.throttling ? 'crit' : 'good'
  const label = !p?.throttled
    ? tr('power_data_unavailable_400f0ad5')
    : p.undervoltage
      ? tr('insufficient_power_c99e9f20')
      : p.throttling
        ? tr('performance_limited_bfa9576f')
        : p.pastUndervoltage
          ? tr('undervoltage_occurred_ab54f49c')
          : tr('power_normal_9524635f')
  return (
    <>
      <div className="widget-big">
        <strong>{metrics.data ? uptimeWords(metrics.data.uptime) : '—'}</strong>
        <span>{tr('uninterrupted_bd0517d1')}</span>
      </div>
      <WidgetFoot>
        <StatusChip tone={tone}>{label}</StatusChip>
      </WidgetFoot>
    </>
  )
}
export function ClockWidget() {
  const now = useClock()
  const metrics = useMetrics()
  return (
    <div className="widget-clock">
      <strong>{now.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}</strong>
      <div className="widget-clock-details">
        <span>{now.toLocaleDateString(locale(), { day: 'numeric', month: 'long' })}</span>
        <span>{now.toLocaleDateString(locale(), { weekday: 'long' })}</span>
      </div>
      {metrics.data && (
        <em>
          {tr('uptime_e23dc648') + ' '}
          {uptimeWords(metrics.data.uptime)}
        </em>
      )}
    </div>
  )
}
export function NetworkWidget() {
  const metrics = useMetrics()
  const history = useShortHistory()
  const rates = metrics.data?.network ?? {}
  const name = Object.keys(rates)[0]
  const current = name ? rates[name] : undefined
  const rows = history.data ?? []
  return (
    <>
      <div className="widget-lines">
        <div>
          <i className="arrow up" aria-hidden="true" />
          <span>{tr('transmitting_80920f90')}</span>
          <b>{current ? tr('s_1278e806', { v0: bytes(current.write) }) : '—'}</b>
        </div>
        <div>
          <i className="arrow down" aria-hidden="true" />
          <span>{tr('receiving_155bbbd6')}</span>
          <b>{current ? tr('s_1278e806', { v0: bytes(current.read) }) : '—'}</b>
        </div>
      </div>
      {name && (
        <MirrorSpark
          up={rows.map((m) => m.network?.[name]?.read)}
          down={rows.map((m) => m.network?.[name]?.write)}
          label={tr('network_receive_and_transmit_over_an_hour_b6a3844d', { v0: name })}
        />
      )}
    </>
  )
}
