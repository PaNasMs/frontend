import { useQueryValue } from './navigation'
import { tr } from '../i18n/index'
import { WallpaperSettings } from './wallpaper'
import { useModuleWidgets } from './module-registry'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
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
  mdiArrowTopRight,
  mdiCogOutline,
} from '@mdi/js'
import { request, type Metrics, type Preferences } from '../api/client'
import { Button, DialogContent, Icon, Notice, bytes } from '../shared/ui'
import { screen, columns, free, place, defaults, apps, type Tile } from './desktop-layout'
import { usePreferencesSave } from './preferences-save'
import { useUnsavedForm } from '../shared/interaction'
export { newID, type Tile } from './desktop-layout'
type LayoutDraft = { tiles: Tile[]; baseline: string; original: string }
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
  const gridMaxWidth = cols * 176
  const initial = useMemo(
    () =>
      Object.fromEntries(['mobile', 'medium', 'wide'].map((layout) => [layout, defaults(columns(layout))])),
    [],
  )
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, LayoutDraft>>({})
  const [selected, setSelected] = useState('cpu')
  const [moving, setMoving] = useState<string | null>(null)
  const [configuring, setConfiguring] = useState<string | null>(null)
  const [configurationMode, setConfigurationMode] = useState<string>(mode)
  const [adding, setAdding] = useState<string | null>(null)
  const [configuration, setConfiguration] = useState<Record<string, string>>({})
  const prefs = useQuery({ queryKey: ['preferences'], queryFn: () => request<Preferences>('preferences') })
  const metrics = useQuery({ queryKey: ['metrics'], queryFn: () => request<Metrics>('metrics') })
  const save = usePreferencesSave()
  useEffect(() => {
    const resize = () => {
      const next = screen()
      if (next !== mode) {
        setMode(next)
        setMoving(null)
        setDrag(null)
        pointer.current = null
      }
    }
    addEventListener('resize', resize)
    return () => removeEventListener('resize', resize)
  }, [mode])
  function savedTiles(layout: string) {
    return ((prefs.data?.desktopLayouts?.[layout] as Tile[] | undefined) ?? initial[layout]).filter(
      (tile) => catalog[tile.kind],
    )
  }
  function layoutDraft(layout: string): LayoutDraft {
    const tiles = savedTiles(layout)
    return {
      tiles,
      baseline: JSON.stringify(prefs.data?.desktopLayouts?.[layout] ?? null),
      original: JSON.stringify(tiles),
    }
  }
  function setDraft(update: Tile[] | ((old: Tile[]) => Tile[]), layout = mode) {
    setDrafts((previous) => {
      const current = previous[layout] ?? layoutDraft(layout)
      return {
        ...previous,
        [layout]: { ...current, tiles: typeof update === 'function' ? update(current.tiles) : update },
      }
    })
  }
  const draft = drafts[mode]?.tiles ?? savedTiles(mode)
  const tiles = (editing ? draft : savedTiles(mode)).filter((tile) => catalog[tile.kind])
  const configurationTiles = drafts[configurationMode]?.tiles ?? savedTiles(configurationMode)
  const changedDrafts = Object.entries(drafts).filter(
    ([, value]) => JSON.stringify(value.tiles) !== value.original,
  )
  function discard() {
    setEditing(false)
    setDrafts({})
    setMoving(null)
    setDrag(null)
    pointer.current = null
    setAdding(null)
    setConfiguring(null)
  }
  useUnsavedForm(editing && changedDrafts.length > 0, discard)
  const draggedTile = draft.find((t) => t.id === drag?.id)
  const draggedSize = draggedTile ? catalog[draggedTile.kind] : undefined
  const rows = Math.max(1, ...tiles.map((t) => t.y + catalog[t.kind].height)) + (editing ? 2 : 0)
  const choices = Object.entries(catalog).sort(
    (a, b) => a[1].module.localeCompare(b[1].module) || a[1].title.localeCompare(b[1].title),
  )
  function closeConfiguration() {
    if (adding) setDraft((old) => old.filter((tile) => tile.id !== adding), configurationMode)
    setAdding(null)
    setConfiguring(null)
  }
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
    if (save.isPending || !changedDrafts.length) return
    save.mutate(
      (p) => {
        const layouts = { ...p.desktopLayouts }
        for (const [layout, value] of changedDrafts) {
          if (JSON.stringify(p.desktopLayouts?.[layout] ?? null) !== value.baseline)
            throw Error(tr('the_layout_was_changed_from_the_application_menu_c_204dc84a'))
          layouts[layout] = value.tiles
        }
        return { ...p, desktopLayouts: layouts }
      },
      { onSuccess: discard },
    )
  }
  return (
    <section className="personal-desktop">
      <div className="desktop-heading" style={{ maxWidth: `min(100%, ${gridMaxWidth}px)` }}>
        <h1>{tr('desktop_651d54bb')}</h1>
        <div className="actions">
          {editing ? (
            <>
              <Button
                title={tr('discard_changes_9aff1e0e')}
                aria-label={tr('discard_changes_9aff1e0e')}
                disabled={save.isPending}
                onClick={discard}
              >
                <Icon path={mdiClose} />
              </Button>
              <Button className="primary" disabled={save.isPending || !changedDrafts.length} onClick={apply}>
                {tr('desktop.saveLayouts')}
              </Button>
            </>
          ) : (
            <Button
              title={tr('customize_desktop_701fd886')}
              aria-label={tr('customize_desktop_701fd886')}
              disabled={!prefs.data}
              onClick={() => {
                setDrafts({ [mode]: layoutDraft(mode) })
                setEditing(true)
              }}
            >
              <Icon path={mdiPencilOutline} />
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <div className="desktop-tools surface">
          <p role="status">{tr('desktop.editingLayout', { layout: tr('desktop.layout.' + mode) })}</p>
          <div className="desktop-add">
            <label className="field">
              <span className="sr-only">{tr('desktop_item_picker_label')}</span>
              <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                <optgroup label={tr('desktop_widgets_group')}>
                  {choices
                    .filter(([, w]) => !!w.component)
                    .map(([id, w]) => (
                      <option key={id} value={id}>
                        {tr('desktop_widget_type')} · {w.module} · {w.title}
                      </option>
                    ))}
                </optgroup>
                <optgroup label={tr('desktop_shortcuts_group')}>
                  {choices
                    .filter(([, w]) => !w.component && !!w.href)
                    .map(([id, w]) => (
                      <option key={id} value={id}>
                        {tr('desktop_shortcut_type')} · {w.title}
                      </option>
                    ))}
                </optgroup>
              </select>
            </label>
            <Button
              title={tr('desktop_add_item')}
              aria-label={tr('desktop_add_item')}
              disabled={save.isPending}
              onClick={() => {
                const t = place(selected, draft, cols)
                if (t) {
                  setDraft([...draft, t])
                  if (catalog[selected]?.configure) {
                    setConfiguration({})
                    setConfigurationMode(mode)
                    setAdding(t.id)
                    setConfiguring(t.id)
                  }
                }
              }}
            >
              <Icon path={mdiPlus} />
            </Button>
          </div>
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
          gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`,
          maxWidth: gridMaxWidth,
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
            Widget = w.component,
            shortcutHref = Widget ? undefined : w.href,
            app = shortcutHref ? apps().find((a) => a.path === shortcutHref) : undefined
          return (
            <article
              key={t.id}
              className={`tile coordinate-tile ${shortcutHref ? 'desktop-shortcut' : w.bare ? 'desktop-widget bare' : 'desktop-widget'} ${editing ? 'editing' : ''} ${moving === t.id ? 'moving' : ''} ${drag?.id === t.id ? 'dragging' : ''}`}
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
                  {w.configure && (
                    <button
                      title={tr('configure_8960ddc3')}
                      aria-label={`${tr('configure_8960ddc3')}: ${w.title}`}
                      disabled={save.isPending}
                      onClick={() => {
                        setDraft((old) => old)
                        setConfiguration(t.config ?? {})
                        setConfigurationMode(mode)
                        setAdding(null)
                        setConfiguring(t.id)
                      }}
                    >
                      <Icon path={mdiCogOutline} size={16} />
                    </button>
                  )}
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
              {shortcutHref ? (
                <Link
                  draggable={false}
                  to={shortcutHref}
                  className="shortcut-link"
                  onClick={(e) => editing && e.preventDefault()}
                >
                  <span className="desktop-app-icon">
                    <Icon path={app?.icon ?? mdiViewDashboardOutline} size={30} />
                  </span>
                  <span>{w.title}</span>
                </Link>
              ) : w.bare ? (
                Widget && <Widget kind={t.kind} config={t.config} editing={editing} />
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
                    {!editing && !w.history && w.href && (
                      <Link
                        to={w.href}
                        title={tr('widget.openSection', { name: w.title })}
                        aria-label={tr('widget.openSection', { name: w.title })}
                      >
                        <Icon path={mdiArrowTopRight} size={16} />
                      </Link>
                    )}
                  </div>
                  <div className="desktop-widget-content">
                    {Widget && <Widget kind={t.kind} config={t.config} editing={editing} />}
                  </div>
                </>
              )}
            </article>
          )
        })}
      </div>
      <Dialog.Root open={!!configuring} onOpenChange={(open) => !open && closeConfiguration()}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent
            className="settings-dialog"
            dirty={
              !!configuring &&
              JSON.stringify(configuration) !==
                JSON.stringify(configurationTiles.find((t) => t.id === configuring)?.config ?? {})
            }
            header={
              <>
                <Dialog.Title>{tr('configure_8960ddc3')}</Dialog.Title>
                <Dialog.Description>
                  {catalog[configurationTiles.find((t) => t.id === configuring)?.kind ?? '']?.title}
                </Dialog.Description>
              </>
            }
            footer={
              <div className="actions">
                <Button data-dialog-cancel onClick={closeConfiguration}>
                  {tr('cancel_0ec753be')}
                </Button>
                <Button
                  className="primary"
                  onClick={() => {
                    setDraft(
                      (old) =>
                        old.map((tile) =>
                          tile.id === configuring ? { ...tile, config: configuration } : tile,
                        ),
                      configurationMode,
                    )
                    setAdding(null)
                    setConfiguring(null)
                  }}
                >
                  {tr('apply_768af677')}
                </Button>
              </div>
            }
          >
            {(() => {
              const tile = configurationTiles.find((t) => t.id === configuring)
              const Configure = tile && catalog[tile.kind]?.configure
              return Configure ? <Configure value={configuration} onChange={setConfiguration} /> : null
            })()}
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
export function HistoryPage() {
  const [hovered, setHovered] = useState<Record<string, number | undefined>>({})
  const [openValues, setOpenValues] = useState<Record<string, boolean>>({})
  const [technical, setTechnical] = useState(false)
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
    const present = values.filter((v): v is number => v != null && Number.isFinite(v))
    const format = (value: number) =>
      key === 'cpu' || key === 'memory' ? `${value.toFixed(1)}%` : `${bytes(value)}/s`
    const selected = hovered[key]
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
      <div className="chart-content">
        <svg
          viewBox="0 0 1000 200"
          role="img"
          aria-label={tr('history_87c7eb93', { v0: key })}
          tabIndex={0}
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect()
            const index = Math.max(
              0,
              Math.min(
                rows.length - 1,
                Math.round(((event.clientX - bounds.left) / bounds.width) * (rows.length - 1)),
              ),
            )
            setHovered((previous) => ({ ...previous, [key]: index }))
          }}
          onPointerLeave={() => setHovered((previous) => ({ ...previous, [key]: undefined }))}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            setHovered((previous) => ({
              ...previous,
              [key]: Math.max(
                0,
                Math.min(rows.length - 1, (previous[key] ?? 0) + (event.key === 'ArrowRight' ? 1 : -1)),
              ),
            }))
          }}
          onBlur={() => setHovered((previous) => ({ ...previous, [key]: undefined }))}
        >
          {segments.map((s, i) => (
            <polyline key={i} points={s.join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
          ))}
          {selected != null && rows[selected] && (
            <line
              x1={rows.length > 1 ? (selected / (rows.length - 1)) * 1000 : 0}
              x2={rows.length > 1 ? (selected / (rows.length - 1)) * 1000 : 0}
              y1="0"
              y2="200"
              stroke="currentColor"
              strokeDasharray="4 4"
            />
          )}
        </svg>
        <div className="chart-summary" aria-live="polite">
          {selected != null && rows[selected] ? (
            <span>
              {new Date(rows[selected].observedAt).toLocaleString()} ·{' '}
              {values[selected] == null ? '—' : format(values[selected])}
            </span>
          ) : (
            <span>
              {present.length
                ? tr('storage.chart_summary', {
                    min: format(Math.min(...present)),
                    avg: format(present.reduce((a, b) => a + b, 0) / present.length),
                    max: format(Math.max(...present)),
                  })
                : '—'}
            </span>
          )}
        </div>
        <div className="chart-summary">
          <span>0 — {key === 'cpu' || key === 'memory' ? '100%' : bytes(max) + '/s'}</span>
          <span>
            {rows.length ? new Date(rows[0].observedAt).toLocaleString() : '—'} —{' '}
            {rows.length ? new Date(rows[rows.length - 1].observedAt).toLocaleString() : '—'}
          </span>
        </div>
        <details
          className="chart-values"
          onToggle={(event) =>
            setOpenValues((previous) => ({ ...previous, [key]: event.currentTarget.open }))
          }
        >
          <summary>{tr('ui.chartData')}</summary>
          {openValues[key] && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{tr('ui.time')}</th>
                    <th>{key === 'cpu' || key === 'memory' ? '%' : tr('b_923f9729') + '/s'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.observedAt}>
                      <td>{new Date(row.observedAt).toLocaleString()}</td>
                      <td>
                        {values[i] == null
                          ? '—'
                          : Number(values[i]).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      </div>
    )
  }
  return (
    <>
      <div className="page-heading">
        <h1>{tr('metrics_history_50331506')}</h1>
        <div className="segmented" role="radiogroup" aria-label={tr('period_b2822e2b')}>
          {(
            [
              [1, 'hour_9ce65a67'],
              [24, 'day_c91ce69e'],
              [168, 'week_9207563d'],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              role="radio"
              key={value}
              aria-checked={hours === value}
              onClick={() => setHours(value)}
            >
              {tr(label)}
            </button>
          ))}
        </div>
      </div>
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
            <label className="check">
              <input type="checkbox" checked={technical} onChange={(e) => setTechnical(e.target.checked)} />
              {tr('ui.advancedDevices')}
            </label>
            <label className="field">
              {tr('device_bc791dbe')}
              <select value={disk} onChange={(e) => setDisk(e.target.value)}>
                <option value="">{tr('select_a_device_64ef214b')}</option>
                {Object.keys(rows.at(-1)?.disks ?? {})
                  .filter((n) => technical || !/^(ram|loop|zram)/.test(n))
                  .map((n) => (
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
