import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { tr } from '../i18n'

type Waiting = { busy?: boolean; message?: string; hint?: string }

export function WaitingOverlay({ message = tr('waiting.message'), hint }: Omit<Waiting, 'busy'>) {
  const ref = useRef<HTMLDivElement>(null)
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])
  useLayoutEffect(() => {
    const overlay = ref.current!
    const parent = overlay.parentElement!
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = parent.style.overflow
    const position = parent.style.position
    const previousBusy = parent.getAttribute('aria-busy')
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative'
    parent.setAttribute('aria-busy', 'true')
    parent.style.overflow = 'hidden'
    const siblings = new Map<HTMLElement, boolean>()
    const sync = () => {
      for (const child of parent.children) {
        if (child !== overlay && child instanceof HTMLElement && !siblings.has(child)) {
          siblings.set(child, child.inert)
          child.inert = true
        }
      }
      overlay.style.top = parent.scrollTop + 'px'
      overlay.style.height = parent.clientHeight + 'px'
      const bounds = parent.getBoundingClientRect()
      const center = (Math.max(0, bounds.top) + Math.min(window.innerHeight, bounds.bottom)) / 2 - bounds.top
      overlay.style.setProperty('--waiting-center', Math.max(0, center) + 'px')
    }
    sync()
    const resize = new ResizeObserver(sync)
    resize.observe(parent)
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    const children = new MutationObserver(sync)
    children.observe(parent, { childList: true })
    overlay.focus({ preventScroll: true })
    return () => {
      resize.disconnect()
      window.removeEventListener('scroll', sync, true)
      window.removeEventListener('resize', sync)
      children.disconnect()
      for (const [child, inert] of siblings) child.inert = inert
      parent.style.overflow = overflow
      parent.style.position = position
      if (previousBusy === null) parent.removeAttribute('aria-busy')
      else parent.setAttribute('aria-busy', previousBusy)
      if (previousFocus?.isConnected && parent.contains(previousFocus) && !previousFocus.closest('[inert]'))
        previousFocus.focus({ preventScroll: true })
      else if (parent.matches('[role="dialog"]')) parent.focus({ preventScroll: true })
    }
  }, [])
  return (
    <div
      ref={ref}
      className="waiting-overlay"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      <div className="waiting-indicator">
        <div className="waiting-message" role="status" aria-live="polite">
          <span className="waiting-spinner" aria-hidden="true" />
          <strong>{message}</strong>
          {hint && <p>{hint}</p>}
        </div>
        <span className="waiting-elapsed" aria-live="off">
          {tr('waiting.elapsed', { seconds })}
        </span>
      </div>
    </div>
  )
}

export const DialogContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Dialog.Content> & Waiting
>(function DialogContent(
  { busy, message, hint, children, onEscapeKeyDown, onPointerDownOutside, onInteractOutside, ...props },
  ref,
) {
  const flatten = (nodes: ReactNode, prefix = ''): ReactNode[] =>
    Children.toArray(nodes).flatMap((node, index) =>
      isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment
        ? flatten(node.props.children, `${prefix}${index}:`)
        : [isValidElement(node) ? cloneElement(node, { key: `${prefix}${node.key ?? index}` }) : node],
    )
  const nodes = flatten(children)
  const header: ReactNode[] = []
  const body: ReactNode[] = []
  let footer: ReactNode = null
  nodes.forEach((node, index) => {
    const element = isValidElement<{ className?: string }>(node) ? node : null
    const classes = element?.props.className?.split(' ') ?? []
    if (
      element &&
      (element.type === Dialog.Title ||
        element.type === Dialog.Description ||
        classes.some((name) => ['dialog-heading', 'share-wizard-heading'].includes(name)))
    )
      header.push(node)
    else if (
      index === nodes.length - 1 &&
      element &&
      (classes.includes('actions') || classes.includes('dialog-actions') || element.type === Dialog.Close)
    )
      footer = node
    else body.push(node)
  })
  return (
    <Dialog.Content
      {...props}
      ref={ref}
      className={(props.className ?? '') + ' structured-dialog'}
      onEscapeKeyDown={(event) => {
        if (busy) event.preventDefault()
        onEscapeKeyDown?.(event)
      }}
      onPointerDownOutside={(event) => {
        if (busy) event.preventDefault()
        onPointerDownOutside?.(event)
      }}
      onInteractOutside={(event) => {
        if (busy) event.preventDefault()
        onInteractOutside?.(event)
      }}
    >
      {header.length > 0 && <header className="modal-header">{header}</header>}
      <div className="modal-body">{body}</div>
      {footer && <footer className="modal-footer">{footer}</footer>}
      {busy && <WaitingOverlay message={message} hint={hint} />}
    </Dialog.Content>
  )
})

export function WaitingSurface({
  busy,
  message,
  hint,
  children,
  className = '',
}: Waiting & { children: ReactNode; className?: string }) {
  return (
    <div className={'waiting-surface ' + className}>
      {children}
      {busy && <WaitingOverlay message={message} hint={hint} />}
    </div>
  )
}
