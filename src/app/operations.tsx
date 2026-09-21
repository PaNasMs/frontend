import { mdiCancel, mdiRestore, mdiCheck, mdiRefresh } from '@mdi/js'
import { serverText } from '../i18n/server'
import { Link } from 'react-router-dom'
import { DialogContent } from '../shared/ui'
import { tr, locale } from '../i18n/index'
import { SystemTasks, useRaidTasks } from './raid-tasks'
import { waitForJob } from '../shared/job-completion'
import { newID } from './dashboard'
import { useState, useEffect, useRef, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request, type Accounts } from '../api/client'
import { Button, Icon, Notice, bytes } from '../shared/ui'
type RecoveryReport = {
  message: string
  checks: { label: string; value: unknown }[]
  route: string
  recoveryAction?: string
}
export type Job = {
  id: string
  user: string
  action: string
  target: string
  status: string
  stage: string
  created: string
  updated: string
  canCancel: boolean
  cancelRequested: boolean
  needsReview: boolean
  recovery?: RecoveryReport
  result: Record<string, unknown>
}
export type Field = {
  key: string
  label: string
  type?: 'number' | 'password' | 'check' | 'devices' | 'groups' | 'users' | 'device' | 'select'
  options?: string[]
  value?: unknown
}
type Operation = {
  label: string
  fields: Field[]
}
const target = { key: 'target', label: tr('device_bc791dbe'), type: 'device' } as Field
const user = { key: 'target', label: tr('username_e2d97c93') } as Field
const point = { key: 'point', label: tr('mount_point_b3caf3fe'), value: '/srv/' } as Field
const size = { key: 'sizeMiB', label: tr('new_size_mib_43cfeb96'), type: 'number' } as Field
const mounting = [
  point,
  { key: 'automount', label: tr('mount_at_startup_9c96dc46'), type: 'check', value: true },
  { key: 'readOnly', label: tr('read_only_c5eb2661'), type: 'check', value: false },
] as Field[]
export const operations: Record<string, Operation> = {
  'network.wifi.scan': { label: tr('wifi.scan'), fields: [] },
  'network.wifi.radio': { label: tr('wifi.networks'), fields: [] },
  'network.wifi.connect': { label: tr('wifi.connect'), fields: [] },
  'network.wifi.disconnect': { label: tr('wifi.disconnect'), fields: [] },
  'network.share.remove-port': { label: tr('share.removePort'), fields: [] },
  'network.share.wifi': { label: tr('network.wifiSettings'), fields: [] },
  'network.share.save': { label: tr('share.create'), fields: [] },
  'network.share.start': { label: tr('share.start'), fields: [] },
  'network.share.stop': { label: tr('share.stop'), fields: [] },
  'network.share.delete': { label: tr('share.delete'), fields: [] },
  'network.configure': { label: tr('network.configure'), fields: [] },
  'network.confirm': { label: tr('network.confirm'), fields: [] },
  'network.rollback': { label: tr('network.rollback'), fields: [] },
  'system.poweroff': { label: tr('power.poweroff'), fields: [] },
  'system.reboot': { label: tr('power.reboot'), fields: [] },
  'homes.move': { label: tr('homes.move'), fields: [] },
  'module.recover': { label: tr('jobs.recoverModules'), fields: [] },
  'updates.repair': { label: tr('jobs.repairPackages'), fields: [] },
  'homes.recover': { label: tr('homes.recover'), fields: [] },
  'folder.permissions': {
    label: tr('folder_ownership_and_permissions_74a7c536'),
    fields: [
      { key: 'target', label: tr('folder_on_a_local_volume_a8d51b60') },
      { key: 'owner', label: tr('owner_username_6137717d') },
      { key: 'group', label: tr('group_ae8ad7b5') },
      {
        key: 'mode',
        label: tr('unix_folder_permissions_076ccf72'),
        type: 'select',
        options: ['0700', '0750', '0770', '0755', '0775', '2770', '2775'],
        value: '0770',
      },
    ],
  },
  'file.mkdir': {
    label: tr('create_folder_944b559c'),
    fields: [{ key: 'name', label: tr('folder_name_198ad630') }],
  },
  'file.rename': {
    label: tr('rename_715e8f0c'),
    fields: [
      { key: 'target', label: tr('source_8290a3db') },
      { key: 'destination', label: tr('new_absolute_path_b4ecc12c') },
    ],
  },
  'file.copy': {
    label: tr('copy_4a05d861'),
    fields: [
      { key: 'target', label: tr('source_8290a3db') },
      { key: 'destination', label: tr('absolute_destination_path_8cf39579') },
    ],
  },
  'file.move': {
    label: tr('move_54dacb06'),
    fields: [
      { key: 'target', label: tr('source_8290a3db') },
      { key: 'destination', label: tr('absolute_destination_path_8cf39579') },
    ],
  },
  'file.trash': {
    label: tr('move_to_trash_f8b39dea'),
    fields: [{ key: 'target', label: tr('source_8290a3db') }],
  },
  'file.restore': {
    label: tr('restore_from_trash_5825c7d2'),
    fields: [
      { key: 'target', label: tr('item_in_trash_702b83c5') },
      { key: 'destination', label: tr('restore_path_a2fd0bb0') },
    ],
  },
  'file.delete': {
    label: tr('permanently_delete_1879f0ec'),
    fields: [{ key: 'target', label: tr('path_1b46c650') }],
  },
  'disk.prepare': { label: tr('wipe_device_79e13b21'), fields: [target] },
  'raid.create': {
    label: tr('create_array_f5677d02'),
    fields: [
      { key: 'name', label: tr('array_name_be74c8db') },
      {
        key: 'level',
        label: tr('raid_level_7e35cae7'),
        type: 'select',
        options: ['0', '1', '5', '6', '10'],
        value: '1',
      },
      { key: 'members', label: tr('members_fcb848e4'), type: 'devices', value: [] },
    ],
  },
  'raid.pause': { label: tr('pause_reshape_8ab3f7ba'), fields: [target] },
  'raid.resume': { label: tr('resume_reshape_6ac07018'), fields: [target] },
  'raid.delete': { label: tr('delete_array_9849a1e4'), fields: [target] },
  'raid.grow': {
    label: tr('expand_array_120f4b44'),
    fields: [target, { ...target, key: 'replacement', label: tr('new_disk_7b12fee7') }],
  },
  'raid.add': {
    label: tr('add_spare_disk_861721d2'),
    fields: [target, { ...target, key: 'replacement', label: tr('new_disk_7b12fee7') }],
  },
  'raid.replace': {
    label: tr('replace_member_8d41ec0e'),
    fields: [
      target,
      { ...target, key: 'member', label: tr('disk_to_replace_1d8dff98') },
      { ...target, key: 'replacement', label: tr('new_disk_7b12fee7') },
    ],
  },
  'raid.check': { label: tr('check_array_80a1807f'), fields: [target] },
  'raid.check-stop': { label: tr('stop_array_check_befc81d8'), fields: [target] },
  'partition.create': {
    label: tr('create_partition_cc6989af'),
    fields: [
      target,
      { key: 'startMiB', label: tr('start_mib_4c98d871'), type: 'number', value: 1 },
      { key: 'endMiB', label: tr('end_mib_41fdede8'), type: 'number' },
    ],
  },
  'partition.delete': { label: tr('delete_partition_74a0d7ba'), fields: [target] },
  'partition.resize': { label: tr('resize_partition_080a7c82'), fields: [target, size] },
  'filesystem.format': {
    label: tr('format_volume_01553c8e'),
    fields: [
      target,
      {
        key: 'format',
        label: tr('file_system_678066d2'),
        type: 'select',
        options: ['ext4', 'xfs', 'btrfs', 'vfat'],
        value: 'ext4',
      },
    ],
  },
  'filesystem.resize': {
    label: tr('resize_file_system_af722666'),
    fields: [
      target,
      { ...size, label: tr('size_for_ext_btrfs_mib_0_uses_the_whole_device_for_6778acbc'), value: 0 },
    ],
  },
  'disk.sleep': { label: tr('hdd_sleep_settings_d207e562'), fields: [] },
  'mount.open': { label: tr('check_and_mount_volume_c9a6f843'), fields: [target] },
  'mount.attach': { label: tr('mount_volume_9aa3b71f'), fields: [target, ...mounting] },
  'mount.settings': { label: tr('mount_options_64cffcf3'), fields: [target, ...mounting] },
  'mount.detach': { label: tr('unmount_volume_045babe0'), fields: [target] },
  'disk.eject': { label: tr('safely_eject_disk_c9c9731f'), fields: [target] },
  'luks.create': {
    label: tr('create_encrypted_volume_a70fa700'),
    fields: [
      target,
      { key: 'passphrase', label: tr('luks_password_keep_a_separate_copy_43d8a4a0'), type: 'password' },
    ],
  },
  'luks.open': {
    label: tr('unlock_volume_60949765'),
    fields: [
      target,
      { key: 'name', label: tr('unlocked_volume_name_3bcaa317') },
      { key: 'passphrase', label: tr('luks_password_c94fe95f'), type: 'password' },
    ],
  },
  'luks.close': { label: tr('lock_volume_dd9f2c5c'), fields: [target] },
  'smart.unschedule': { label: tr('delete_smart_schedule_ee3cb186'), fields: [target] },
  'smart.short': { label: tr('short_smart_test_4a03235f'), fields: [target] },
  'smart.long': { label: tr('extended_smart_test_8c82a017'), fields: [target] },
  'smart.abort': { label: tr('stop_smart_test_a72d42af'), fields: [target] },
  'smart.schedule': {
    label: tr('smart_schedule_07fafb80'),
    fields: [
      target,
      {
        key: 'test',
        label: tr('test_type_fc9f3551'),
        type: 'select',
        options: ['short', 'long'],
        value: 'short',
      },
      { key: 'weeks', label: tr('interval_in_weeks_1_or_2_3f025dc1'), type: 'number', value: 1 },
      { key: 'weekday', label: tr('weekday_0_monday_6_sunday_56b6e32e'), type: 'number', value: 6 },
      { key: 'hour', label: tr('start_hour_0_23_d63aee2b'), type: 'number', value: 3 },
    ],
  },
  'user.security': { label: tr('accounts.security'), fields: [] },
  'user.identity': { label: tr('accounts.changeUID'), fields: [] },
  'user.key.add': { label: tr('accounts.addKey'), fields: [] },
  'user.key.delete': { label: tr('accounts.deleteKey'), fields: [] },
  'user.session.end': { label: tr('accounts.endSession'), fields: [] },
  'user.create': {
    label: tr('create_user_40516a2e'),
    fields: [
      user,
      { key: 'name', label: tr('display_name_403372fc') },
      { key: 'home', label: tr('homes.optionalHome') },
      { key: 'primaryGroup', label: tr('primary_group_5cd09a30'), type: 'select' },
      { key: 'groups', label: tr('accounts.additionalGroups'), type: 'groups', value: [] },
      { key: 'password', label: tr('password_14f7c63c'), type: 'password' },
 { key: 'passwordConfirm', label: tr('repeat_new_password_e32d8bb9'), type: 'password' },
    ],
  },
  'user.edit': {
    label: tr('edit_user_e622fe66'),
    fields: [
      user,
      { key: 'name', label: tr('display_name_403372fc') },
      { key: 'primaryGroup', label: tr('primary_group_5cd09a30') },
      {
        key: 'groups',
        label: tr('additional_groups_sudo_administrator_ba89e04a'),
        type: 'groups',
        value: [],
      },
    ],
  },
  'user.password': {
    label: tr('reset_password_a548434c'),
    fields: [user, { key: 'password', label: tr('new_password_5e611d70'), type: 'password' }],
  },
  'user.home': {
    label: tr('move_home_folder_335db758'),
    fields: [user, { key: 'home', label: tr('new_home_path_18188fcc') }],
  },
  'user.delete': {
    label: tr('delete_user_e0728517'),
    fields: [
      user,
      {
        key: 'deleteHome',
        label: tr('also_delete_the_entire_home_folder_0fc4e209'),
        type: 'check',
        value: true,
      },
    ],
  },
  'group.create': {
    label: tr('create_group_305f4725'),
    fields: [{ key: 'target', label: tr('group_name_9e4491a4') }],
  },
  'group.edit': {
    label: tr('edit_group_members_ad891d65'),
    fields: [
      { key: 'target', label: tr('group_name_9e4491a4') },
      { key: 'members', label: tr('members_fcb848e4'), type: 'users', value: [] },
    ],
  },
  'group.delete': {
    label: tr('delete_group_05b970e6'),
    fields: [{ key: 'target', label: tr('group_name_9e4491a4') }],
  },
  'service.start': {
    label: tr('start_service_848472b0'),
    fields: [{ key: 'target', label: tr('service_service_86e80213') }],
  },
  'service.stop': {
    label: tr('stop_service_316b22ee'),
    fields: [{ key: 'target', label: tr('service_service_86e80213') }],
  },
  'service.restart': {
    label: tr('restart_service_43db56ed'),
    fields: [{ key: 'target', label: tr('service_service_86e80213') }],
  },
  'service.enable': {
    label: tr('enable_at_startup_9c7863a9'),
    fields: [{ key: 'target', label: tr('service_service_86e80213') }],
  },
  'service.disable': {
    label: tr('disable_at_startup_15bc5d78'),
    fields: [{ key: 'target', label: tr('service_service_86e80213') }],
  },
  'updates.refresh': { label: tr('check_for_updates_fa7bfc55'), fields: [] },
  'updates.install': { label: tr('install_os_updates_36c392a4'), fields: [] },
  'nfs.export': {
    label: tr('share_folder_via_nfs_9108d76f'),
    fields: [
      { key: 'target', label: tr('directory_on_a_local_volume_9baebdb5') },
      { key: 'clients', label: tr('ip_addresses_subnets_comma_separated_27575fc9') },
      { key: 'readOnly', label: tr('read_only_c5eb2661'), type: 'check', value: true },
    ],
  },
  'nfs.export-remove': {
    label: tr('remove_nfs_share_e7cb9224'),
    fields: [{ key: 'target', label: tr('directory_46e27e2f') }],
  },
  'nfs.mount': {
    label: tr('mount_nfs_share_d919b4cb'),
    fields: [{ key: 'target', label: tr('source_server_path_f026d86a') }, ...mounting],
  },
  'smb.mount': {
    label: tr('mount_smb_share_2ebdd0f8'),
    fields: [
      { key: 'target', label: tr('source_server_share_833f040d') },
      { key: 'username', label: tr('smb_username_ce995eee') },
      { key: 'password', label: tr('smb_password_405fb80a'), type: 'password' },
      { key: 'domain', label: tr('domain_optional_ad95d0bd') },
      ...mounting,
    ],
  },
  'smb.unmount': {
    label: tr('unmount_smb_share_78ac7d61'),
    fields: [{ key: 'target', label: tr('mount_point_b3caf3fe') }],
  },
  'nfs.unmount': {
    label: tr('unmount_network_share_dd0cee6d'),
    fields: [{ key: 'target', label: tr('mount_point_b3caf3fe') }],
  },
}
export async function managed<T>(view: string, body?: unknown, target?: string): Promise<T> {
  const data = await request<
    T & {
      error?: string
    }
  >(
    `manage?view=${view}${target ? '&target=' + encodeURIComponent(target) : ''}`,
    body ? 'POST' : 'GET',
    body,
  )
  if (data.error) throw new Error(data.error)
  return data
}
type OperationContext = {
  key: string
  label: string
  value: string
}[]
export type Choice = {
  id: string
  label: string
  disabled?: boolean
}
type OperationProps = {
  actions: string[]
  initial?: Record<string, unknown>
  label?: string
  tooltip?: string
  icon?: string
  disabled?: boolean
  context?: OperationContext
  candidatesFor?: string
  fields?: Field[]
  choices?: Record<string, Choice[]>
  description?: string
  autoReview?: boolean
}
export function OperationButton({
  actions,
  initial = {},
  label = tr('actions_9978ac34'),
  tooltip,
  icon,
  disabled,
  context = [],
  candidatesFor,
  fields,
  choices,
  description,
  autoReview = false,
}: OperationProps) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <span
        className={tooltip ? 'operation-hint' : undefined}
        tabIndex={tooltip && disabled ? 0 : undefined}
        aria-label={tooltip && disabled ? `${label}: ${tooltip}` : undefined}
        title={tooltip}
      >
        <Dialog.Trigger asChild>
          <Button
            disabled={disabled}
            className={icon ? 'raid-action' : undefined}
            aria-label={label}
            title={tooltip ? undefined : label}
          >
            {icon ? <Icon path={icon} /> : label}
          </Button>
        </Dialog.Trigger>
        {tooltip && (
          <span className="operation-tooltip" role="tooltip">
            {tooltip}
          </span>
        )}
      </span>
      {open && (
        <OperationForm
          actions={actions}
          initial={initial}
          context={context}
          candidatesFor={candidatesFor}
          fields={fields}
          choices={choices}
          description={description}
          autoReview={autoReview}
          onDone={() => setOpen(false)}
        />
      )}
    </Dialog.Root>
  )
}
function OperationForm({
  actions,
  initial = {},
  context = [],
  candidatesFor,
  fields,
  choices: providedChoices,
  description,
  autoReview = false,
  onDone,
}: OperationProps & {
  onDone: () => void
}) {
  const q = useQueryClient()
  const [action, setAction] = useState(actions[0])
  const defaults = (a: string) => ({
    ...Object.fromEntries((fields ?? operations[a].fields).map((f) => [f.key, f.value ?? ''])),
    ...initial,
  })
  const [params, setParams] = useState<Record<string, unknown>>(() => defaults(action))
  const [id] = useState(() => newID())
  const inv = useQuery({
    queryKey: ['management-storage', candidatesFor ?? 'all'],
    queryFn: () =>
      managed<{
        devices: {
          path: string
          model?: string
          serial?: string
          size: number
          type: string
        }[]
        formats: string[]
      }>(candidatesFor ? 'raid-candidates' : 'storage-options', undefined, candidatesFor),
  })
  const accounts = useQuery({ queryKey: ['users'], queryFn: () => request<Accounts>('users'), enabled: (fields ?? operations[action].fields).some(f => f.type === 'groups' || f.type === 'users') })
  const folderName = String(params.name ?? '')
  const invalidFolderName =
    action === 'file.mkdir' &&
    (!folderName.trim() || folderName === '.' || folderName === '..' || /[\/\x00]/.test(folderName))
  const requestParams =
    action === 'file.mkdir'
      ? { target: String(params.parent ?? '').replace(/\/$/, '') + '/' + folderName }
      : action === 'partition.create' && 'sizeMiB' in params
        ? { ...params, endMiB: Number(params.startMiB) + Number(params.sizeMiB) }
        : params
  const plan = useMutation({
    mutationFn: () => {
      if (['user.create','user.password'].includes(action) && params.password !== params.passwordConfirm) throw new Error(tr('passwords_do_not_match_a73dc9b1'))
      if (invalidFolderName)
        throw new Error(tr('enter_a_folder_name_without_slashes_and_are_not_al_83215286'))
      return managed<{
        target: string
        details: string[]
        confirmation: string
        fingerprint: string
      }>('plan', { action, params: requestParams })
    },
  })
  const run = useMutation({
    mutationFn: async (requestedAction?: string) => {
      const selectedAction = requestedAction ?? action
      const reviewed =
        selectedAction === action
          ? plan.data
          : await managed<{
              fingerprint: string
              confirmation: string
            }>('plan', {
              action: selectedAction,
              params: requestParams,
            })
      const job = await managed<{
        id: string
      }>('run', {
        id,
        action: selectedAction,
        params: requestParams,
        fingerprint: reviewed?.fingerprint,
        confirmation: reviewed?.confirmation,
      })
      if (['smart.schedule', 'smart.unschedule'].includes(action) || action.startsWith('user.') || action.startsWith('group.')) {
        await waitForJob(async () => {
          const jobs = await managed<Job[]>('jobs')
          q.setQueryData(['jobs'], jobs)
          return jobs.find((j) => j.id === job.id)
        })
        if (action.startsWith('user.') || action.startsWith('group.')) {
          await Promise.all(['users','account-details','account-sessions','account-history','profile'].map(key => q.invalidateQueries({ queryKey: [key] })))
        }
        await q.cancelQueries({ queryKey: ['management-storage'] })
        await q.invalidateQueries({ queryKey: ['management-storage'] }, { throwOnError: true })
      }
      return job
    },
    onSuccess: () => {
      void q.invalidateQueries({ queryKey: ['jobs'] })
      onDone()
    },
  })
  const editable = (fields ?? operations[action].fields).filter((f) => !context.some((c) => c.key === f.key))
  const started = useRef(false)
  useEffect(() => {
    if (autoReview && editable.length === 0 && !started.current) {
      started.current = true
      plan.mutate()
    }
  }, [autoReview, editable.length, plan])
  const change = (key: string, value: unknown) => {
    setParams((p) => ({ ...p, [key]: value }))
    plan.reset()
    run.reset()
  }
  const fileOperation = action.startsWith('file.')
  const fileName =
    String(requestParams.target ?? '')
      .split('/')
      .filter(Boolean)
      .at(-1) ?? ''
  const fileQuestions: Record<string, ReactNode> = {
    'file.trash': (
      <>
        {tr('delete_6e408d3c')}
        <strong>{fileName}</strong>»?
      </>
    ),
    'file.delete': (
      <>
        {tr('delete_6e408d3c')}
        <strong>{fileName}</strong>
        {tr('permanently_15b6af55')}
      </>
    ),
    'file.mkdir': (
      <>
        {tr('create_folder_4996f13a')}
        <strong>{fileName}</strong>»?
      </>
    ),
    'file.rename': (
      <>
        {tr('rename_1db9da0f')}
        <strong>{fileName}</strong>
        {tr('to_b1c1ad7f')}
        <strong>
          {String(params.destination ?? '')
            .split('/')
            .at(-1)}
        </strong>
        »?
      </>
    ),
    'file.copy': (
      <>
        {tr('copy_e413cf88')}
        <strong>{fileName}</strong>
        {tr('to_b1c1ad7f')}
        <strong>{String(params.destination ?? '')}</strong>»?
      </>
    ),
    'file.move': (
      <>
        {tr('move_aa28745a')}
        <strong>{fileName}</strong>
        {tr('to_b1c1ad7f')}
        <strong>{String(params.destination ?? '')}</strong>»?
      </>
    ),
    'file.restore': (
      <>
        {tr('restore_8074d192')}
        <strong>{fileName}</strong>
        {tr('to_b1c1ad7f')}
        <strong>{String(params.destination ?? '')}</strong>»?
      </>
    ),
  }
  if (fileOperation && (plan.data || editable.length === 0))
    return (
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <DialogContent
          busy={plan.isPending || run.isPending}
          message={tr(
            run.isPending
              ? 'applying_changes_and_refreshing_data_2f929fed'
              : 'checking_whether_this_operation_is_available_75110126',
          )}
          className="eject-confirm-dialog file-confirm-dialog"
        >
          <Dialog.Title>
            {action === 'file.trash' || action === 'file.delete'
              ? tr('delete_04963db0')
              : operations[action].label}
          </Dialog.Title>
          <Dialog.Description>{fileQuestions[action]}</Dialog.Description>
          {plan.error && <Notice error>{plan.error.message}</Notice>}
          {run.error && <Notice error>{run.error.message}</Notice>}

          {(action === 'file.trash' || action === 'file.delete') && (
            <p className="muted">{tr('delete_cannot_be_undone_from_the_trash_79e7714a')}</p>
          )}
          <div className="actions">
            {action === 'file.trash' || action === 'file.delete' ? (
              <>
                <Button
                  className="primary"
                  disabled={!plan.data || run.isPending || action === 'file.delete'}
                  onClick={() => run.mutate('file.trash')}
                >
                  {tr('move_to_trash_f8b39dea')}
                </Button>
                <Button disabled={!plan.data || run.isPending} onClick={() => run.mutate('file.delete')}>
                  {tr('delete_86ea33ae')}
                </Button>
              </>
            ) : (
              <Button className="primary" disabled={!plan.data || run.isPending} onClick={() => run.mutate()}>
                {tr('yes_8d2fab2d')}
              </Button>
            )}
            <Dialog.Close asChild>
              <Button disabled={run.isPending} autoFocus>
                {action === 'file.trash' || action === 'file.delete'
                  ? tr('cancel_0ec753be')
                  : tr('no_f82a8219')}
              </Button>
            </Dialog.Close>
          </div>
        </DialogContent>
      </Dialog.Portal>
    )
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <DialogContent
        busy={plan.isPending || run.isPending}
        message={tr(
          run.isPending
            ? 'applying_changes_and_refreshing_data_2f929fed'
            : 'checking_whether_this_operation_is_available_75110126',
        )}
        className={
          fileOperation
            ? 'settings-dialog operation-dialog file-operation-dialog'
            : 'settings-dialog operation-dialog'
        }
      >
        <div className="dialog-heading">
          <Dialog.Title>
            {actions.length === 1 ? operations[action].label : tr('manage_81edf08c')}
          </Dialog.Title>
          <Dialog.Close asChild>
            <Button aria-label={tr('close_4ae50d30')}>✕</Button>
          </Dialog.Close>
        </div>
        <Dialog.Description className="muted">
          {description ??
            (fileOperation
              ? tr('specify_operation_parameters_00bcd45c')
              : tr('review_the_selected_items_and_settings_changes_are_5a8cb6d3'))}
        </Dialog.Description>
        {!fileOperation && context.length > 0 && (
          <dl className="operation-context">
            {context.map((item) => (
              <div key={item.key}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {actions.length > 1 && (
          <label className="field">
            {tr('operation_33ba2227')}
            <select
              aria-label={tr('operation_33ba2227')}
              value={action}
              disabled={run.isPending}
              onChange={(e) => {
                setAction(e.target.value)
                setParams(defaults(e.target.value))
                plan.reset()
                run.reset()
              }}
            >
              {actions.map((a) => (
                <option key={a} value={a}>
                  {operations[a].label}
                </option>
              ))}
            </select>
          </label>
        )}
        {!plan.data &&
          editable.map((f) => {
            const val = params[f.key]
            const choices =
              providedChoices?.[f.key] ??
              (f.type === 'devices' || f.type === 'device'
                ? (inv.data?.devices ?? []).map((d) => ({
                    id: d.path,
                    label: `${d.path} · ${d.model?.trim() || d.type} · ${bytes(d.size)} ${d.serial || ''}`,
                  }))
                : f.type === 'groups'
                  ? accounts.data?.groups.map((g) => ({ id: g.name, label: g.name }))
                  : f.type === 'users'
                    ? accounts.data?.users
                        .filter((u) => u.category !== 'service')
                        .map((u) => ({ id: u.username, label: u.username }))
                    : undefined)
            return (
              <label className={f.type === 'check' ? 'check' : 'field'} key={f.key}>
                {f.type === 'check' ? (
                  <>
                    <input
                      type="checkbox"
                      checked={!!val}
                      onChange={(e) => change(f.key, e.target.checked)}
                    />
                    {f.label}
                  </>
                ) : (
                  <>
                    {f.label}
                    {choices ? (
                      <select
                        aria-label={f.label}
                        multiple={f.type === 'devices' || f.type === 'groups' || f.type === 'users'}
                        value={val as string | string[]}
                        onChange={(e) =>
                          change(
                            f.key,
                            f.type !== 'devices' && f.type !== 'groups' && f.type !== 'users'
                              ? e.target.value
                              : [...e.target.selectedOptions].map((o) => o.value),
                          )
                        }
                      >
                        {(f.type === 'device' || (f.type === 'select' && providedChoices?.[f.key])) && !choices.some(c => c.id === '') && (
                          <option value="">{tr('select_9e5e9af5')}</option>
                        )}
                        {choices.map((c) => (
                          <option key={c.id} value={c.id} disabled={'disabled' in c && !!c.disabled}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    ) : f.type === 'select' ? (
                      <select
                        aria-label={f.label}
                        value={String(val)}
                        onChange={(e) => change(f.key, e.target.value)}
                      >
                        {(f.key === 'format' ? (inv.data?.formats ?? []) : f.options)?.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        aria-label={f.label}
                        type={f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : 'text'}
                        value={String(val)}
                        autoComplete="off"
                        onChange={(e) =>
                          change(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)
                        }
                      />
                    )}
                  </>
                )}
              </label>
            )
          })}
        {candidatesFor && inv.data?.devices.length === 0 && (
          <Notice>{tr('no_available_disks_of_a_suitable_size_connect_a_di_cf2a3768')}</Notice>
        )}
        {inv.error && <Notice error>{inv.error.message}</Notice>}
        {plan.error && <Notice error>{plan.error.message}</Notice>}
        {run.error && <Notice error>{run.error.message}</Notice>}
        {action === 'raid.create' && !plan.data && (
          <p className="muted small">{tr('name_1_31_latin_letters_digits_or_the_first_charac_deab57fa')}</p>
        )}
        {action === 'raid.create' && params.level === '0' && (
          <Notice>{tr('raid0_has_no_data_protection_a_single_disk_failure_cea42a12')}</Notice>
        )}
        {action === 'raid.create' && (
          <p className="muted small">
            {(() => {
              const sizes = ((params.members as string[]) || []).map(
                (p) => inv.data?.devices.find((d) => d.path === p)?.size ?? 0,
              )
              const n = sizes.length
              const factor =
                params.level === '0'
                  ? n
                  : params.level === '1'
                    ? 1
                    : params.level === '5'
                      ? n - 1
                      : params.level === '6'
                        ? n - 2
                        : n / 2
              return sizes.length && sizes.every(Boolean)
                ? tr('usable_capacity_approximately_before_formatting_30969a53', {
                    v0: bytes(Math.min(...sizes) * factor),
                  })
                : null
            })()}
          </p>
        )}

        {plan.data ? (
          <>
            <h3>{tr('confirmation_846aff70')}</h3>
            <Notice>
              {plan.data.details.map((d, i) => (
                <div key={i}>{d}</div>
              ))}
            </Notice>
            <div className="actions">
              <Button className="primary" disabled={run.isPending} onClick={() => run.mutate()}>
                {tr('confirm_0467ae4b')}
              </Button>
              <Dialog.Close asChild>
                <Button disabled={run.isPending}>{tr('cancel_555ad1c0')}</Button>
              </Dialog.Close>
            </div>
          </>
        ) : (
          <Button
            className="primary"
            disabled={
              plan.isPending || (!!candidatesFor && (inv.isPending || !!inv.error || !params.replacement))
            }
            onClick={() => plan.mutate()}
          >
            {plan.error
              ? tr('check_again_f5a9c448')
              : autoReview && editable.length === 0
                ? tr('check_operation_availability_134d9204')
                : tr('continue_3f75368a')}
          </Button>
        )}
      </DialogContent>
    </Dialog.Portal>
  )
}
export function JobsList() {
  const systemTasks = useRaidTasks()
  const [selected, setSelected] = useState<Job | null>(null)
  const q = useQueryClient()
  const data = useQuery({ queryKey: ['jobs'], queryFn: () => managed<Job[]>('jobs'), refetchInterval: 2000 })
  const cancel = useMutation({
    mutationFn: (id: string) => managed('cancel', { id }),
    onSuccess: () => void q.invalidateQueries({ queryKey: ['jobs'] }),
  })
  const names: Record<string, string> = {
    queued: tr('queued_307429dd'),
    running: tr('running_eff79c40'),
    succeeded: tr('completed_016bc923'),
    failed: tr('error_72aecd9a'),
    interrupted: tr('interrupted_4550b853'),
    cancelled: tr('cancelled_5ebee19f'),
  }
  return (
    <>
      {data.error && <Notice error>{data.error.message}</Notice>}
      {cancel.error && <Notice error>{cancel.error.message}</Notice>}
      <SystemTasks {...systemTasks} />
      <div className="jobs-list">
        {data.data?.map((j) => (
          <article className="surface" key={j.id}>
            <div className="volume-heading">
              <h3>{operations[j.action]?.label ?? j.action}</h3>
              <span
                className={`badge ${j.status === 'failed' || j.status === 'interrupted' ? 'warning' : ''}`}
              >
                {names[j.status]}
              </span>
            </div>
            <p>{j.target}</p>
            <p className="muted">{j.stage}</p>
            {typeof j.result.original === 'string' && (
              <p className="small">
                {tr('original_path_e1626da3') + ' '}
                {j.result.original}
              </p>
            )}
            {typeof j.result.path === 'string' && (
              <p className="small">
                {tr('in_trash_d8442913') + ' '}
                {j.result.path}
              </p>
            )}
            <span className="small muted">
              {j.user} · {new Date(j.created).toLocaleString(locale())}
            </span>
            <div className="job-actions">
              {j.canCancel && (
                <Button
                  title={tr('jobs.cancel')}
                  aria-label={tr('jobs.cancel')}
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(j.id)}
                >
                  <Icon path={mdiCancel} />
                </Button>
              )}
              {['failed', 'interrupted', 'cancelled'].includes(j.status) && (
                <Button
                  title={tr('jobs.inspect')}
                  aria-label={tr('jobs.inspect')}
                  onClick={() => setSelected(j)}
                >
                  <Icon path={mdiRestore} />
                </Button>
              )}
              {j.needsReview && <span className="badge warning">{tr('jobs.needsReview')}</span>}
            </div>
            {j.cancelRequested && j.status === 'running' && <p className="muted">{tr('jobs.cancelling')}</p>}
            {j.status === 'running' && !j.canCancel && !j.cancelRequested && (
              <p className="small muted">{tr('jobs.locked')}</p>
            )}
          </article>
        ))}
      </div>
      {selected && <JobRecovery job={selected} onClose={() => setSelected(null)} />}
      {data.data?.length === 0 && systemTasks.tasks.length === 0 && (
        <Notice>{tr('no_operations_yet_6c83f498')}</Notice>
      )}
    </>
  )
}

function JobRecovery({ job, onClose }: { job: Job; onClose: () => void }) {
  const q = useQueryClient()
  const [report, setReport] = useState<RecoveryReport | undefined>(job.recovery)
  const inspect = useMutation({
    mutationFn: () => managed<RecoveryReport>('recover', { id: job.id }),
    onSuccess: (value) => {
      setReport(value)
      void q.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
  const acknowledge = useMutation({
    mutationFn: () => managed('acknowledge', { id: job.id }),
    onSuccess: () => {
      void q.invalidateQueries({ queryKey: ['jobs'] })
      onClose()
    },
  })
  const started = useRef(false)
  useEffect(() => {
    if (!started.current) {
      started.current = true
      inspect.mutate()
    }
  }, [inspect])
  const busy = inspect.isPending || acknowledge.isPending
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <DialogContent className="dialog-content job-recovery" busy={busy}>
          <Dialog.Title>{tr('jobs.inspect')}</Dialog.Title>
          <Dialog.Description>
            {operations[job.action]?.label ?? job.action} · {job.target}
          </Dialog.Description>
          <p>{tr('jobs.explanation')}</p>
          {(inspect.error || acknowledge.error) && (
            <Notice error>{(inspect.error || acknowledge.error)?.message}</Notice>
          )}
          {report && (
            <>
              <p>{report.message}</p>
              <dl className="job-recovery-checks">
                {report.checks.map((check, index) => (
                  <div key={index}>
                    <dt>{tr('jobs.check.' + check.label, { defaultValue: check.label })}</dt>
                    <dd>
                      <pre>
                        {typeof check.value === 'string'
                          ? serverText(check.value)
                          : JSON.stringify(check.value, null, 2)}
                      </pre>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="small muted">{tr('jobs.snapshot')}</p>
            </>
          )}
          <div className="job-actions">
            <Button
              title={tr('jobs.refresh')}
              aria-label={tr('jobs.refresh')}
              disabled={busy}
              onClick={() => inspect.mutate()}
            >
              <Icon path={mdiRefresh} />
            </Button>
            {report?.recoveryAction && operations[report.recoveryAction] && (
              <OperationButton
                actions={[report.recoveryAction]}
                label={operations[report.recoveryAction].label}
                icon={mdiRestore}
                autoReview
              />
            )}
            {report && (
              <Link className="button" to={report.route} onClick={onClose}>
                {tr('jobs.openSection')}
              </Link>
            )}
            {report && (
              <Button
                title={tr('jobs.acknowledge')}
                aria-label={tr('jobs.acknowledge')}
                disabled={busy}
                onClick={() => acknowledge.mutate()}
              >
                <Icon path={mdiCheck} />
              </Button>
            )}
            <Button disabled={busy} onClick={onClose}>
              {tr('homes.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
