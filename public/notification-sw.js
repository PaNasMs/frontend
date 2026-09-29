self.addEventListener('push', event => {
  if (!event.data) return
  let message
  try { message = event.data.json() } catch { return }
  if (typeof message.title !== 'string' || typeof message.body !== 'string') return
  event.waitUntil(self.registration.showNotification(message.title, {
    body: message.body,
    tag: message.tag,
    data: { url: message.url },
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/?panel=notifications', self.location.origin)
  if (target.origin !== self.location.origin) return
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
    for (const client of windows) {
      if (new URL(client.url).origin === target.origin) {
        await client.navigate(target.href)
        return client.focus()
      }
    }
    return self.clients.openWindow(target.href)
  }))
})
