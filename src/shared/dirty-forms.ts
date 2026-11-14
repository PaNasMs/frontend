import { createContext, useContext, useEffect, useId, useRef } from 'react'

export const DirtyFormsContext = createContext<
  (id: string, dirty: boolean, discard?: () => void, pending?: boolean) => void
>(() => {})

export function useUnsavedForm(dirty: boolean, onDiscard?: () => void, pending = false) {
  const id = useId()
  const discard = useRef(onDiscard)
  discard.current = onDiscard
  const report = useContext(DirtyFormsContext)
  useEffect(() => {
    report(id, dirty || pending, () => discard.current?.(), pending)
    return () => report(id, false)
  }, [id, dirty, pending, report])
}
