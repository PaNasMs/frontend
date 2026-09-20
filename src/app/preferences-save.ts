import { useMutation, useQueryClient } from '@tanstack/react-query'
import { request, type Preferences } from '../api/client'
export function usePreferencesSave() {
  const query = useQueryClient()
  return useMutation({
    scope: { id: 'preferences' },
    mutationFn: async (change: (current: Preferences) => Preferences) =>
      request<Preferences>('preferences', 'PUT', change(await request<Preferences>('preferences'))),
    onSuccess: (p) => query.setQueryData(['preferences'], p),
  })
}
