import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mdiImagePlus, mdiDeleteOutline } from '@mdi/js'
import { request } from '../api/client'
import { tr } from '../i18n'
import { serverText } from '../i18n/server'
import { Button, Icon, Notice, WaitingSurface } from '../shared/ui'
export function AvatarSettings() {
  const input = useRef<HTMLInputElement>(null)
  const q = useQueryClient()
  const data = useQuery({ queryKey: ['avatar'], queryFn: () => request<{ version: string }>('avatar') })
  const save = useMutation({ mutationFn: async (file: File | null) => {
    const r = await fetch('/api/v1/avatar', { method: file ? 'PUT' : 'DELETE', credentials: 'same-origin', headers: { 'X-PaNasMs-Request': '1' }, body: file })
    const result = await r.json(); if (!r.ok) throw new Error(serverText(result.error)); return result
  }, onSuccess: value => q.setQueryData(['avatar'], value) })
  return <section className="surface"><WaitingSurface busy={save.isPending}><h2>{tr('accounts.avatar')}</h2>{data.data?.version && <img className="profile-avatar-image" src={`/api/v1/avatar/image?v=${data.data.version}`} alt={tr('accounts.avatar')} />}<input type="file" ref={input} hidden accept="image/png,image/jpeg" onChange={e => { const file = e.target.files?.[0]; if (file) save.mutate(file); e.target.value = '' }} /><div className="actions"><Button title={tr('accounts.uploadAvatar')} aria-label={tr('accounts.uploadAvatar')} onClick={() => input.current?.click()}><Icon path={mdiImagePlus} /></Button><Button title={tr('accounts.removeAvatar')} aria-label={tr('accounts.removeAvatar')} disabled={!data.data?.version} onClick={() => save.mutate(null)}><Icon path={mdiDeleteOutline} /></Button></div>{save.error && <Notice error>{save.error.message}</Notice>}</WaitingSurface></section>
}
