import { Fragment, useState, type ReactNode } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import * as Dialog from '@radix-ui/react-dialog'
import { NavLink, useNavigate } from 'react-router-dom'
import { mdiCheck, mdiChevronDown } from '@mdi/js'
import { tr } from '../i18n'
import { DialogContent } from './waiting'

export type SectionItem = {
  id: string
  title: string
  icon?: string
  /** Second line for an object: its state in words. */
  note?: string
  /** State dot for an object; always paired with `note`. */
  tone?: 'ok' | 'warn' | 'danger' | 'busy' | 'idle'
  count?: number | string
  /** Heading shown above the first item of each group. */
  group?: string
  /** Route for link navigation. Without it the item is a tab of the surrounding Tabs.Root. */
  to?: string
}

function Glyph({ path, size = 20 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d={path} />
    </svg>
  )
}

function Label({ item }: { item: SectionItem }) {
  return (
    <>
      {item.tone ? (
        <span className={`section-dot ${item.tone}`} aria-hidden="true" />
      ) : (
        item.icon && <Glyph path={item.icon} />
      )}
      <span className="section-label">
        {item.title}
        {item.note && <span className="section-note">{item.note}</span>}
      </span>
      {item.count !== undefined && item.count !== '' && <span className="section-count">{item.count}</span>}
    </>
  )
}

/**
 * The one navigation between the parts of a section: a rail from 1024px and a
 * switcher that opens a sheet below it. Tab items need a surrounding Tabs.Root;
 * items with `to` are route links, and `tabs={false}` makes plain buttons.
 */
export function SectionNav({
  label,
  items,
  value,
  onChange,
  objects = false,
  tabs = true,
  footer,
}: {
  label: string
  items: SectionItem[]
  value: string
  onChange?: (id: string) => void
  objects?: boolean
  /** False when the items are plain choices outside a Tabs.Root. */
  tabs?: boolean
  footer?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const links = items.some((item) => item.to)
  const current = items.find((item) => item.id === value) ?? items[0]
  const position = current ? items.indexOf(current) + 1 : 0
  const choose = (item: SectionItem) => {
    setOpen(false)
    if (item.to) void navigate(item.to)
    else onChange?.(item.id)
  }
  const groups = (render: (item: SectionItem) => ReactNode) =>
    items.map((item, index) => (
      <Fragment key={item.id}>
        {item.group && item.group !== items[index - 1]?.group && (
          <div className="section-group">{item.group}</div>
        )}
        {render(item)}
      </Fragment>
    ))
  const className = `section-nav${objects ? ' objects' : ''}`
  return (
    <>
      {links ? (
        <nav className={className} aria-label={label}>
          {groups((item) => (
            <NavLink to={item.to!} end aria-current={item.id === value ? 'page' : undefined}>
              <Label item={item} />
            </NavLink>
          ))}
          {footer}
        </nav>
      ) : tabs ? (
        <Tabs.List className={className} aria-label={label}>
          {groups((item) => (
            <Tabs.Trigger value={item.id}>
              <Label item={item} />
            </Tabs.Trigger>
          ))}
          {footer}
        </Tabs.List>
      ) : (
        <nav className={className} aria-label={label}>
          {groups((item) => (
            <button
              type="button"
              aria-current={item.id === value ? 'page' : undefined}
              onClick={() => onChange?.(item.id)}
            >
              <Label item={item} />
            </button>
          ))}
          {footer}
        </nav>
      )}
      {current && (
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              className={`section-switcher${objects ? ' objects' : ''}`}
              aria-label={`${label}: ${current.title}`}
            >
              <Label item={{ ...current, count: undefined }} />
              {items.length > 1 && (
                <span className="section-position">
                  {tr('ui.position', { index: position, count: items.length })}
                </span>
              )}
              <span className="section-chevron">
                <Glyph path={mdiChevronDown} />
              </span>
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <DialogContent
              className="dialog section-sheet"
              variant="compact"
              intent="inspect"
              dirty={false}
              header={<Dialog.Title>{label}</Dialog.Title>}
            >
              <div className={className}>
                {groups((item) => (
                  <button
                    type="button"
                    aria-current={item.id === current.id ? 'page' : undefined}
                    onClick={() => choose(item)}
                  >
                    <Label item={item} />
                    {item.id === current.id && <Glyph path={mdiCheck} />}
                  </button>
                ))}
                {footer}
              </div>
            </DialogContent>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </>
  )
}
