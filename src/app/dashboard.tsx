import { useQueryValue } from './navigation'
import { tr } from '../i18n/index'
import { WallpaperSettings } from './wallpaper'
import { useModuleWidgets } from './module-registry'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  mdiPencilOutline,
  mdiCheck,
  mdiClose,
  mdiPlus,
  mdiRestore,
  mdiDrag,
  mdiChartLine,
  mdiChip,
  mdiViewDashboardOutline,
} from '@mdi/js'
import { request, type Metrics, type Preferences } from '../api/client'
import { Button, Icon, Notice } from '../shared/ui'
import { screen, columns, free, place, defaults, apps, type Tile } from './desktop-layout'
import { usePreferencesSave } from './preferences-save'
export { newID, type Tile } from './desktop-layout'
export function Dashboard() {
  const pointer = useRef<{
    id: string
    x: number
    y: number
    offsetX: number
    offsetY: number
    moved: boolean
  } | null>(null)
  const suppressClick = useRef(false)
  const [drag, setDrag] = useState<{
    id: string
    x: number
    y: number
    dx: number
    dy: number
    valid: boolean
  } | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  // Каталог собирается из модулей: оболочка не знает, какие виджеты существуют.
  const catalog = useModuleWidgets()
  const [mode, setMode] = useState(screen)
  const cols = columns(mode)
  const initial = useMemo(() => defaults(cols), [cols])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Tile[]>([])
  const [base, setBase] = useState('')
  const [selected, setSelected] = useState('cpu')
  const [moving, setMoving] = useState<string | null>(null)
  const prefs = useQuery({ queryKey: ['preferences'], queryFn: () => request<Preferences>('preferences') })
  const metrics = useQuery({ queryKey: ['metrics'], queryFn: () => request<Metrics>('metrics') })
  const save = usePreferencesSave()
  useEffect(() => {
    const resize = () => {
      const next = screen()
      setMode((old) => {
        if (old !== next) {
          setEditing(false)
          setMoving(null)
          setDrag(null)
          pointer.current = null
        }
        return next
      })
    }
    addEventListener('resize', resize)
    return () => removeEventListener('resize', resize)
  }, [])
  const stored = prefs.data?.desktopLayouts?.[mode] as Tile[] | undefined
  const tiles = (editing ? draft : (stored ?? initial)).filter((t) => catalog[t.kind])
  const draggedTile = draft.find((t) => t.id === drag?.id)
  const draggedSize = draggedTile ? catalog[draggedTile.kind] : undefined
  const rows = Math.max(1, ...tiles.map((t) => t.y + catalog[t.kind].height)) + (editing ? 2 : 0)
  const choices = Object.entries(catalog).sort(
    (a, b) => a[1].module.localeCompare(b[1].module) || a[1].title.localeCompare(b[1].title),
  )
  function move(id: string, x: number, y: number) {
    const old = draft.find((t) => t.id === id)
    if (!old) return
    const tile = { ...old, x, y }
    if (free(tile, draft, cols)) {
      setDraft(draft.map((t) => (t.id === id ? tile : t)))
      setMoving(null)
    }
  }
  function dragPosition(clientX: number, clientY: number) {
    const p = pointer.current
    const tile = draft.find((t) => t.id === p?.id)
    const cell = grid.current?.querySelector<HTMLElement>('.empty-cell')
    if (!p || !tile || !cell || !grid.current) return null
    const rect = grid.current.getBoundingClientRect()
    const cellRect = cell.getBoundingClientRect()
    const gap = parseFloat(getComputedStyle(grid.current).columnGap)
    const pitchX = cellRect.width + gap
    const pitchY = cellRect.height + parseFloat(getComputedStyle(grid.current).rowGap)
    const left = clientX - p.offsetX - rect.left
    const top = clientY - p.offsetY - rect.top
    const x = Math.round(left / pitchX)
    const y = Math.round(top / pitchY)
    return {
      id: p.id,
      x,
      y,
      dx: left - tile.x * pitchX,
      dy: top - tile.y * pitchY,
      valid: y + catalog[tile.kind].height <= rows && free({ ...tile, x, y }, draft, cols),
    }
  }
  function endDrag() {
    pointer.current = null
    setDrag(null)
    setMoving(null)
  }
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') endDrag()
    }
    addEventListener('keydown', cancel)
    return () => removeEventListener('keydown', cancel)
  }, [])
  function apply() {
    save.mutate(
      (p) => {
        if (JSON.stringify(p.desktopLayouts?.[mode] ?? null) !== base)
          throw Error(tr('the_layout_was_changed_from_the_application_menu_c_204dc84a'))
        return { ...p, desktopLayouts: { ...p.desktopLayouts, [mode]: draft } }
      },
      {
        onSuccess: () => {
          setEditing(false)
          setMoving(null)
          setDrag(null)
          pointer.current = null
        },
      },
    )
  }
  return (
    <section className="personal-desktop">
      <div className="desktop-heading">
        <h1>{tr('desktop_651d54bb')}</h1>
        <div className="actions">
          {editing ? (
            <>
              <Button
                title={tr('discard_changes_9aff1e0e')}
                aria-label={tr('discard_changes_9aff1e0e')}
                disabled={save.isPending}
                onClick={() => {
                  setEditing(false)
                  setMoving(null)
                }}
              >
                <Icon path={mdiClose} />
              </Button>
              <Button
                title={tr('save_layout_ae62a41e')}
                aria-label={tr('save_layout_ae62a41e')}
                disabled={save.isPending}
                onClick={apply}
              >
                <Icon path={mdiCheck} />
              </Button>
            </>
          ) : (
            <Button
              title={tr('customize_desktop_701fd886')}
              aria-label={tr('customize_desktop_701fd886')}
              disabled={!prefs.data}
              onClick={() => {
                setDraft(tiles)
                setBase(JSON.stringify(stored ?? null))
                setEditing(true)
              }}
            >
              <Icon path={mdiPencilOutline} />
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <div className="desktop-tools">
          <label className="field">
            {tr('add_widget_59aad89f')}
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              {choices.map(([id, w]) => (
                <option key={id} value={id}>
                  {w.module} · {w.title}
                </option>
              ))}
            </select>
          </label>
          <Button
            title={tr('add_widget_59aad89f')}
            aria-label={tr('add_widget_59aad89f')}
            disabled={save.isPending}
            onClick={() => {
              const t = place(selected, draft, cols)
              if (t) setDraft([...draft, t])
            }}
          >
            <Icon path={mdiPlus} />
          </Button>
          <Button
            title={tr('default_layout_917fca95')}
            aria-label={tr('default_layout_917fca95')}
            disabled={save.isPending}
            onClick={() => setDraft(defaults(cols))}
          >
            <Icon path={mdiRestore} />
          </Button>
          <WallpaperSettings />
          <p className="small muted">{tr('drag_an_item_or_select_its_move_icon_and_an_empty__2c2a5f2b')}</p>
        </div>
      )}
      {save.error && <Notice error>{save.error.message}</Notice>}
      {metrics.error && <Notice error>{metrics.error.message}</Notice>}
      <div
        ref={grid}
        className="coordinate-grid"
        style={{
          gridTemplateColumns: `repeat(${cols},minmax(0,112px))`,
          gridTemplateRows: `repeat(${rows},100px)`,
        }}
      >
        {editing &&
          Array.from({ length: cols * rows }, (_, i) => {
            const x = i % cols,
              y = Math.floor(i / cols)
            const highlighted =
              drag &&
              draggedSize &&
              x >= drag.x &&
              x < drag.x + draggedSize.width &&
              y >= drag.y &&
              y < drag.y + draggedSize.height
            return (
              <button
                key={'cell' + i}
                className={`empty-cell ${highlighted ? `drop-target ${drag.valid ? 'valid' : 'invalid'}` : ''}`}
                disabled={save.isPending}
                aria-label={tr('cell_4122c8df', { v0: x + 1, v1: y + 1 })}
                style={{ gridColumn: x + 1, gridRow: y + 1 }}
                onClick={() => {
                  if (moving) move(moving, x, y)
                }}
              />
            )
          })}
        {tiles.map((t) => {
          const w = catalog[t.kind],
            app = apps().find((a) => a.path === w.href),
            Widget = w.component
          return (
            <article
              key={t.id}
              className={`tile coordinate-tile ${w.href ? 'desktop-shortcut' : w.bare ? 'desktop-widget bare' : 'desktop-widget'} ${editing ? 'editing' : ''} ${moving === t.id ? 'moving' : ''} ${drag?.id === t.id ? 'dragging' : ''}`}
              draggable={false}
              onPointerDown={(e) => {
                if (
                  !editing ||
                  save.isPending ||
                  e.button !== 0 ||
                  (e.target as Element).closest('button:not([data-drag-handle])')
                )
                  return
                const rect = e.currentTarget.getBoundingClientRect()
                suppressClick.current = false
                pointer.current = {
                  id: t.id,
                  x: e.clientX,
                  y: e.clientY,
                  offsetX: e.clientX - rect.left,
                  offsetY: e.clientY - rect.top,
                  moved: false,
                }
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                const p = pointer.current
                if (!p) return
                if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 8) return
                p.moved = true
                suppressClick.current = true
                setMoving(p.id)
                setDrag(dragPosition(e.clientX, e.clientY))
              }}
              onPointerUp={(e) => {
                const target = pointer.current?.moved ? dragPosition(e.clientX, e.clientY) : null
                if (target?.valid) move(target.id, target.x, target.y)
                endDrag()
              }}
              onPointerCancel={endDrag}
              onLostPointerCapture={endDrag}
              onClickCapture={(e) => {
                if (suppressClick.current) {
                  e.preventDefault()
                  e.stopPropagation()
                  suppressClick.current = false
                }
              }}
              style={{
                gridColumn: `${t.x + 1}/span ${w.width}`,
                gridRow: `${t.y + 1}/span ${w.height}`,
                transform: drag?.id === t.id ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
              }}
            >
              {editing && (
                <div className="tile-controls">
                  <button
                    data-drag-handle
                    title={tr('move_54dacb06')}
                    aria-label={tr('move_2c232e90', { v0: w.title })}
                    disabled={save.isPending}
                    onClick={() => setMoving(t.id)}
                  >
                    <Icon path={mdiDrag} size={16} />
                  </button>
                  <button
                    title={tr('remove_from_desktop_16fc9723')}
                    aria-label={tr('remove_c5329f3a', { v0: w.title })}
                    disabled={save.isPending}
                    onClick={() => setDraft(draft.filter((d) => d.id !== t.id))}
                  >
                    <Icon path={mdiClose} size={16} />
                  </button>
                </div>
              )}
              {w.href ? (
                <Link
                  draggable={false}
                  to={w.href}
                  className="shortcut-link"
                  onClick={(e) => editing && e.preventDefault()}
                >
                  <span className="desktop-app-icon">
                    <Icon path={app?.icon ?? mdiViewDashboardOutline} size={30} />
                  </span>
                  <span>{w.title}</span>
                </Link>
              ) : w.bare ? (
                Widget && <Widget kind={t.kind} />
              ) : (
                <>
                  <div className="tile-title">
                    <Icon path={w.icon ?? mdiChip} size={18} />
                    <span>{w.title}</span>
                    {!editing && w.history && (
                      <Link
                        to="/history"
                        title={tr('history_0f6b6623', { v0: w.title })}
                        aria-label={tr('history_0f6b6623', { v0: w.title })}
                      >
                        <Icon path={mdiChartLine} size={16} />
                      </Link>
                    )}
                  </div>
                  <div className="desktop-widget-content">{Widget && <Widget kind={t.kind} />}</div>
                </>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
export function HistoryPage() {
  const [disk, setDisk] = useQueryValue('disk')
  const [network, setNetwork] = useQueryValue('network')
  const [hoursValue, setHoursValue] = useQueryValue('hours', '24', ['1', '24', '168'])
  const hours = Number(hoursValue)
  const setHours = (value: number) => setHoursValue(String(value))
  const data = useQuery({
    queryKey: ['history', hours],
    queryFn: () => request<Metrics[]>(`metrics/history?hours=${hours}`),
    refetchInterval: 60000,
  })
  const rows = data.data ?? []
  function chart(key: 'cpu' | 'memory' | 'disk-read' | 'disk-write' | 'network-read' | 'network-write') {
    const values = rows.map((m) =>
      key === 'cpu'
        ? m.cpu
        : key === 'memory'
          ? m.memoryTotal
            ? (100 * m.memoryUsed) / m.memoryTotal
            : null
          : key.startsWith('disk')
            ? m.disks?.[disk]?.[key.endsWith('read') ? 'read' : 'write']
            : m.network?.[network]?.[key.endsWith('read') ? 'read' : 'write'],
    )
    const max = key === 'cpu' || key === 'memory' ? 100 : Math.max(1, ...values.map((v) => v ?? 0))
    const points = values.map((val, i) =>
      val == null
        ? null
        : `${rows.length > 1 ? (i / (rows.length - 1)) * 1000 : 0},${200 - (val / max) * 200}`,
    )
    const segments: string[][] = [[]]
    points.forEach((p, i) => {
      if (
        i > 0 &&
        new Date(rows[i].observedAt).getTime() - new Date(rows[i - 1].observedAt).getTime() > 90000
      )
        segments.push([])
      if (p) segments.at(-1)!.push(p)
      else segments.push([])
    })
    return (
      <svg viewBox="0 0 1000 200" role="img" aria-label={tr('history_87c7eb93', { v0: key })}>
        {segments.map((s, i) => (
          <polyline key={i} points={s.join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
        ))}
      </svg>
    )
  }
  return (
    <>
      <h1>{tr('metrics_history_50331506')}</h1>
      <label className="field">
        {tr('period_b2822e2b')}
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          <option value={1}>{tr('hour_9ce65a67')}</option>
          <option value={24}>{tr('day_c91ce69e')}</option>
          <option value={168}>{tr('week_9207563d')}</option>
        </select>
      </label>
      {data.error && <Notice error>{data.error.message}</Notice>}
      {rows.length < 2 ? (
        <Notice>{tr('collecting_history_one_sample_per_minute_retained__7165e41c')}</Notice>
      ) : (
        <>
          <section className="surface history-chart">
            <h2>CPU, %</h2>
            {chart('cpu')}
          </section>
          <section className="surface history-chart">
            <h2>{tr('memory_d561f0e3')}</h2>
            {chart('memory')}
          </section>
          <section className="surface history-chart">
            <h2>{tr('network_receive_transmit_837e6e60')}</h2>
            <label className="field">
              {tr('interface_8d7038f8')}
              <select value={network} onChange={(e) => setNetwork(e.target.value)}>
                <option value="">{tr('select_an_interface_15e286c1')}</option>
                {Object.keys(rows.at(-1)?.network ?? {}).map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            {network && (
              <>
                {chart('network-read')}
                {chart('network-write')}
              </>
            )}
          </section>
          <section className="surface history-chart">
            <h2>{tr('disk_read_write_c3f4ccec')}</h2>
            <label className="field">
              {tr('device_bc791dbe')}
              <select value={disk} onChange={(e) => setDisk(e.target.value)}>
                <option value="">{tr('select_a_device_64ef214b')}</option>
                {Object.keys(rows.at(-1)?.disks ?? {}).map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            {disk && (
              <>
                {chart('disk-read')}
                {chart('disk-write')}
              </>
            )}
          </section>
        </>
      )}
      <p className="small muted">{tr('missing_samples_are_not_replaced_with_zeroes_histo_8b0e9df7')}</p>
    </>
  )
}
