import {
  createContext,
  useContext,
  useId,
  useCallback,
  Children,
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
import { mdiClose } from '@mdi/js'

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

export function CloseIcon({
  className = '',
  ...props
}: ComponentPropsWithoutRef<'button'> & { ref?: import('react').Ref<HTMLButtonElement> }) {
  const label = props['aria-label'] ?? tr('close_4ae50d30')
  return (
    <button
      {...props}
      type="button"
      className={'close-icon ' + className}
      aria-label={label}
      data-tooltip={label}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d={mdiClose} />
      </svg>
    </button>
  )
}

const ParentDialog = createContext<((active: boolean) => void) | null>(null)
export type DialogContentProps = ComponentPropsWithoutRef<typeof Dialog.Content> &
  Waiting & {
    header?: ReactNode
    footer?: ReactNode
    variant?: 'compact' | 'form' | 'details'
    intent?: 'edit' | 'inspect' | 'confirm'
    dirty?: boolean
  }

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(function DialogContent(
  {
    busy,
    message,
    hint,
    children,
    header: explicitHeader,
    footer: explicitFooter,
    variant = 'form',
    intent = 'edit',
    dirty: suppliedDirty,
    onEscapeKeyDown,
    onPointerDownOutside,
    onInteractOutside,
    onOpenAutoFocus,
    onCloseAutoFocus,
    onChangeCapture,
    onClickCapture,
    ...props
  },
  ref,
) {
  const opener = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  )
  const discardID = useId()
  const localRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const pointerStartedInside = useRef(false)
  const bypass = useRef(false)
  const [changed, setChanged] = useState(false)
  const [discard, setDiscard] = useState(false)
  const [nested, setNested] = useState(false)
  const parent = useContext(ParentDialog)
  const dirty = suppliedDirty ?? changed
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      localRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )
  useLayoutEffect(() => {
    parent?.(true)
    return () => parent?.(false)
  }, [parent])
  useEffect(() => {
    const track = (event: PointerEvent) => {
      pointerStartedInside.current = !!localRef.current?.contains(event.target as Node)
    }
    document.addEventListener('pointerdown', track, true)
    return () => document.removeEventListener('pointerdown', track, true)
  }, [])
  useLayoutEffect(() => {
    if (discard) cancelRef.current?.focus()
    else if (previousFocus.current?.isConnected) {
      previousFocus.current.focus({ preventScroll: true })
      previousFocus.current = null
    }
  }, [discard])
  const requestDiscard = () => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setDiscard(true)
  }
  // Legacy modules keep working while their releases migrate to explicit header/footer slots.
  const flatten = (nodes: ReactNode): ReactNode[] =>
    Children.toArray(nodes).flatMap((node) =>
      isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment
        ? flatten(node.props.children)
        : [node],
    )
  const nodes = flatten(children)
  const header: ReactNode[] = []
  const body: ReactNode[] = []
  let footer: ReactNode = explicitFooter
  for (const [index, node] of nodes.entries()) {
    const element = isValidElement<{ className?: string }>(node) ? node : null
    const classes = element?.props.className?.split(' ') ?? []
    if (
      explicitHeader === undefined &&
      element &&
      (element.type === Dialog.Title ||
        element.type === Dialog.Description ||
        classes.some((name) => ['dialog-heading', 'share-wizard-heading'].includes(name)))
    )
      header.push(node)
    else if (
      explicitFooter === undefined &&
      index === nodes.length - 1 &&
      element &&
      (classes.includes('actions') || classes.includes('dialog-actions') || element.type === Dialog.Close)
    )
      footer = node
    else body.push(node)
  }
  const ignoreOutside = () => busy || dirty || intent === 'confirm' || discard || pointerStartedInside.current
  return (
    <ParentDialog.Provider value={setNested}>
      <Dialog.Content
        {...props}
        ref={setRef}
        {...(intent === 'inspect' ? { 'aria-describedby': undefined } : {})}
        {...(discard ? { 'aria-labelledby': discardID, 'aria-describedby': undefined } : {})}
        className={(props.className ?? '') + ' structured-dialog'}
        data-variant={variant}
        data-intent={intent}
        data-suspended={nested || undefined}
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event)
          if (event.defaultPrevented) return
          event.preventDefault()
          const root = localRef.current
          const focus =
            intent === 'confirm'
              ? root?.querySelector<HTMLElement>(
                  '[data-dialog-cancel]:not(.close-icon):not(:disabled), [data-cancel]:not(:disabled)',
                )
              : intent === 'edit'
                ? root?.querySelector<HTMLElement>(
                    'input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled)',
                  )
                : null
          const title = root?.querySelector<HTMLElement>('.modal-header h2')
          title?.setAttribute('tabindex', '-1')
          ;(focus ?? title ?? closeRef.current)?.focus({ preventScroll: true })
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event)
          if (event.defaultPrevented) return
          const target = opener.current
          if (
            target?.isConnected &&
            target !== document.body &&
            target.getClientRects().length &&
            !target.closest('[inert]')
          ) {
            event.preventDefault()
            target.focus({ preventScroll: true })
          }
        }}
        onChangeCapture={(event) => {
          onChangeCapture?.(event)
          const target = event.target
          if ((target as HTMLElement).closest('[role=dialog]') !== localRef.current) return
          if (
            (target instanceof HTMLInputElement ||
              target instanceof HTMLTextAreaElement ||
              target instanceof HTMLSelectElement) &&
            !['search', 'password'].includes((target as HTMLInputElement).type) &&
            !target.closest('[data-dialog-transient]')
          )
            setChanged(true)
        }}
        onClickCapture={(event) => {
          onClickCapture?.(event)
          if (bypass.current || (event.target as HTMLElement).closest('[role=dialog]') !== localRef.current)
            return
          const target = (event.target as HTMLElement).closest('[data-dialog-cancel]')
          if (target && (busy || (dirty && !discard))) {
            event.preventDefault()
            event.stopPropagation()
            if (!busy) requestDiscard()
          }
        }}
        onEscapeKeyDown={(event) => {
          onEscapeKeyDown?.(event)
          if (busy) event.preventDefault()
          else if (discard) {
            event.preventDefault()
            setDiscard(false)
          } else if (dirty && !event.defaultPrevented) {
            event.preventDefault()
            requestDiscard()
          }
        }}
        onPointerDownOutside={(event) => {
          onPointerDownOutside?.(event)
          if (ignoreOutside()) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          onInteractOutside?.(event)
          if (ignoreOutside()) event.preventDefault()
        }}
      >
        <div className="modal-original" hidden={discard}>
          <header className="modal-header">
            <div className="modal-heading-content">{explicitHeader ?? header}</div>
            <Dialog.Close asChild>
              <CloseIcon ref={closeRef} disabled={busy} data-dialog-cancel />
            </Dialog.Close>
          </header>
          {body.length > 0 && <div className="modal-body">{body}</div>}
          {footer && <footer className="modal-footer">{footer}</footer>}
        </div>
        {discard && (
          <div className="modal-discard">
            <header className="modal-header">
              <h2 id={discardID}>{tr('ui.discardTitle')}</h2>
              <CloseIcon onClick={() => setDiscard(false)} />
            </header>
            <div className="modal-body">
              <p>{tr('ui.discardHelp')}</p>
            </div>
            <footer className="modal-footer">
              <div className="dialog-actions">
                <button ref={cancelRef} type="button" className="button" onClick={() => setDiscard(false)}>
                  {tr('ui.keepEditing')}
                </button>
                <button
                  type="button"
                  className="button danger"
                  onClick={() => {
                    bypass.current = true
                    closeRef.current?.click()
                    bypass.current = false
                  }}
                >
                  {tr('ui.discard')}
                </button>
              </div>
            </footer>
          </div>
        )}
        {busy && <WaitingOverlay message={message} hint={hint} />}
      </Dialog.Content>
    </ParentDialog.Provider>
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
