import { tr } from '../i18n/index'
import { useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { request, type Metrics } from '../api/client'

export type Tone = 'accent' | 'good' | 'warn' | 'crit' | 'muted'
const toneVar = (tone: Tone) => `var(--${tone === 'accent' ? 'accent' : tone})`

/** Дуга 270° со срезом снизу: та же геометрия, что у кольцевых шкал CasaOS. */
function arcPath(size: number, stroke: number, from: number, to: number) {
  const r = (size - stroke) / 2 - 1
  const c = size / 2
  const point = (deg: number) => {
    const a = (deg * Math.PI) / 180
    return [c + r * Math.cos(a), c + r * Math.sin(a)] as const
  }
  const [x0, y0] = point(from)
  const [x1, y1] = point(to)
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`
}

export function Ring({
  fraction,
  tone = 'accent',
  center,
  sub,
  size = 108,
  label,
}: {
  fraction: number | null
  tone?: Tone
  center: string
  sub?: string
  size?: number
  label: string
}) {
  const stroke = 11
  const clamped = Math.max(0, Math.min(1, fraction ?? 0))
  const end = 135 + 270 * clamped
  const r = (size - stroke) / 2 - 1
  const cx = size / 2 + r * Math.cos((end * Math.PI) / 180)
  const cy = size / 2 + r * Math.sin((end * Math.PI) / 180)
  return (
    <div className="widget-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <path
          d={arcPath(size, stroke, 135, 405)}
          fill="none"
          stroke="var(--panel-soft)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {fraction != null && clamped > 0.004 && (
          <path
            d={arcPath(size, stroke, 135, end)}
            fill="none"
            stroke={toneVar(tone)}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        )}
        {fraction != null && <circle cx={cx} cy={cy} r={stroke / 2} fill={toneVar(tone)} />}
      </svg>
      <div className="widget-ring-face">
        <strong>{center}</strong>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  )
}

/** Разрывы в ряду остаются разрывами: пропущенное измерение не рисуется нулём. */
export function Sparkline({
  values,
  max,
  tone = 'accent',
  height = 36,
  label,
}: {
  values: (number | null | undefined)[]
  max: number
  tone?: Tone
  height?: number
  label: string
}) {
  const width = 240
  const last = values.length - 1
  if (last < 1) return null
  const x = (i: number) => (i / last) * width
  const y = (v: number) => height - 2 - (Math.min(v, max) / max) * (height - 4)
  const segments: { i: number; v: number }[][] = [[]]
  values.forEach((v, i) => {
    if (v == null) segments.push([])
    else segments.at(-1)!.push({ i, v })
  })
  const drawn = segments.filter((s) => s.length > 1)
  return (
    <svg
      className="widget-spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {drawn.map((s, n) => (
        <path
          key={'a' + n}
          d={`M${x(s[0].i)},${height} ${s.map((p) => `L${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')} L${x(s.at(-1)!.i)},${height} Z`}
          fill={toneVar(tone)}
          opacity="0.14"
        />
      ))}
      {drawn.map((s, n) => (
        <path
          key={'l' + n}
          d={`M${s.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' L')}`}
          fill="none"
          stroke={toneVar(tone)}
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

/** Приём сверху, передача снизу, шкала общая: это один масштаб, а не две оси. */
export function MirrorSpark({
  up,
  down,
  height = 64,
  label,
}: {
  up: (number | null | undefined)[]
  down: (number | null | undefined)[]
  height?: number
  label: string
}) {
  const width = 240
  const last = Math.max(up.length, down.length) - 1
  if (last < 1) return null
  const max = Math.max(1, ...[...up, ...down].map((v) => v ?? 0))
  const mid = height / 2
  const x = (i: number) => (i / last) * width
  const area = (values: (number | null | undefined)[], sign: 1 | -1) => {
    const segments: { i: number; v: number }[][] = [[]]
    values.forEach((v, i) => {
      if (v == null) segments.push([])
      else segments.at(-1)!.push({ i, v })
    })
    return segments
      .filter((segment) => segment.length > 1)
      .map(
        (segment) =>
          `M${x(segment[0].i)},${mid} L${segment
            .map(({ i, v }) => `${x(i).toFixed(1)},${(mid - sign * (v / max) * (mid - 2)).toFixed(1)}`)
            .join(' L')} L${x(segment.at(-1)!.i)},${mid} Z`,
      )
  }
  const top = area(up, 1)
  const bottom = area(down, -1)
  return (
    <svg
      className="widget-spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {top.map((d, i) => (
        <path key={i} d={d} fill="var(--muted)" opacity="0.2" />
      ))}
      {bottom.map((d, i) => (
        <path key={i} d={d} fill="var(--accent)" opacity="0.2" />
      ))}
      <line x1="0" y1={mid} x2={width} y2={mid} stroke="var(--line)" strokeWidth="1" />
    </svg>
  )
}

/** Линейная шкала с зонами и меткой: значение против порогов, а не доля от целого. */
export function ZoneBar({
  fraction,
  tone,
  zones,
  ticks,
  label,
}: {
  fraction: number | null
  tone: Tone
  zones: { share: number; tone: Tone }[]
  ticks?: string[]
  label: string
}) {
  return (
    <div className="widget-zones" role="img" aria-label={label}>
      <div className="widget-zone-track">
        {zones.map((z, i) => (
          <i key={i} style={{ width: `${z.share * 100}%`, background: toneVar(z.tone) }} />
        ))}
        {fraction != null && (
          <b
            className="widget-zone-mark"
            style={{ left: `${Math.max(0, Math.min(1, fraction)) * 100}%`, background: toneVar(tone) }}
          />
        )}
      </div>
      {ticks && (
        <div className="widget-zone-ticks">
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export function StatusChip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`widget-chip tone-${tone}`}>
      <i style={{ background: toneVar(tone) }} />
      {children}
    </span>
  )
}

export function WidgetFoot({ children }: { children: ReactNode }) {
  return <div className="widget-foot">{children}</div>
}

/** Один запрос истории на все виджеты сразу: ключ общий, TanStack Query его разделит. */
export function useShortHistory() {
  return useQuery({
    queryKey: ['history', 1],
    queryFn: () => request<Metrics[]>('metrics/history?hours=1'),
    refetchInterval: 60000,
    staleTime: 55000,
  })
}

export function useClock(stepMs = 10000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), stepMs)
    return () => clearInterval(timer)
  }, [stepMs])
  return now
}

export function uptimeWords(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor(minutes / 60) % 24
  if (days) return tr('uptime.days', { days, hours })
  if (hours) return tr('uptime.hours', { hours, minutes: minutes % 60 })
  return tr('uptime.minutes', { minutes })
}
