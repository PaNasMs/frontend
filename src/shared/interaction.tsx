import {
  useEffect,
  useRef,
  useState,
  useId,
  useContext,
  createContext,
  useCallback,
  type ReactNode,
} from 'react'
import { useBeforeUnload, useBlocker } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { tr } from '../i18n'
import { DialogContent } from './waiting'

export function ConfirmDialog({
  open,
  title,
  children,
  accept,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children?: ReactNode
  accept: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onCancel()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <DialogContent
          className="dialog compact-confirm"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            cancelRef.current?.focus()
          }}
        >
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="muted">{children}</div>
          </Dialog.Description>
          <div className="dialog-actions">
            <button type="button" className="button" ref={cancelRef} data-cancel onClick={onCancel} autoFocus>
              {tr('cancel_0ec753be')}
            </button>
            <button type="button" className="button primary" onClick={onConfirm}>
              {accept}
            </button>
          </div>
        </DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function UnsavedChanges({ dirty, onDiscard }: { dirty: boolean; onDiscard?: () => void }) {
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
  useBeforeUnload((event) => {
    if (dirty) {
      event.preventDefault()
      event.returnValue = ''
    }
  })
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title={tr('ui.discardTitle')}
      accept={tr('ui.discard')}
      onCancel={() => blocker.state === 'blocked' && blocker.reset()}
      onConfirm={() => {
        if (blocker.state === 'blocked') {
          onDiscard?.()
          blocker.proceed()
        }
      }}
    >
      {tr('ui.discardHelp')}
    </ConfirmDialog>
  )
}

const DirtyFormsContext = createContext<(id: string, dirty: boolean, discard?: () => void) => void>(() => {})
export function DirtyFormsProvider({ children }: { children: ReactNode }) {
  const discards = useRef(new Map<string, () => void>())
  const [forms, setForms] = useState<Set<string>>(() => new Set())
  const report = useCallback((id: string, dirty: boolean, discard?: () => void) => {
    if (dirty && discard) discards.current.set(id, discard)
    else discards.current.delete(id)
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
        onDiscard={() => {
          for (const discard of discards.current.values()) discard()
          discards.current.clear()
          setForms(new Set())
        }}
      />
      {children}
    </DirtyFormsContext.Provider>
  )
}
export function useUnsavedForm(dirty: boolean, onDiscard?: () => void) {
  const id = useId()
  const discard = useRef(onDiscard)
  discard.current = onDiscard
  const report = useContext(DirtyFormsContext)
  useEffect(() => {
    report(id, dirty, () => discard.current?.())
    return () => report(id, false)
  }, [id, dirty, report])
}

export function useDraft<T>(incoming: T, target = '') {
  const [draft, setDraft] = useState<T>(incoming)
  const baseline = useRef(JSON.stringify(incoming))
  const owner = useRef(target)
  const serialized = JSON.stringify(incoming)
  const dirty = JSON.stringify(draft) !== baseline.current
  useEffect(() => {
    if (owner.current !== target || !dirty || JSON.stringify(draft) === serialized) {
      owner.current = target
      baseline.current = serialized
      setDraft(incoming)
    }
  }, [serialized, target, dirty])
  const reset = (value = incoming) => {
    baseline.current = JSON.stringify(value)
    setDraft(value)
  }
  useUnsavedForm(dirty, () => reset())
  return { draft, setDraft, dirty, conflict: dirty && baseline.current !== serialized, reset }
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
