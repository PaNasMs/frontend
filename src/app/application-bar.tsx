import { tr } from '../i18n/index'
import { modules } from './module-registry'
import { OngoingTasks } from './ongoing-tasks'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  mdiViewDashboardOutline,
  mdiMonitorDashboard,
  mdiCheck,
  mdiDotsVertical,
  mdiDotsHorizontal,
} from '@mdi/js'
import { request, type Preferences } from '../api/client'
import { Icon } from '../shared/ui'
import { apps, shortcutKind, defaults, columns, screen, toggleShortcut, reorder } from './desktop-layout'
import { usePreferencesSave } from './preferences-save'
export function ApplicationBar({ phone = false }: { phone?: boolean }) {
  const prefs = useQuery({ queryKey: ['preferences'], queryFn: () => request<Preferences>('preferences') })
  const save = usePreferencesSave()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)
  const pins = useRef<HTMLElement>(null)
  const overflowTrigger = useRef<HTMLButtonElement>(null)
  const overflowPanel = useRef<HTMLElement>(null)
  const resizeFocus = useRef<string | null>(null)
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
  // The phone keeps its own, shorter set of pinned sections.
  const key = phone ? 'taskbarMobile' : 'taskbar'
  const limit = phone ? 3 : 8
  const everything = applications.filter((a) => a.id !== 'history').map((a) => a.id)
  const ids = (prefs.data?.[key] ?? (phone ? everything.slice(0, limit) : everything)).filter((id) =>
    applications.some((a) => a.id === id),
  )
  const current = applications.find(
    (a) => location.pathname === a.path || location.pathname.startsWith(a.path + '/'),
  )
  const mode = screen()
  const desktop = prefs.data?.desktopLayouts?.[mode] ?? defaults(columns(mode))
  const app = applications.find((a) => a.id === context?.id)
  useEffect(() => {
    setOpen(false)
    setOverflowOpen(false)
    setContext(null)
  }, [location.pathname, location.search])
  useEffect(() => {
    function close(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node) && !popup.current?.contains(e.target as Node)) {
        setOpen(false)
        setOverflowOpen(false)
        setContext(null)
      }
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape' && (root.current?.querySelector('[aria-expanded="true"]') || popup.current)) {
        setContext(null)
        setOpen(false)
        const returnTo = overflowPanel.current ? overflowTrigger.current : trigger.current
        setOverflowOpen(false)
        returnTo?.focus()
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
  useEffect(() => {
    const close = (event: Event) => {
      if ((event as CustomEvent).detail !== root.current) {
        setOpen(false)
        setOverflowOpen(false)
        setContext(null)
      }
    }
    window.addEventListener('panasms:popover', close)
    return () => window.removeEventListener('panasms:popover', close)
  }, [])
  useEffect(() => {
    if (open || overflowOpen)
      window.dispatchEvent(new CustomEvent('panasms:popover', { detail: root.current }))
  }, [open, overflowOpen])
  useEffect(() => {
    if (overflowOpen) overflowPanel.current?.querySelector<HTMLAnchorElement>('a')?.focus()
  }, [overflowOpen])
  useLayoutEffect(() => {
    if (!open && !overflowOpen) return
    const menu = overflowOpen
      ? overflowPanel.current
      : root.current?.querySelector<HTMLElement>('.app-launcher-menu:not(.pinned-overflow-menu)')
    const container = root.current?.closest<HTMLElement>('.topbar, .phone-header, .phone-taskbar')
    if (!menu || !container || !root.current) return
    const measure = () => menu.style.setProperty('--app-menu-top', `${menu.getBoundingClientRect().top}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    observer.observe(root.current)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [open, overflowOpen, phone])
  useLayoutEffect(() => {
    const nav = pins.current
    const button = trigger.current
    if (!nav || !button) return
    function measure() {
      const gap = parseFloat(getComputedStyle(nav!).columnGap) || 0
      const slots = Math.max(
        1,
        Math.floor(
          (nav!.getBoundingClientRect().width + gap) / (button!.getBoundingClientRect().width + gap),
        ),
      )
      const next = slots >= ids.length ? ids.length : slots - 1
      if (pointer.current && !ids.slice(0, next).includes(pointer.current.id)) cancelPointer()
      const focused = document.activeElement as HTMLElement | null
      const focusedId = focused?.closest<HTMLElement>('[data-app-id]')?.dataset.appId
      if (focusedId && nav!.contains(focused) && ids.indexOf(focusedId) >= next)
        resizeFocus.current = 'overflow'
      if (overflowPanel.current?.contains(focused) && focusedId && ids.indexOf(focusedId) < next) {
        resizeFocus.current = focusedId
        setOverflowOpen(false)
      }
      if (next === ids.length && focused === overflowTrigger.current) resizeFocus.current = 'launcher'
      setVisibleCount(next)
      if (next === ids.length) setOverflowOpen(false)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(nav)
    observer.observe(button)
    return () => observer.disconnect()
  }, [ids.join('|'), phone])
  useLayoutEffect(() => {
    const target = resizeFocus.current
    if (!target) return
    resizeFocus.current = null
    if (target === 'overflow') overflowTrigger.current?.focus()
    else {
      const link = Array.from(pins.current?.querySelectorAll<HTMLAnchorElement>('[data-app-id]') ?? []).find(
        (item) => item.dataset.appId === target,
      )
      ;(link ?? trigger.current)?.focus()
    }
  }, [visibleCount, overflowOpen])
  function arrange(source: string, target: string) {
    if (source === target) return
    save.mutate((p) => ({ ...p, [key]: reorder(p[key] ?? ids, source, target) }))
    setDragged('')
    setOver('')
  }
  function cancelPointer() {
    pointer.current = null
    setDragged('')
    setOver('')
    suppressClick.current = false
  }
  function showContext(id: string, x: number, y: number) {
    setContext({
      id,
      x: Math.max(8, Math.min(x, innerWidth - 270)),
      y: Math.max(8, Math.min(y, innerHeight - 145)),
    })
  }
  function renderPin(id: string, inOverflow = false) {
    const a = applications.find((a) => a.id === id)!
    return (
      <NavLink
        key={id}
        to={a.path!}
        title={a.title}
        aria-label={a.title}
        className={over === id ? (ids.indexOf(dragged) < ids.indexOf(id) ? 'drop-after' : 'drop-before') : ''}
        data-app-id={id}
        draggable={false}
        onPointerDown={(e) => {
          if (inOverflow || e.button !== 0 || save.isPending) return
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
          cancelPointer()
        }}
        onLostPointerCapture={() => {
          if (pointer.current) cancelPointer()
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
            const focusedPin = e.currentTarget
            save.mutate(
              (p) => {
                const order = [...(p[key] ?? ids)]
                ;[order[at], order[next]] = [order[next], order[at]]
                return { ...p, [key]: order }
              },
              {
                onSuccess: () =>
                  requestAnimationFrame(() => {
                    const active = document.activeElement
                    if (active && active !== document.body && active !== focusedPin) return
                    const link = Array.from(
                      root.current?.querySelectorAll<HTMLAnchorElement>('[data-app-id]') ?? [],
                    ).find((item) => item.dataset.appId === id)
                    ;(link ?? overflowTrigger.current ?? trigger.current)?.focus()
                  }),
              },
            )
          }
        }}
      >
        <Icon path={a.icon} />
        {inOverflow && <span>{a.title}</span>}
      </NavLink>
    )
  }
  return (
    <div className="application-bar" ref={root}>
      <button
        ref={trigger}
        className="app-launcher"
        aria-current={current && !ids.includes(current.id) ? 'page' : undefined}
        title={tr('applications_946ee087')}
        aria-label={tr('applications_946ee087')}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          setOverflowOpen(false)
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
      <nav ref={pins} className="pinned-applications" aria-label={tr('pinned_applications_ea84a502')}>
        {ids.slice(0, visibleCount).map((id) => renderPin(id))}
        {visibleCount < ids.length && (
          <button
            ref={overflowTrigger}
            className="pinned-overflow-trigger"
            title={tr('ui.morePinnedApplications')}
            aria-label={tr('ui.morePinnedApplications')}
            aria-current={current && ids.slice(visibleCount).includes(current.id) ? 'page' : undefined}
            aria-expanded={overflowOpen}
            aria-controls={phone ? 'phone-pinned-overflow' : 'desktop-pinned-overflow'}
            onClick={() => {
              setOverflowOpen(!overflowOpen)
              setOpen(false)
              setContext(null)
            }}
          >
            <Icon path={mdiDotsHorizontal} />
          </button>
        )}
      </nav>
      {!phone && (
        <>
          <span className="application-separator" aria-hidden="true" />
          <OngoingTasks />
          {modules()
            .filter((module) => module.backgroundIndicator)
            .map((module) => {
              const Indicator = module.backgroundIndicator!
              return <Indicator key={module.id} />
            })}
        </>
      )}
      {overflowOpen && visibleCount < ids.length && (
        <section
          ref={overflowPanel}
          id={phone ? 'phone-pinned-overflow' : 'desktop-pinned-overflow'}
          className="app-launcher-menu pinned-overflow-menu"
          aria-label={tr('ui.morePinnedApplications')}
        >
          <h2>{tr('ui.morePinnedApplications')}</h2>
          {ids.slice(visibleCount).map((id) => renderPin(id, true))}
        </section>
      )}
      {open && (
        <section className="app-launcher-menu" aria-label={tr('nas_applications_5f56f294')}>
          <h2>{tr('applications_946ee087')}</h2>
          <div className="app-launcher-grid">
            {applications.map((a) => (
              <div key={a.id} className="launcher-entry">
                <Link
                  to={a.path!}
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
                  <Icon path={mdiDotsVertical} size={20} />
                </button>
              </div>
            ))}
          </div>
          <p>{tr(phone ? 'ui.pinHintPhone' : 'ui.pinHintComputer')}</p>
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
              disabled={save.isPending || (!ids.includes(app.id) && ids.length >= limit)}
              onClick={() => {
                save.mutate((p) => ({
                  ...p,
                  [key]: ids.includes(app.id)
                    ? (p[key] ?? ids).filter((id) => id !== app.id)
                    : [...(p[key] ?? ids), app.id],
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
