import { useId, type ReactNode } from 'react'
import { mdiChevronDown } from '@mdi/js'

/** A group of rarely used content on the same page; replaces tabs nested in a section. */
export function Disclosure({
  title,
  hint,
  open,
  onOpenChange,
  children,
}: {
  title: string
  hint?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const id = useId()
  return (
    <div className="disclosure-group" data-open={open || undefined}>
      <button
        type="button"
        className="disclosure"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onOpenChange(!open)}
      >
        <span className="disclosure-label">
          <strong>{title}</strong>
          {hint && <span className="muted">{hint}</span>}
        </span>
        <span className="disclosure-chevron">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d={mdiChevronDown} />
          </svg>
        </span>
      </button>
      <div id={id} className="disclosure-content" hidden={!open}>
        {open && children}
      </div>
    </div>
  )
}
