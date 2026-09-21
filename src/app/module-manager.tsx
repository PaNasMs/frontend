import { WaitingSurface } from '../shared/ui'
import { DialogContent } from '../shared/ui'
import { useQueryValue } from './navigation'
import { tr } from '../i18n/index'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  mdiPuzzleOutline,
  mdiPowerOff,
  mdiCheckCircleOutline,
  mdiDownload,
  mdiUpdate,
  mdiUpload,
  mdiPlay,
  mdiStop,
  mdiDeleteOutline,
  mdiClose,
  mdiRefresh,
  mdiArrowLeft,
  mdiFolderOutline,
  mdiConsole,
} from '@mdi/js'
import { registerModule, modules } from './module-registry'
import { managed, type Job } from './operations'
import { newID } from './desktop-layout'
import { waitForJob } from '../shared/job-completion'
import { Button, Icon, Notice } from '../shared/ui'
import { moduleCatalog, availableModules, type InstalledModule } from './module-loader'
import * as Dialog from '@radix-ui/react-dialog'
type Plan = {
  target: string
  details: string[]
  fingerprint: string
  confirmation: string
}
function moduleIcon(module: InstalledModule) {
  return (
    modules().find((item) => item.id === module.id)?.icon ??
    { files: mdiFolderOutline, terminal: mdiConsole }[module.id] ??
    mdiPuzzleOutline
  )
}
export function ModuleManager() {
  const { moduleId } = useParams()
  const [filter, setFilter] = useQueryValue('filter', 'all', ['all', 'installed', 'available'])
  const catalog = useQuery({ queryKey: ['modules'], queryFn: moduleCatalog })
  const remote = useQuery({
    queryKey: ['module-catalog'],
    queryFn: availableModules,
    staleTime: 300000,
    retry: false,
  })
  const file = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{
    action: string
    params: Record<string, string>
    plan: Plan
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [stage, setStage] = useState('')
  async function preview(action: string, params: Record<string, string>) {
    setError('')
    setBusy(true)
    try {
      const plan = await managed<Plan>('plan', { action, params })
      setPending({ action, params, plan })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function upload(archive: File) {
    setError('')
    setBusy(true)
    setStage(tr('uploading_and_checking_archive_d6f140be'))
    try {
      if (archive.size > 128 * 1024 * 1024) throw Error(tr('the_archive_must_not_exceed_128_mib_8b2f3ac6'))
      const response = await fetch('/api/v1/modules/upload', {
        method: 'POST',
        headers: { 'X-PaNasMs-Request': '1', 'Content-Type': 'application/zip' },
        body: archive,
      })
      if (!response.ok) throw Error(tr('could_not_upload_archive_44fa0a9b') + ' ' + response.status)
      const data = (await response.json()) as {
        upload: string
      }
      await preview('module.install', data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      setStage('')
    }
  }
  async function apply(operation = pending) {
    if (!operation) return
    setError('')
    setBusy(true)
    setStage(tr('in_progress_da4341a2'))
    try {
      const job = await managed<{
        id: string
      }>('run', {
        id: newID(),
        action: operation.action,
        params: operation.params,
        fingerprint: operation.plan.fingerprint,
        confirmation: operation.plan.confirmation,
      })
      await waitForJob(
        async () => {
          const jobs = await managed<Job[]>('jobs')
          const current = jobs.find((j) => j.id === job.id)
          if (current) setStage(current.stage)
          return current
        },
        undefined,
        3600,
      )
      if (operation.action === 'module.remove' && moduleId === operation.params.target)
        location.assign('/modules')
      else location.reload()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
      setPending(null)
      setStage('')
      void catalog.refetch()
    }
  }
  async function install(module: InstalledModule) {
    setError('')
    setBusy(true)
    setStage(tr('modules.catalogPreparing'))
    try {
      const params = { target: module.id, version: module.version }
      const action = 'module.catalog-install'
      const plan = await managed<Plan>('plan', { action, params })
      await apply({ action, params, plan })
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
      setStage('')
    }
  }
  const installedIds = new Set(catalog.data?.installed.map((m) => m.id))
  const items = [
    ...(catalog.data?.installed ?? []),
    ...(remote.data?.available.filter((m) => !installedIds.has(m.id)) ?? []),
  ]
  const visibleItems = items.filter(
    (m) => filter === 'all' || (filter === 'installed' ? installedIds.has(m.id) : !installedIds.has(m.id)),
  )
  const listPath = filter === 'all' ? '/modules' : `/modules?filter=${filter}`
  const selected = items.find((item) => item.id === moduleId)
  const downloadAction = (module: InstalledModule) => {
    const release = remote.data?.available.find((m) => m.id === module.id)
    if (!release || (installedIds.has(module.id) && !release.updateAvailable)) return null
    const label =
      release.reason ||
      tr(installedIds.has(module.id) ? 'modules.catalogUpdate' : 'modules.catalogInstall', {
        version: release.version,
      })
    return (
      <Button
        disabled={busy || !!release.reason}
        title={label}
        aria-label={label}
        onClick={() => void install(release)}
      >
        <Icon path={installedIds.has(module.id) ? mdiUpdate : mdiDownload} />
      </Button>
    )
  }
  const actions = (module: InstalledModule) => (
    <div className="actions module-card-actions" aria-label={tr('actions_908fd05d', { v0: module.title })}>
      {downloadAction(module)}
      {installedIds.has(module.id) && (
        <>
          <Button
            disabled={busy || (module.enabled && module.requiredBy.length > 0)}
            title={module.enabled ? tr('disable_module_11c9ac86') : tr('enable_module_9e827c96')}
            aria-label={`${module.enabled ? tr('disable_94d07a21') : tr('enable_66be7e0c')} ${module.title}`}
            onClick={() =>
              void preview(module.enabled ? 'module.disable' : 'module.enable', { target: module.id })
            }
          >
            <Icon path={module.enabled ? mdiStop : mdiPlay} />
          </Button>
          <Button
            disabled={busy || module.requiredBy.length > 0}
            title={tr('remove_module_ed11fa8e')}
            aria-label={tr('delete_12edf5dd', { v0: module.title })}
            onClick={() => void preview('module.remove', { target: module.id })}
          >
            <Icon path={mdiDeleteOutline} />
          </Button>
        </>
      )}
    </div>
  )
  const moduleName = (id: string) => catalog.data?.installed.find((item) => item.id === id)?.title ?? id
  return (
    <WaitingSurface busy={busy && !pending} message={stage || undefined}>
      <div className="page-heading">
        <div className="module-page-title">
          {moduleId && (
            <Link
              className="button"
              to={listPath}
              title={tr('all_modules_b2eb576f')}
              aria-label={tr('all_modules_b2eb576f')}
            >
              <Icon path={mdiArrowLeft} />
            </Link>
          )}
          {selected && (
            <span className="module-icon">
              <Icon path={moduleIcon(selected)} />
            </span>
          )}
          <div>
            <h1>{moduleId ? (selected?.title ?? tr('module_de8243b9')) : tr('modules_09017097')}</h1>
            <p className="muted">
              {selected
                ? `${installedIds.has(selected.id) ? (selected.enabled ? tr('enabled_12b6f103') : tr('disabled_c9467860')) : tr('modules.catalogAvailable')} · ${selected.version}`
                : moduleId
                  ? tr('module_details_4dac2386')
                  : tr('additional_panasms_features_357fb81f')}
            </p>
          </div>
        </div>
        {selected
          ? actions(selected)
          : !moduleId && (
              <div className="actions">
                <select
                  aria-label={tr('modules.filter')}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">{tr('modules.filterAll')}</option>
                  <option value="installed">{tr('modules.filterInstalled')}</option>
                  <option value="available">{tr('modules.filterAvailable')}</option>
                </select>
                <Button
                  title={tr('install_from_archive_1a48c0ab')}
                  aria-label={tr('install_from_archive_1a48c0ab')}
                  disabled={busy}
                  onClick={() => file.current?.click()}
                >
                  <Icon path={mdiUpload} />
                </Button>
                <Button
                  title={tr('refresh_list_0cd9c0df')}
                  aria-label={tr('refresh_list_0cd9c0df')}
                  disabled={busy}
                  onClick={() => {
                    void catalog.refetch()
                    void remote.refetch()
                  }}
                >
                  <Icon path={mdiRefresh} />
                </Button>
              </div>
            )}
        <input
          ref={file}
          type="file"
          hidden
          accept=".zip,.panasms"
          onChange={(e) => {
            const archive = e.target.files?.[0]
            e.target.value = ''
            if (archive) void upload(archive)
          }}
        />
      </div>
      {(error || catalog.error) && <Notice error>{error || catalog.error?.message}</Notice>}
      {remote.error && (
        <Notice error>
          {tr('modules.catalogError')} {remote.error.message}
        </Notice>
      )}
      {remote.isPending && <p className="muted">{tr('modules.catalogLoading')}</p>}

      {catalog.isPending && <p className="muted">{tr('loading_modules_d860b4ba')}</p>}
      {moduleId && catalog.data && !remote.isPending && !selected && (
        <Notice>
          {tr('module_is_not_installed_b883bd98') + ' '}
          <Link to={listPath}>{tr('all_modules_b2eb576f')}</Link>
        </Notice>
      )}
      {!moduleId && !remote.isPending && items.length === 0 && (
        <div className="surface module-empty">
          <h2>{tr('no_additional_modules_yet_60915ff0')}</h2>
          <p className="muted">{tr('upload_an_archive_using_the_button_above_99230b8c')}</p>
        </div>
      )}
      {!moduleId &&
        !catalog.isPending &&
        !remote.isPending &&
        items.length > 0 &&
        visibleItems.length === 0 && <p className="muted">{tr('modules.filterEmpty')}</p>}
      {!moduleId && (
        <div className="module-list">
          {visibleItems.map((module) => (
            <article
              className={`surface module-card${installedIds.has(module.id) && !module.enabled ? ' module-card-disabled' : ''}`}
              key={module.id}
            >
              <span className="module-icon">
                <Icon path={moduleIcon(module)} />
              </span>
              <div className="module-card-info">
                <h2>
                  <Link
                    className="module-card-link"
                    title={module.title}
                    to={`/modules/${module.id}${filter === 'all' ? '' : `?filter=${filter}`}`}
                  >
                    {module.title}
                  </Link>
                </h2>
                <span className="module-card-version muted" title={tr('version_97c248cb')}>
                  {tr(
                    installedIds.has(module.id) ? 'ui.moduleInstalledVersion' : 'ui.moduleAvailableVersion',
                    { version: module.version },
                  )}
                </span>
              </div>
              <div className="module-card-footer">
                <span
                  className={`module-status ${installedIds.has(module.id) ? (module.enabled ? 'enabled' : 'disabled') : 'available'}`}
                >
                  <Icon
                    size={16}
                    path={
                      installedIds.has(module.id)
                        ? module.enabled
                          ? mdiCheckCircleOutline
                          : mdiPowerOff
                        : mdiDownload
                    }
                  />
                  {tr(
                    installedIds.has(module.id)
                      ? module.enabled
                        ? 'enabled_12b6f103'
                        : 'disabled_c9467860'
                      : 'ui.notInstalled',
                  )}
                </span>
                {actions(module)}
              </div>
            </article>
          ))}
        </div>
      )}
      {selected && (
        <div className="module-details">
          <section className="surface">
            <h2>{tr('about_this_module_debf7d50')}</h2>
            <p>{selected.description || tr('no_description_provided_7eeedaab')}</p>
            <dl className="module-facts">
              <dt>{tr('version_97c248cb')}</dt>
              <dd>{selected.version}</dd>
              <dt>{tr('publisher_cbd62640')}</dt>
              <dd>{selected.signer}</dd>
              <dt>{tr('identifier_754cbaf5')}</dt>
              <dd>{selected.id}</dd>
            </dl>
          </section>
          <section className="surface">
            <h2>{tr('dependencies_898afdf0')}</h2>
            <dl className="module-facts">
              <dt>{tr('panasms_core_a9f23ebe')}</dt>
              <dd>
                {selected.core}
                <span className="muted small">
                  {' ' + tr('installed_c722728d') + ' '}
                  {catalog.data?.core}
                </span>
              </dd>
            </dl>
            <h3>{tr('modules_09017097')}</h3>
            {Object.keys(selected.dependencies ?? {}).length ? (
              <dl className="module-facts">
                {Object.entries(selected.dependencies ?? {}).map(([id, version]) => (
                  <div className="module-fact-row" key={id}>
                    <dt>
                      <Link to={`/modules/${id}`}>{moduleName(id)}</Link>
                    </dt>
                    <dd>{version}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted">{tr('none_required_fde97bf8')}</p>
            )}
            <h3>{tr('system_packages_bb8c222e')}</h3>
            {Object.keys(selected.packages ?? {}).length ? (
              <dl className="module-facts">
                {Object.entries(selected.packages ?? {}).map(([name, version]) => (
                  <div className="module-fact-row" key={name}>
                    <dt>{name}</dt>
                    <dd>≥ {version}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted">{tr('none_required_fde97bf8')}</p>
            )}
            {selected.requiredBy.length > 0 && (
              <>
                <h3>{tr('used_by_modules_0cb1f0f1')}</h3>
                <ul>
                  {selected.requiredBy.map((id) => (
                    <li key={id}>
                      <Link to={`/modules/${id}`}>{moduleName(id)}</Link>
                    </li>
                  ))}
                </ul>
                <p className="muted small">
                  {tr('remove_dependent_modules_first_to_disable_or_remov_54fb2a3f')}
                </p>
              </>
            )}
          </section>
        </div>
      )}
      <Dialog.Root
        open={!!pending}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <DialogContent
            busy={busy}
            message={stage || undefined}
            className="settings-dialog operation-dialog"
          >
            <div className="page-heading">
              <Dialog.Title>
                {pending?.action === 'module.install'
                  ? tr('install_modules_bfc8911f')
                  : tr('change_module_4e519bcb')}
              </Dialog.Title>
              <Button
                title={tr('close_4ae50d30')}
                aria-label={tr('close_4ae50d30')}
                disabled={busy}
                onClick={() => setPending(null)}
              >
                <Icon path={mdiClose} />
              </Button>
            </div>
            <Dialog.Description>{tr('review_the_changes_before_applying_0b26d959')}</Dialog.Description>
            <ul>
              {pending?.plan.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>

            <div className="actions">
              <Button disabled={busy} onClick={() => void apply()}>
                {tr('confirm_0467ae4b')}
              </Button>
              <Button disabled={busy} onClick={() => setPending(null)}>
                {tr('cancel_0ec753be')}
              </Button>
            </div>
          </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </WaitingSurface>
  )
}
registerModule({
  id: 'modules',
  title: tr('modules_09017097'),
  path: '/modules',
  icon: mdiPuzzleOutline,
  component: ModuleManager,
})
