import { tr, locale } from '../i18n/index'
import { isValidElement, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...v: Parameters<typeof clsx>) {
  return twMerge(clsx(v))
}
export function Icon({ path, size = 22 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d={path} />
    </svg>
  )
}
export function Button({ className, title, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const iconOnly = isValidElement(props.children) && props.children.type === Icon
  return (
    <button
      className={cn('button', iconOnly && 'icon-only', className)}
      data-tooltip={title}
      {...props}
      aria-label={props['aria-label'] ?? (iconOnly ? title : undefined)}
    />
  )
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={cn('notice', error && 'error')} role={error ? 'alert' : 'status'}>
      {children}
    </div>
  )
}
export function bytes(n: number) {
  if (!Number.isFinite(n)) return tr('no_data_d0dd940c')
  const u = [tr('b_923f9729'), tr('kib_ed1bb165'), tr('mib_d28ac8ed'), tr('gib_7335ea74'), tr('tib_37531c17')]
  let i = 0
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toLocaleString(locale(), { maximumFractionDigits: 1 })} ${u[i]}`
}
export { DialogContent, CloseIcon, WaitingOverlay, WaitingSurface } from './waiting'

export { ConfirmDialog, UnsavedChanges, useDraft, useExclusivePopover } from './interaction'

export { FolderPicker } from './folder-picker'
