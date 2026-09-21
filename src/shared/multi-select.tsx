import { useEffect, useRef, useState } from 'react'
import { mdiChevronDown, mdiMagnify } from '@mdi/js'
import { Icon } from './ui'
import { tr } from '../i18n'

export function MultiSelect({
  label,
  values,
  options,
  onChange,
}: {
  label: string
  values: string[]
  options: { id: string; label: string; description?: string; disabled?: boolean }[]
  onChange: (values: string[]) => void
}) {
  const root = useRef<HTMLDetailsElement>(null)
  const [search, setSearch] = useState('')
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) root.current.open = false
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && root.current?.open) {
        event.preventDefault()
        event.stopPropagation()
        root.current.open = false
        root.current.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    const element = root.current
    element?.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      element?.removeEventListener('keydown', escape)
    }
  }, [])
  const selected = values.map((id) => options.find((o) => o.id === id)?.label ?? id)
  const visible = options.filter((o) =>
    `${o.label} ${o.description ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  )
  return (
    <div className="multi-select-field">
      <span className="field-label">{label}</span>
      <details ref={root} className="multi-select">
        <summary aria-label={label}>
          <span className="multi-select-value">
            {selected.length
              ? selected.slice(0, 3).map((name) => (
                  <span className="selection-chip" key={name}>
                    {name}
                  </span>
                ))
              : tr('ui.chooseValues')}
            {selected.length > 3 && <span className="selection-chip">+{selected.length - 3}</span>}
          </span>
          <span className="multi-select-count">{values.length}</span>
          <Icon path={mdiChevronDown} size={18} />
        </summary>
        <div className="multi-select-popover">
          <label className="multi-select-search">
            <Icon path={mdiMagnify} size={18} />
            <input
              aria-label={tr('ui.searchOptions')}
              placeholder={tr('ui.searchOptions')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="multi-select-options" role="group" aria-label={label}>
            {visible.map((option) => (
              <label className="multi-select-option" key={option.id}>
                <input
                  type="checkbox"
                  checked={values.includes(option.id)}
                  disabled={option.disabled}
                  onChange={(e) =>
                    onChange(
                      e.target.checked ? [...values, option.id] : values.filter((id) => id !== option.id),
                    )
                  }
                />
                <span>
                  {option.label}
                  {option.description && <small>{option.description}</small>}
                </span>
              </label>
            ))}
            {!visible.length && <p className="muted">{tr('ui.noMatches')}</p>}
          </div>
        </div>
      </details>
      {selected.length > 0 && <p className="multi-select-summary">{selected.join(', ')}</p>}
    </div>
  )
}
