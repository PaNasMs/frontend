// Who was granted a share but cannot use it over SMB yet. Pure, so the rule is unit-tested.
type Grants = { smb: boolean; readers: string[]; writers: string[] }
type SmbAccounts = Record<string, { enabled: boolean; status: string }>
type Directory = {
  users: { username: string; gid: number; category: string }[]
  groups: { name: string; gid: number; members: string[] }[]
}
// Direct grants plus the members of granted groups (@name) whose SMB password is not
// synchronized: access disabled, never enabled, or waiting for the next panel sign-in.
export function smbNotReady(share: Grants, accounts?: SmbAccounts, directory?: Directory): string[] {
  if (!share.smb || !accounts) return []
  const people = (directory?.users ?? []).filter((user) => user.category !== 'service')
  const granted = new Set<string>()
  for (const entry of [...share.readers, ...share.writers]) {
    if (!entry.startsWith('@')) {
      granted.add(entry)
      continue
    }
    const group = directory?.groups.find((item) => item.name === entry.slice(1))
    if (!group) continue
    for (const user of people)
      if (group.members.includes(user.username) || user.gid === group.gid) granted.add(user.username)
  }
  return [...granted].filter((name) => accounts[name]?.status !== 'ready').sort()
}
