import { localizeResponse } from '../i18n/server'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
export function useEvents(enabled: boolean) {
  const query = useQueryClient()
  const [state, setState] = useState<'connecting' | 'online' | 'offline'>('connecting')
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let socket: WebSocket | undefined
    let timer: ReturnType<typeof setTimeout>
    let delay = 1000
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/v1/events`,
      )
      socket.onopen = () => {
        setState('online')
        delay = 1000
        void query.invalidateQueries()
      }
      socket.onmessage = (e) => {
        try {
          const event = localizeResponse(JSON.parse(e.data)) as { type: string; data?: unknown }
          if (event.type === 'metrics' && event.data) query.setQueryData(['metrics'], event.data)
          if (event.type === 'cooling' && event.data) query.setQueryData(['cooling'], event.data)
          if (event.type === 'cooling.unavailable')
            query.setQueryData(['cooling'], (old: Record<string, unknown> | undefined) =>
              old ? { ...old, available: false } : old,
            )
          if (event.type === 'metrics.unavailable') void query.invalidateQueries({ queryKey: ['metrics'] })
          if (event.type === 'storage.changed') {
            void query.invalidateQueries({ queryKey: ['storage'] })
            void query.invalidateQueries({ queryKey: ['management-storage'] })
          }
          if (event.type === 'notifications.changed')
            void query.invalidateQueries({ queryKey: ['notifications'] })
          if (event.type === 'jobs.changed') {
            for (const key of [
              'jobs',
              'notifications',
              'users',
              'storage',
              'management-storage',
              'services',
              'files',
              'updates',
              'nfs',
              'network',
            ])
              void query.invalidateQueries({ queryKey: [key] })
          }
          if (event.type === 'resync') void query.invalidateQueries()
        } catch {
          socket?.close()
        }
      }
      socket.onclose = (e) => {
        if (stopped) return
        setState('offline')
        if (e.code === 1008) {
          query.clear()
          location.assign('/')
          return
        }
        timer = setTimeout(connect, delay)
        delay = Math.min(delay * 2, 15000)
      }
      socket.onerror = () => socket?.close()
    }
    connect()
    return () => {
      stopped = true
      clearTimeout(timer)
      socket?.close()
    }
  }, [enabled, query])
  return state
}
