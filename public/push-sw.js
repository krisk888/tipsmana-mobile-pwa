// push-sw.js — importé par le service worker généré (workbox importScripts).
// Payload attendu (JSON) : { title, body, tag?, url?, data?: { type: 'order_status', table, status } }
// - Un onglet de l'app au premier plan : on lui relaie le message (toast), sans notification système
// - Sinon : notification système ; le clic ouvre / focalise l'app sur l'URL fournie
/* eslint-env serviceworker */

const DEFAULT_URL = '/mobile/service/history'

function parsePayload(event) {
  if (!event.data) return {}
  try {
    return event.data.json()
  } catch {
    return { body: event.data.text() }
  }
}

self.addEventListener('push', (event) => {
  const payload = parsePayload(event)
  const data = payload.data || {}

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const focused = clients.find(c => c.focused || c.visibilityState === 'visible')

    if (data.type === 'order_status') {
      for (const c of clients) {
        c.postMessage({ type: 'ORDER_STATUS', tableNumber: data.table, status: data.status })
      }
      if (focused) return // le toast suffit
    }

    await self.registration.showNotification(payload.title || 'Tipsmana', {
      body: payload.body || '',
      tag: payload.tag,
      icon: payload.icon || '/mobile/icons/icon-192.png',
      badge: '/mobile/icons/icon-96.png',
      data: { url: payload.url || data.url || DEFAULT_URL },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || DEFAULT_URL

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = clients.find(c => c.url.includes('/mobile/'))
    if (existing) {
      await existing.focus()
      if ('navigate' in existing) await existing.navigate(url).catch(() => {})
      return
    }
    await self.clients.openWindow(url)
  })())
})
