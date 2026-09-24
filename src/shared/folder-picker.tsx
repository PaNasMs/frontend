import type { components } from '../api/schema'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { mdiChevronDown, mdiFolderOutline, mdiArrowUp, mdiChevronRight, mdiClose, mdiHarddisk } from '@mdi/js'
import { managed } from '../app/operations'
import { tr } from '../i18n'
import { serverText } from '../i18n/server'
import { Button, DialogContent, Icon, Notice } from './ui'

type FolderPolicy = 'share' | 'home' | 'mount'
type FolderRow = { name: string; path: string; reason?: string }
type Folders = components['schemas']['FolderLocations']

function FolderBranch({
  node,
  selected,
  policy,
  choose,
  root = false,
}: {
  node: FolderRow
  selected: string
  policy: FolderPolicy
  choose: (path: string) => void
  root?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    if (selected === node.path || selected.startsWith(node.path + '/')) setExpanded(true)
  }, [selected, node.path])
  const data = useQuery({
    queryKey: ['folder-picker', policy, node.path],
    queryFn: () => managed<Folders>(`${policy}-folders`, undefined, node.path),
    enabled: expanded && !node.reason,
  })
  const title = root && node.name === 'Home' ? tr('picker.home') : node.name
  return (
    <li>
      <div className="folder-tree-row" data-selected={selected === node.path}>
        <Button
          type="button"
          aria-expanded={expanded}
          title={`${tr(expanded ? 'picker.collapse' : 'picker.expand')} · ${title}`}
          disabled={!!node.reason}
          onClick={() => setExpanded(!expanded)}
        >
          <Icon path={expanded ? mdiChevronDown : mdiChevronRight} size={16} />
        </Button>
        <button
          type="button"
          title={node.reason ? serverText(node.reason) : node.path}
          disabled={!!node.reason}
          onClick={() => {
            choose(node.path)
            setExpanded(true)
          }}
        >
          <Icon path={root ? mdiHarddisk : mdiFolderOutline} size={18} />
          <span>{title}</span>
        </button>
      </div>
      {expanded && (
        <ul>
          {data.isPending && <li>{tr('loading_interface_f69ec4bd')}</li>}
          {data.error && (
            <li>
              <Notice error>{data.error.message}</Notice>
            </li>
          )}
          {data.data?.folders.map((child) => (
            <FolderBranch key={child.path} node={child} selected={selected} policy={policy} choose={choose} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function FolderPicker({
  onChoose,
  policy = 'share',
  newFolder = false,
  defaultName = '',
  initialPath = '',
  hint,
}: {
  onChoose: (path: string) => void
  policy?: FolderPolicy
  newFolder?: boolean
  defaultName?: string
  initialPath?: string
  hint?: string
}) {
  const [path, setPath] = useState(initialPath)
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
      {policy === 'home' && <p className="folder-policy-hint">{hint ?? tr('ui.homeLocationPolicy')}</p>}
      {data.isPending && <Notice>{tr('loading_interface_f69ec4bd')}</Notice>}
      {data.error && <Notice error>{data.error.message}</Notice>}
      <div className="folder-picker-columns">
        <nav className="folder-picker-tree" aria-label={tr('picker.locations')}>
          <strong>{tr('picker.locations')}</strong>
          <ul>
            {roots.map((root) => (
              <FolderBranch
                key={root.path}
                node={root}
                selected={path}
                policy={policy}
                choose={setPath}
                root
              />
            ))}
          </ul>
        </nav>
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
      </div>
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
          <DialogContent
            className="settings-dialog folder-picker-dialog"
            header={
              <>
                {' '}
                <div className="dialog-heading">
                  <Dialog.Title>{label}</Dialog.Title>
                </div>
                <Dialog.Description>
                  {tr(newFolder ? 'ui.newFolderDestination' : 'ui.chooseFolder')}
                </Dialog.Description>{' '}
              </>
            }
            variant="form"
            intent="edit"
            dirty={false}
          >
            <FolderPicker
              initialPath={newFolder ? '' : value}
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
