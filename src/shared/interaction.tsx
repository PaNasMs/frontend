import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { tr } from '../i18n'
import { DialogContent } from './waiting'
import { DirtyFormsContext, useUnsavedForm } from './dirty-forms'
export { useUnsavedForm } from './dirty-forms'

export function ConfirmDialog({
  open,
  title,
  children,
  accept,
  danger = false,
  busy = false,
  disabled = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children?: ReactNode
  accept: string
  danger?: boolean
  busy?: boolean
  disabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onCancel()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <DialogContent
          className="dialog compact-confirm"
          busy={busy}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            cancelRef.current?.focus()
          }}
          header={<Dialog.Title>{title}</Dialog.Title>}
          footer={
            <div className="dialog-actions">
              <button
                type="button"
                className="button"
                ref={cancelRef}
                data-cancel
                onClick={onCancel}
                disabled={busy}
                autoFocus
                data-dialog-cancel
              >
                {tr('cancel_0ec753be')}
              </button>
              <button
                type="button"
                className={`button ${danger ? 'danger' : 'primary'}`}
                disabled={busy || disabled}
                onClick={onConfirm}
              >
                {accept}
              </button>
            </div>
          }
          variant="compact"
          intent="confirm"
          dirty={false}
        >
          <Dialog.Description asChild>
            <div className="muted">{children}</div>
          </Dialog.Description>
        </DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function UnsavedChanges({
  dirty,
  live,
  pending = false,
  onDiscard,
}: {
  dirty: boolean
  pending?: boolean
  /** Synchronously maintained set of dirty forms: a form that was just reset must not block an unload. */
  live?: { current: Set<string> }
  onDiscard?: () => void | boolean
}) {
  const contentSearch = (search: string) => {
    const params = new URLSearchParams(search)
    params.delete('panel')
    return params.toString()
  }
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      (currentLocation.pathname !== nextLocation.pathname ||
        contentSearch(currentLocation.search) !== contentSearch(nextLocation.search)),
  )
  const transitionHandled = useRef(false)
  useEffect(() => {
    if (blocker.state === 'unblocked') transitionHandled.current = false
    else if (
      blocker.state === 'blocked' &&
      !dirty &&
      !pending &&
      (!live || live.current.size === 0) &&
      !transitionHandled.current
    ) {
      transitionHandled.current = true
      blocker.proceed()
    }
  }, [blocker, dirty, pending, live])
  useBeforeUnload((event) => {
    if (dirty && (!live || live.current.size > 0)) {
      event.preventDefault()
      event.returnValue = ''
    }
  })
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title={tr(pending ? 'operation_in_progress_10a75370' : 'ui.discardTitle')}
      accept={tr('ui.discard')}
      disabled={pending}
      onCancel={() => {
        if (blocker.state === 'blocked' && !transitionHandled.current) {
          transitionHandled.current = true
          blocker.reset()
        }
      }}
      onConfirm={() => {
        if (blocker.state === 'blocked' && !pending && !transitionHandled.current) {
          transitionHandled.current = true
          if (onDiscard?.() === false) {
            transitionHandled.current = false
            return
          }
          blocker.proceed()
        }
      }}
    >
      {tr(pending ? 'ui.waitBeforeLeaving' : 'ui.discardHelp')}
    </ConfirmDialog>
  )
}

export function DirtyFormsProvider({ children }: { children: ReactNode }) {
  const discards = useRef(new Map<string, () => void>())
  // The state below drives rendering; the ref mirrors it synchronously so that a form reset
  // immediately before a reload (such as applying the interface language) no longer blocks it.
  const live = useRef(new Set<string>())
  const waiting = useRef(new Set<string>())
  const [waitingCount, setWaitingCount] = useState(0)
  const [forms, setForms] = useState<Set<string>>(() => new Set())
  const report = useCallback((id: string, dirty: boolean, discard?: () => void, pending = false) => {
    if (pending) waiting.current.add(id)
    else waiting.current.delete(id)
    setWaitingCount(waiting.current.size)
    if (dirty && discard) discards.current.set(id, discard)
    else discards.current.delete(id)
    if (dirty) live.current.add(id)
    else live.current.delete(id)
    setForms((previous) => {
      if (previous.has(id) === dirty) return previous
      const next = new Set(previous)
      if (dirty) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  return (
    <DirtyFormsContext.Provider value={report}>
      <UnsavedChanges
        dirty={forms.size > 0}
        live={live}
        pending={waitingCount > 0}
        onDiscard={() => {
          if (waiting.current.size) return false
          for (const discard of [...discards.current.values()]) discard()
          discards.current.clear()
          live.current.clear()
          setForms(new Set())
        }}
      />
      {children}
    </DirtyFormsContext.Provider>
  )
}
export function useDraft<T>(incoming: T, target = '') {
  const [draft, setDraft] = useState<T>(incoming)
  const [baseline, setBaseline] = useState(JSON.stringify(incoming))
  const owner = useRef(target)
  const serialized = JSON.stringify(incoming)
  const dirty = JSON.stringify(draft) !== baseline
  useEffect(() => {
    if (owner.current !== target || !dirty || JSON.stringify(draft) === serialized) {
      owner.current = target
      setBaseline(serialized)
      setDraft(incoming)
    }
  }, [serialized, target, dirty])
  const reset = (value = incoming) => {
    setBaseline(JSON.stringify(value))
    setDraft(value)
  }
  useUnsavedForm(dirty, () => reset())
  return {
    draft,
    original: JSON.parse(baseline) as T,
    setDraft,
    dirty,
    conflict: dirty && baseline !== serialized,
    reset,
  }
}

export function useExclusivePopover(ref: { current: HTMLDetailsElement | null }) {
  useEffect(() => {
    const toggle = (event: Event) => {
      const element = ref.current
      if (event.target === element && element?.open)
        window.dispatchEvent(new CustomEvent('panasms:popover', { detail: element }))
    }
    const close = (event: Event) => {
      if (ref.current && (event as CustomEvent).detail !== ref.current) ref.current.open = false
    }
    document.addEventListener('toggle', toggle, true)
    window.addEventListener('panasms:popover', close)
    return () => {
      document.removeEventListener('toggle', toggle, true)
      window.removeEventListener('panasms:popover', close)
    }
  }, [ref])
}
