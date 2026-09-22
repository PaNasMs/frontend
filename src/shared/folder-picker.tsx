import type { components } from '../api/schema'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { mdiFolderOutline, mdiArrowUp, mdiChevronRight, mdiClose, mdiHarddisk } from '@mdi/js'
import { managed } from '../app/operations'
import { tr } from '../i18n'
import { serverText } from '../i18n/server'
import { Button, DialogContent, Icon, Notice } from './ui'

type FolderPolicy = 'share' | 'home' | 'mount'
type FolderRow = { name: string; path: string; reason?: string }
type Folders = components['schemas']['FolderLocations']

export function FolderPicker({
  onChoose,
  policy = 'share',
  newFolder = false,
  defaultName = '',
}: {
  onChoose: (path: string) => void
  policy?: FolderPolicy
  newFolder?: boolean
  defaultName?: string
}) {
  const [path, setPath] = useState('')
  const [name, setName] = useState(defaultName)
  const data = useQuery({
    queryKey: ['folder-picker', policy, path],
    queryFn: () => managed<Folders>(`${policy}-folders`, undefined, path),
  })
  const roots =
    data.data?.roots.map((root) => (typeof root === 'string' ? { name: root, path: root } : root)) ?? []
  const rows = path ? (data.data?.folders ?? []) : roots
  const root = roots
    .filter((r) => path === r.path || path.startsWith(r.path + '/'))
    .sort((a, b) => b.path.length - a.path.length)[0]
  const crumbs = root ? [root.path, ...path.slice(root.path.length).split('/').filter(Boolean)] : []
  const validName =
    !!name.trim() &&
    name === name.trim() &&
    !/[\/\x00-\x1f\x7f]/.test(name) &&
    !['.', '..', 'lost+found'].includes(name)
  const collision = newFolder && rows.some((row) => row.name === name)
  const destination = path ? path.replace(/\/$/, '') + (newFolder ? '/' + name : '') : ''
  return (
    <div className="folder-picker">
      <div className="folder-picker-heading">
        <Button
          type="button"
          title={tr('ui.up')}
          disabled={!path}
          onClick={() => setPath(root?.path === path ? '' : path.slice(0, path.lastIndexOf('/')))}
        >
          <Icon path={mdiArrowUp} />
        </Button>
        <nav className="folder-breadcrumbs" aria-label={tr('ui.folderLocation')}>
          <button type="button" onClick={() => setPath('')}>
            {tr('ui.volumes')}
          </button>
          {crumbs.map((crumb, index) => (
            <span key={index}>
              <Icon path={mdiChevronRight} size={14} />
              <button type="button" onClick={() => setPath(crumbs.slice(0, index + 1).join('/'))}>
                {crumb}
              </button>
            </span>
          ))}
        </nav>
      </div>
      {policy === 'home' && <p className="folder-policy-hint">{tr('ui.homeLocationPolicy')}</p>}
      {data.isPending && <Notice>{tr('loading_interface_f69ec4bd')}</Notice>}
      {data.error && <Notice error>{data.error.message}</Notice>}
      <ul className="folder-picker-list">
        {rows.map((row) => (
          <li key={row.path}>
            <button type="button" disabled={!!row.reason} onClick={() => setPath(row.path)}>
              <Icon path={path ? mdiFolderOutline : mdiHarddisk} />
              <span>
                <strong>{row.name}</strong>
                {row.reason && <small>{serverText(row.reason)}</small>}
              </span>
              {!row.reason && <Icon path={mdiChevronRight} size={18} />}
            </button>
          </li>
        ))}
        {!data.isPending && !data.error && !rows.length && (
          <li className="folder-empty">{tr('ui.noSubfolders')}</li>
        )}
      </ul>
      {newFolder && (
        <label className="field">
          {tr('folder_name_198ad630')}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!name && (!validName || collision)}
            maxLength={255}
          />
          {name && !validName && (
            <small className="error-text">
              {tr('enter_a_folder_name_without_slashes_and_are_not_al_83215286')}
            </small>
          )}
          {collision && <small className="error-text">{tr('ui.folderExists')}</small>}
        </label>
      )}
      <div className="folder-picker-footer">
        <span>{destination || tr('ui.chooseFolder')}</span>
        <Button
          type="button"
          className="primary"
          disabled={!path || data.isPending || !!data.error || (newFolder && (!validName || collision))}
          onClick={() => onChoose(destination)}
        >
          {tr('ui.selectFolder')}
        </Button>
      </div>
    </div>
  )
}

export function FolderField({
  label,
  value,
  onChange,
  policy = 'share',
  newFolder = false,
  defaultName,
  disabled = false,
  optional = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  policy?: FolderPolicy
  newFolder?: boolean
  defaultName?: string
  disabled?: boolean
  optional?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="folder-field">
      <span className="field-label">{label}</span>
      <div className="folder-field-control">
        <button
          type="button"
          className="folder-field-trigger"
          disabled={disabled}
          aria-label={label}
          onClick={() => setOpen(true)}
        >
          <Icon path={mdiFolderOutline} />
          <span>{value || tr(optional ? 'ui.defaultLocation' : 'ui.chooseFolder')}</span>
          <Icon path={mdiChevronRight} size={18} />
        </button>
        {optional && value && (
          <Button
            type="button"
            title={tr('ui.defaultLocation')}
            disabled={disabled}
            onClick={() => onChange('')}
          >
            <Icon path={mdiClose} />
          </Button>
        )}
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay folder-picker-overlay" />
          <DialogContent className="settings-dialog folder-picker-dialog">
            <div className="dialog-heading">
              <Dialog.Title>{label}</Dialog.Title>
              <Dialog.Close asChild>
                <Button type="button" title={tr('close_4ae50d30')}>
                  <Icon path={mdiClose} />
                </Button>
              </Dialog.Close>
            </div>
            <Dialog.Description>
              {tr(newFolder ? 'ui.newFolderDestination' : 'ui.chooseFolder')}
            </Dialog.Description>
            <FolderPicker
              policy={policy}
              newFolder={newFolder}
              defaultName={defaultName ?? value.split('/').filter(Boolean).at(-1) ?? ''}
              onChoose={(path) => {
                onChange(path)
                setOpen(false)
              }}
            />
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
