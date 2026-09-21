import { useDraft } from '../shared/interaction'
import { useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { useQuery } from '@tanstack/react-query'
import {
  mdiAccountPlusOutline,
  mdiAccountGroupOutline,
  mdiArrowLeft,
  mdiCheck,
  mdiDeleteOutline,
  mdiPencilOutline,
  mdiKeyPlus,
  mdiKeyChange,
  mdiFolderMoveOutline,
  mdiRefresh,
  mdiShieldAccountOutline,
  mdiToggleSwitch,
  mdiToggleSwitchOffOutline,
} from '@mdi/js'
import { request, type Accounts } from '../api/client'
import { Button, Icon, Notice } from '../shared/ui'
import { tr } from '../i18n'
import { managed, OperationButton } from './operations'
import { useRouteTab, useQueryValue } from './navigation'
import { UserSessions, UserHistory } from './user-sessions'

type Key = { id: string; type: string; fingerprint: string; comment: string }
export type Account = Accounts['users'][number] & {
  primaryGroup: string
  panel: boolean
  disabled: boolean
  expired: boolean
  ssh: boolean
  expiry: string
  minDays: number
  maxDays: number
  warnDays: number
  inactiveDays: number
  forcePasswordChange: boolean
  passwordStatus: string
  reason: string
  keys?: Key[]
  smb?: { enabled: boolean; status: string }
  keysError?: string
}
type Group = Accounts['groups'][number] & { primaryMembers: string[]; editable: boolean; system: boolean }
type Inventory = { users: Account[]; groups: Group[]; shells: string[]; sshAvailable: boolean }
const category = (value: string) => tr('accounts.category.' + value)
function Groups({
  values,
  groups,
  change,
}: {
  values: string[]
  groups: Group[]
  change: (v: string[]) => void
}) {
  return (
    <div className="user-group-picker">
      {groups.map((g) => (
        <label className="check" key={g.name}>
          <input
            type="checkbox"
            checked={values.includes(g.name)}
            onChange={(e) =>
              change(e.target.checked ? [...values, g.name] : values.filter((v) => v !== g.name))
            }
          />
          {g.name}
          {g.name === 'sudo' && <span className="small muted">{tr('accounts.sudoWarning')}</span>}
        </label>
      ))}
    </div>
  )
}
function EditAccount({ account, inventory }: { account: Account; inventory: Inventory }) {
  const edit = useDraft(
    { name: account.name, primaryGroup: account.primaryGroup, groups: account.groups },
    account.username,
  )
  const { name, primaryGroup, groups } = edit.draft
  const setName = (name: string) => edit.setDraft((v) => ({ ...v, name }))
  const setPrimary = (primaryGroup: string) => edit.setDraft((v) => ({ ...v, primaryGroup }))
  const setGroups = (groups: string[]) => edit.setDraft((v) => ({ ...v, groups }))
  return (
    <section>
      <h2>{tr('accounts.profile')}</h2>
      {edit.conflict && <Notice>{tr('ui.newData')}</Notice>}
      <div className="user-form-grid">
        <label className="field">
          {tr('display_name_403372fc')}
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label className="field">
          {tr('primary_group_5cd09a30')}
          <select value={primaryGroup} onChange={(e) => setPrimary(e.target.value)}>
            {inventory.groups.map((g) => (
              <option key={g.name}>{g.name}</option>
            ))}
          </select>
        </label>
      </div>
      <p>{tr('accounts.additionalGroups')}</p>
      <Groups values={groups} groups={inventory.groups} change={setGroups} />
      <p className="small muted">{tr('accounts.rolePolicy')}</p>
      <OperationButton
        actions={['user.edit']}
        disabled={!edit.dirty}
        onDone={() => edit.reset(edit.draft)}
        fields={[]}
        initial={{ target: account.username, name, primaryGroup, groups }}
        label={tr('accounts.save')}
        icon={mdiCheck}
        autoReview
      />
      <dl className="info-list">
        <dt>UID / GID</dt>
        <dd>
          {account.uid} / {account.gid}
        </dd>
        <dt>{tr('home_folder_f76b7ba1')}</dt>
        <dd>{account.home}</dd>
        <dt>{tr('accounts.shell')}</dt>
        <dd>{account.shell}</dd>
      </dl>
      <div className="actions">
        <OperationButton
          actions={['user.home']}
          initial={{ target: account.username }}
          fields={[{ key: 'home', label: tr('new_home_path_18188fcc') }]}
          label={tr('move_home_folder_335db758')}
          icon={mdiFolderMoveOutline}
        />
        <OperationButton
          actions={['user.delete']}
          initial={{ target: account.username }}
          fields={[
            {
              key: 'deleteHome',
              label: tr('also_delete_the_entire_home_folder_0fc4e209'),
              type: 'check',
              value: true,
            },
          ]}
          description={tr('accounts.deleteHelp', { home: account.home })}
          label={tr('delete_user_e0728517')}
          icon={mdiDeleteOutline}
        />
      </div>
    </section>
  )
}
function Security({ account, inventory }: { account: Account; inventory: Inventory }) {
  const initial = () => ({
    target: account.username,
    panel: account.panel,
    disabled: account.disabled,
    ssh: account.ssh,
    shell: inventory.shells.includes(account.shell) ? account.shell : (inventory.shells[0] ?? ''),
    expiry: account.expiry,
    minDays: account.minDays ?? 0,
    maxDays: account.maxDays ?? 99999,
    warnDays: account.warnDays ?? 7,
    inactiveDays: account.inactiveDays ?? -1,
    forcePasswordChange: account.forcePasswordChange,
  })
  const security = useDraft(initial(), account.username)
  const { draft: value, setDraft: setValue } = security
  return (
    <section>
      <h2>{tr('accounts.security')}</h2>
      {security.conflict && <Notice>{tr('ui.newData')}</Notice>}
      <p className="muted">{tr('accounts.passwordPolicy')}</p>
      <p className="small muted">{tr('ui.pendingAccessHelp')}</p>
      <div className="user-access-groups">
        {(['panel', 'ssh', 'disabled'] as const).map((key) => (
          <label className="check" key={key}>
            <input
              type="checkbox"
              checked={value[key]}
              disabled={key === 'ssh' && !inventory.sshAvailable}
              onChange={(e) => setValue({ ...value, [key]: e.target.checked })}
            />
            {tr('accounts.' + key)}
          </label>
        ))}
      </div>
      <div className="user-form-grid">
        {value.ssh && (
          <label className="field">
            {tr('accounts.shell')}
            <select value={value.shell} onChange={(e) => setValue({ ...value, shell: e.target.value })}>
              {inventory.shells.map((shell) => (
                <option key={shell}>{shell}</option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          {tr('accounts.expiry')}
          <input
            type="date"
            value={value.expiry}
            onChange={(e) => setValue({ ...value, expiry: e.target.value })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={value.forcePasswordChange}
            onChange={(e) => setValue({ ...value, forcePasswordChange: e.target.checked })}
          />
          {tr('accounts.forcePasswordChange')}
        </label>
      </div>
      <details className="user-advanced">
        <summary>{tr('accounts.advanced')}</summary>
        <div className="user-form-grid">
          {(['minDays', 'maxDays', 'warnDays', 'inactiveDays'] as const).map((key) => (
            <label className="field" key={key}>
              {tr('accounts.' + key)}
              <input
                type="number"
                min={-1}
                max={99999}
                value={value[key]}
                onChange={(e) => setValue({ ...value, [key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
        <p className="small muted">{tr('accounts.agingHelp')}</p>
        <OperationButton
          actions={['user.identity']}
          fields={[{ key: 'uid', label: 'UID', type: 'number' }]}
          initial={{ target: account.username, uid: account.uid }}
          icon={mdiPencilOutline}
          label={tr('accounts.changeUID')}
        />
      </details>
      <div className="actions">
        <OperationButton
          actions={['user.security']}
          disabled={!security.dirty}
          onDone={() => security.reset(security.draft)}
          fields={[]}
          initial={value}
          label={tr('accounts.save')}
          icon={mdiCheck}
          autoReview
        />
        <OperationButton
          actions={['user.password']}
          fields={[
            { key: 'password', label: tr('new_password_5e611d70'), type: 'password' },
            { key: 'passwordConfirm', label: tr('repeat_new_password_e32d8bb9'), type: 'password' },
            {
              key: 'forcePasswordChange',
              label: tr('accounts.forcePasswordChange'),
              type: 'check',
              value: false,
            },
          ]}
          initial={{ target: account.username }}
          label={tr('reset_password_a548434c')}
          icon={mdiKeyChange}
        />
      </div>
      <div className="user-section-heading separated-section">
        <h3>{tr('accounts.smbAccess')}</h3>
        <OperationButton
          actions={['share.account']}
          label={tr(account.smb?.enabled ? 'shares.disable' : 'shares.enable')}
          icon={account.smb?.enabled ? mdiToggleSwitch : mdiToggleSwitchOffOutline}
          initial={{ target: account.username, enabled: !account.smb?.enabled }}
          fields={[]}
          autoReview
        />
      </div>
      <p>{tr('shares.' + (account.smb?.status ?? 'disabled'))}</p>
      <p className="small muted">{tr('shares.accountHint')}</p>
      <p className="small muted">{tr('ui.immediateAccessHelp')}</p>
    </section>
  )
}
function Keys({ account }: { account: Account }) {
  return (
    <section>
      <div className="user-section-heading">
        <h2>{tr('accounts.keys')}</h2>
        <OperationButton
          actions={['user.key.add']}
          fields={[{ key: 'key', label: tr('accounts.publicKey') }]}
          initial={{ target: account.username }}
          label={tr('accounts.addKey')}
          icon={mdiKeyPlus}
        />
      </div>
      <p className="small muted">{tr('accounts.keyHelp')}</p>
      {account.keysError && <Notice error>{account.keysError}</Notice>}
      {account.keys?.map((k) => (
        <div className="user-key-row" key={k.id}>
          <div>
            <strong>{k.comment || k.type}</strong>
            <p className="mono small">{k.fingerprint}</p>
          </div>
          <OperationButton
            actions={['user.key.delete']}
            fields={[]}
            initial={{ target: account.username, keyId: k.id }}
            icon={mdiDeleteOutline}
            label={tr('accounts.deleteKey')}
            autoReview
          />
        </div>
      ))}
      {!account.keys?.length && <p className="muted">{tr('accounts.noKeys')}</p>}
    </section>
  )
}
function AccountDetails({
  username,
  inventory,
  onBack,
}: {
  username: string
  inventory: Inventory
  onBack: () => void
}) {
  const [section, setSection] = useQueryValue('section', 'profile', [
    'profile',
    'security',
    'keys',
    'sessions',
    'history',
  ])
  const data = useQuery({
    queryKey: ['account-details', username],
    queryFn: () => managed<Account>('account-details', undefined, username),
    refetchInterval: 10000,
  })
  const user = data.data
  return (
    <>
      <div className="page-heading">
        <div className="user-section-heading">
          <Button title={tr('accounts.back')} aria-label={tr('accounts.back')} onClick={onBack}>
            <Icon path={mdiArrowLeft} />
          </Button>
          <div>
            <h1>{user?.name || username}</h1>
            <p className="muted">
              {username} · {user && category(user.category)}
            </p>
          </div>
        </div>
      </div>
      {data.error && <Notice error>{data.error.message}</Notice>}
      {user &&
        (user.category === 'service' ? (
          <section className="surface">
            <p>{tr('accounts.protected')}</p>
            <dl className="info-list">
              <dt>UID / GID</dt>
              <dd>
                {user.uid} / {user.gid}
              </dd>
              <dt>{tr('home_folder_f76b7ba1')}</dt>
              <dd>{user.home}</dd>
              <dt>{tr('accounts.shell')}</dt>
              <dd>{user.shell}</dd>
              <dt>{tr('groups_1cb3d2d6')}</dt>
              <dd>{user.groups.join(', ')}</dd>
            </dl>
          </section>
        ) : (
          <Tabs.Root value={section} onValueChange={setSection}>
            <Tabs.List className="tabs">
              {['profile', 'security', 'keys', 'sessions', 'history'].map((s) => (
                <Tabs.Trigger value={s} key={s}>
                  {tr('accounts.' + s)}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <div className="surface user-details">
              <Tabs.Content value="profile">
                <EditAccount account={user} inventory={inventory} />
              </Tabs.Content>
              <Tabs.Content value="security">
                <Security account={user} inventory={inventory} />
              </Tabs.Content>
              <Tabs.Content value="keys">
                <Keys account={user} />
              </Tabs.Content>
              <Tabs.Content value="sessions">
                <UserSessions user={username} />
              </Tabs.Content>
              <Tabs.Content value="history">
                <UserHistory user={username} />
              </Tabs.Content>
            </div>
          </Tabs.Root>
        ))}
    </>
  )
}
export function Users() {
  const data = useQuery({ queryKey: ['users'], queryFn: () => request<Inventory>('users') })
  const [tab, setTab] = useRouteTab('/users', ['accounts', 'groups'], 'accounts')
  const [selected, setSelected] = useQueryValue('user')
  const [services, setServices] = useQueryValue('service', '0', ['0', '1'])
  const [search, setSearch] = useState('')
  if (selected && data.data)
    return <AccountDetails username={selected} inventory={data.data} onBack={() => setSelected('')} />
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{tr('users_and_groups_37ba925b')}</h1>
          <p className="muted">{tr('linux_system_accounts_95294f0c')}</p>
        </div>
        <div className="actions">
          <OperationButton
            actions={[tab === 'accounts' ? 'user.create' : 'group.create']}
            label={tr(tab === 'accounts' ? 'create_user_40516a2e' : 'create_group_305f4725')}
            icon={tab === 'accounts' ? mdiAccountPlusOutline : mdiAccountGroupOutline}
            choices={{
              primaryGroup: [
                { id: '', label: tr('accounts.privateGroup') },
                ...(data.data?.groups ?? []).map((g) => ({ id: g.name, label: g.name })),
              ],
            }}
          />
          <Button
            title={tr('refresh_c2f668e5')}
            aria-label={tr('refresh_c2f668e5')}
            onClick={() => void data.refetch()}
          >
            <Icon path={mdiRefresh} />
          </Button>
        </div>
      </div>
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="tabs">
          <Tabs.Trigger value="accounts">{tr('users_0f0b8f55')}</Tabs.Trigger>
          <Tabs.Trigger value="groups">{tr('groups_1cb3d2d6')}</Tabs.Trigger>
        </Tabs.List>
        <div className="user-filters">
          <input
            aria-label={tr('accounts.filter')}
            placeholder={tr('accounts.filter')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={services === '1'}
              onChange={(e) => setServices(e.target.checked ? '1' : '0')}
            />
            {tr('accounts.showSystem')}
          </label>
        </div>
        {data.error && <Notice error>{data.error.message}</Notice>}
        <Tabs.Content value="accounts">
          <div className="user-card-grid">
            {data.data?.users
              .filter(
                (u) =>
                  (services === '1' || u.category !== 'service') &&
                  `${u.username} ${u.name}`.toLowerCase().includes(search.toLowerCase()),
              )
              .map((u) => (
                <button
                  className="surface user-card"
                  key={u.username}
                  onClick={() => setSelected(u.username)}
                >
                  <Icon path={mdiShieldAccountOutline} />
                  <div>
                    <strong>{u.name || u.username}</strong>
                    <p className="muted">{u.username}</p>
                    <span className="small">{category(u.category)}</span>
                  </div>
                  <span className={`badge ${u.disabled || u.expired ? 'warning' : ''}`}>
                    {u.disabled
                      ? tr('accounts.disabledState')
                      : u.expired
                        ? tr('accounts.expiredState')
                        : u.passwordStatus === 'locked'
                          ? tr('accounts.lockedPassword')
                          : u.panel
                            ? tr('accounts.panelEnabled')
                            : tr('accounts.panelDisabled')}
                  </span>
                </button>
              ))}
          </div>
        </Tabs.Content>
        <Tabs.Content value="groups">
          <div className="user-card-grid">
            {data.data?.groups
              .filter((g) => (services === '1' || !g.system || g.name === 'sudo') && g.name.includes(search))
              .map((g) => (
                <article className="surface user-group-card" key={g.name}>
                  <div className="user-section-heading">
                    <h2>{g.name}</h2>
                    <span className="small muted">GID {g.gid}</span>
                    <div className="actions">
                      {g.editable && (
                        <OperationButton
                          actions={['group.edit']}
                          fields={[{ key: 'members', label: tr('members_fcb848e4'), type: 'users' }]}
                          initial={{ target: g.name, members: g.members }}
                          choices={{
                            members: (data.data?.users ?? [])
                              .filter((u) => u.category !== 'service')
                              .map((u) => ({
                                id: u.username,
                                label:
                                  u.username +
                                  (g.primaryMembers.includes(u.username)
                                    ? ` · ${tr('accounts.primary')}`
                                    : ''),
                                disabled: false,
                              })),
                          }}
                          label={tr('edit_group_members_ad891d65')}
                          icon={mdiPencilOutline}
                        />
                      )}
                      {g.editable && !g.system && (
                        <OperationButton
                          actions={['group.delete']}
                          fields={[]}
                          initial={{ target: g.name }}
                          label={tr('delete_group_05b970e6')}
                          icon={mdiDeleteOutline}
                          autoReview
                        />
                      )}
                    </div>
                  </div>
                  <p>{g.members.join(', ') || tr('accounts.noMembers')}</p>
                  {g.name === 'sudo' && <p className="small muted">{tr('accounts.sudoWarning')}</p>}
                  {g.system && <span className="small muted">{tr('accounts.systemGroup')}</span>}
                </article>
              ))}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </>
  )
}
