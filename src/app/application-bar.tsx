import { tr } from '../i18n/index'
import { OngoingTasks } from './ongoing-tasks'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { mdiViewDashboardOutline, mdiMonitorDashboard, mdiCheck, mdiDotsVertical } from '@mdi/js'
import { request, type Preferences } from '../api/client'
import { Icon } from '../shared/ui'
import { apps, shortcutKind, defaults, columns, screen, toggleShortcut, reorder } from './desktop-layout'
import { usePreferencesSave } from './preferences-save'
export function ApplicationBar() {
  const prefs = useQuery({ queryKey: ['preferences'], queryFn: () => request<Preferences>('preferences') })
  const save = usePreferencesSave()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [context, setContext] = useState<{
    id: string
    x: number
    y: number
  } | null>(null)
  const [dragged, setDragged] = useState('')
  const [over, setOver] = useState('')
  const pointer = useRef<{
    id: string
    x: number
    y: number
    moved: boolean
  } | null>(null)
  const suppressClick = useRef(false)
  const root = useRef<HTMLDivElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const applications = apps()
  const ids = (prefs.data?.taskbar ?? applications.filter((a) => a.id !== 'history').map((a) => a.id)).filter(
    (id) => applications.some((a) => a.id === id),
  )
  const mode = screen()
  const desktop = prefs.data?.desktopLayouts?.[mode] ?? defaults(columns(mode))
  const app = applications.find((a) => a.id === context?.id)
  useEffect(() => {
    setOpen(false)
    setContext(null)
  }, [location.pathname, location.search])
  useEffect(() => {
    function close(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node) && !popup.current?.contains(e.target as Node)) {
        setOpen(false)
        setContext(null)
      }
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setContext(null)
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  useEffect(() => {
    popup.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [context])
  function arrange(source: string, target: string) {
    if (source === target) return
    save.mutate((p) => ({ ...p, taskbar: reorder(p.taskbar ?? ids, source, target) }))
    setDragged('')
    setOver('')
  }
  function showContext(id: string, x: number, y: number) {
    setContext({
      id,
      x: Math.max(8, Math.min(x, innerWidth - 270)),
      y: Math.max(8, Math.min(y, innerHeight - 145)),
    })
  }
  return (
    <div className="application-bar" ref={root}>
      <button
        ref={trigger}
        className="app-launcher"
        title={tr('applications_946ee087')}
        aria-label={tr('applications_946ee087')}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          setContext(null)
        }}
      >
        <Icon path={mdiViewDashboardOutline} />
      </button>
      <NavLink
        className="desktop-home"
        to="/"
        end
        title={tr('desktop_651d54bb')}
        aria-label={tr('desktop_651d54bb')}
      >
        <Icon path={mdiMonitorDashboard} />
      </NavLink>
      <nav aria-label={tr('pinned_applications_ea84a502')}>
        {ids.map((id) => {
          const a = applications.find((a) => a.id === id)!
          return (
            <NavLink
              key={id}
              to={a.path}
              title={a.title}
              aria-label={a.title}
              className={
                over === id ? (ids.indexOf(dragged) < ids.indexOf(id) ? 'drop-after' : 'drop-before') : ''
              }
              data-app-id={id}
              draggable={false}
              onPointerDown={(e) => {
                if (e.button !== 0 || save.isPending) return
                pointer.current = { id, x: e.clientX, y: e.clientY, moved: false }
                suppressClick.current = false
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                const p = pointer.current
                if (!p) return
                if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 8) return
                p.moved = true
                setDragged(p.id)
                const target = document
                  .elementFromPoint(e.clientX, e.clientY)
                  ?.closest<HTMLElement>('[data-app-id]')
                setOver(target?.dataset.appId ?? '')
              }}
              onPointerUp={(e) => {
                const p = pointer.current
                pointer.current = null
                if (!p?.moved) return
                suppressClick.current = true
                const target = document
                  .elementFromPoint(e.clientX, e.clientY)
                  ?.closest<HTMLElement>('[data-app-id]')?.dataset.appId
                if (target) arrange(p.id, target)
                setDragged('')
                setOver('')
              }}
              onPointerCancel={() => {
                pointer.current = null
                setDragged('')
                setOver('')
              }}
              onClick={(e) => {
                if (suppressClick.current) {
                  e.preventDefault()
                  suppressClick.current = false
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                showContext(id, e.clientX, e.clientY)
              }}
              onKeyDown={(e) => {
                if (e.altKey && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                  e.preventDefault()
                  const at = ids.indexOf(id),
                    next = at + (e.key === 'ArrowLeft' ? -1 : 1)
                  if (next < 0 || next >= ids.length) return
                  save.mutate((p) => {
                    const order = [...(p.taskbar ?? ids)]
                    ;[order[at], order[next]] = [order[next], order[at]]
                    return { ...p, taskbar: order }
                  })
                }
              }}
            >
              <Icon path={a.icon} />
            </NavLink>
          )
        })}
      </nav>
      <span className="application-separator" aria-hidden="true" />
      <OngoingTasks />
      {open && (
        <section className="app-launcher-menu" aria-label={tr('nas_applications_5f56f294')}>
          <h2>{tr('applications_946ee087')}</h2>
          <div className="app-launcher-grid">
            {applications.map((a) => (
              <div key={a.id} className="launcher-entry">
                <Link
                  to={a.path}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    showContext(a.id, e.clientX, e.clientY)
                  }}
                >
                  <Icon path={a.icon} size={30} />
                  <span>{a.title}</span>
                </Link>
                <button
                  title={tr('pin_572cce90', { v0: a.title })}
                  aria-label={tr('pin_572cce90', { v0: a.title })}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    showContext(a.id, rect.left, rect.bottom)
                  }}
                >
                  <Icon path={mdiDotsVertical} size={16} />
                </button>
              </div>
            ))}
          </div>
          <p>{tr('right_click_to_choose_where_to_show_the_icon_f2e50e07')}</p>
        </section>
      )}
      {save.error && (
        <div className="app-save-error" role="alert">
          {save.error.message}
        </div>
      )}
      {context &&
        app &&
        createPortal(
          <div
            className="app-context-menu"
            ref={popup}
            role="menu"
            aria-label={tr('pin_572cce90', { v0: app.title })}
            style={{ left: context.x, top: context.y }}
            onKeyDown={(e) => {
              if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
                e.preventDefault()
                const buttons = Array.from(popup.current!.querySelectorAll('button'))
                const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
                buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
              }
            }}
          >
            <button
              role="menuitemcheckbox"
              aria-checked={ids.includes(app.id)}
              disabled={save.isPending}
              onClick={() => {
                save.mutate((p) => ({
                  ...p,
                  taskbar: ids.includes(app.id)
                    ? (p.taskbar ?? ids).filter((id) => id !== app.id)
                    : [...(p.taskbar ?? ids), app.id],
                }))
                setContext(null)
              }}
            >
              <span>{ids.includes(app.id) && <Icon path={mdiCheck} size={17} />}</span>
              {tr('show_in_taskbar_b740a624')}
            </button>
            <button
              role="menuitemcheckbox"
              aria-checked={desktop.some((t) => t.kind === shortcutKind(app.id))}
              disabled={save.isPending}
              onClick={() => {
                const show = !desktop.some((t) => t.kind === shortcutKind(app.id))
                save.mutate((p) => ({ ...p, desktopLayouts: toggleShortcut(p.desktopLayouts, app.id, show) }))
                setContext(null)
              }}
            >
              <span>
                {desktop.some((t) => t.kind === shortcutKind(app.id)) && <Icon path={mdiCheck} size={17} />}
              </span>
              {tr('show_on_desktop_3934aab8')}
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}
