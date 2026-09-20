import { WaitingOverlay } from '../shared/ui'
import { serverText } from '../i18n/server'
import { tr } from '../i18n/index'
import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mdiImagePlus, mdiRestore } from '@mdi/js'
import { request } from '../api/client'
import { Button, Icon, Notice } from '../shared/ui'
type Wallpaper = {
  version: string
}
export const useWallpaper = (enabled = true) =>
  useQuery({
    enabled,
    queryKey: ['wallpaper'],
    queryFn: () => request<Wallpaper>('wallpaper'),
  })
export const wallpaperURL = (version: string) => `/api/v1/wallpaper/image?v=${encodeURIComponent(version)}`
export function WallpaperSettings() {
  const wallpaper = useWallpaper()
  const q = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const save = useMutation({
    mutationFn: async (file: File | null) => {
      if (!file) return request<Wallpaper>('wallpaper', 'DELETE')
      if (file.size > 8 * 1024 * 1024) throw Error(tr('the_image_must_not_exceed_8_mib_f465a5bc'))
      const response = await fetch('/api/v1/wallpaper', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-PaNasMs-Request': '1' },
        body: file,
      })
      const body = await response.json()
      if (!response.ok) throw Error(serverText(body.error ?? tr('could_not_upload_wallpaper_735ee215')))
      return body as Wallpaper
    },
    onSuccess: (data) => q.setQueryData(['wallpaper'], data),
  })
  return (
    <section className="wallpaper-settings" aria-label={tr('desktop_wallpaper_e5d749c9')}>
      <span className="small muted">{tr('wallpaper_b59390bb')}</span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png"
        hidden
        aria-label={tr('upload_desktop_wallpaper_69ea467a')}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) save.mutate(file)
          e.target.value = ''
        }}
      />
      <div className="actions">
        <Button
          title={tr('upload_wallpaper_jpeg_or_png_up_to_8_mib_applied_i_b442ce4b')}
          aria-label={tr('upload_image_00a1df08')}
          disabled={save.isPending}
          onClick={() => input.current?.click()}
        >
          <Icon path={mdiImagePlus} />
        </Button>
        <Button
          title={tr('restore_default_background_77567c86')}
          aria-label={tr('restore_default_background_77567c86')}
          disabled={save.isPending || !wallpaper.data?.version}
          onClick={() => save.mutate(null)}
        >
          <Icon path={mdiRestore} />
        </Button>
      </div>
      {save.isPending && <WaitingOverlay message={tr('uploading_wallpaper_3c5d1a43')} />}
      {(save.error || wallpaper.error) && <Notice error>{(save.error || wallpaper.error)?.message}</Notice>}
    </section>
  )
}
