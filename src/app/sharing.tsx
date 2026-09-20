import { tr } from '../i18n/index'
import { useQuery } from '@tanstack/react-query'
import { mdiShareVariant } from '@mdi/js'
import { managed, OperationButton } from './operations'
import { Notice } from '../shared/ui'
import { registerModule } from './module-registry'
export function SharingPage() {
  const data = useQuery({
    queryKey: ['nfs'],
    queryFn: () =>
      managed<{
        exports: {
          path: string
          clients: string[]
          readOnly: boolean
        }[]
      }>('nfs'),
    refetchInterval: 10000,
  })
  return (
    <>
      <div className="page-heading">
        <h1>{tr('nfs_shares_dbb5fb17')}</h1>
        <OperationButton label={tr('share_folder_da61fdcc')} actions={['nfs.export']} />
      </div>
      <p className="muted">{tr('access_is_restricted_to_the_specified_clients_file_652328fb')}</p>
      {data.error && <Notice error>{data.error.message}</Notice>}
      {data.data?.exports.map((e) => (
        <article className="surface" key={e.path}>
          <h2>{e.path}</h2>
          <p>
            {e.clients.join(', ')} · {e.readOnly ? tr('read_only_c5eb2661') : tr('read_and_write_823409cc')}
          </p>
          <OperationButton
            actions={['nfs.export', 'nfs.export-remove']}
            initial={{ target: e.path, clients: e.clients.join(','), readOnly: e.readOnly }}
          />
        </article>
      ))}
      {data.data?.exports.length === 0 && <Notice>{tr('no_folders_shared_yet_0db807d5')}</Notice>}
    </>
  )
}
registerModule({
  id: 'sharing',
  title: tr('shared_folders_5800977d'),
  path: '/sharing',
  icon: mdiShareVariant,
  component: SharingPage,
})
