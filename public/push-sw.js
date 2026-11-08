// push-sw.js — importé par le service worker généré (workbox importScripts).
// Payload attendu (JSON) : { title?, body?, tag?, url?, unread_count?, data: { type, ... } }
//  - type 'new_order'     : nouvelle commande (cuisine)        { ticket_ref?, table? }
//  - type 'order_ready'   : commande prête (salle)             { table }
//  - type 'order_status'  : changement de statut (salle)       { table, status }
//  - type 'message'       : message du serveur / de l'équipe   { from?, message? }
//  - type 'waiter_call'   : appel client depuis /mon-add       { table, message }
// - Badge de l'icône : +1 par push (ou `unread_count` s'il est fourni), compteur
//   partagé avec l'app (IndexedDB tipsmana_offline_cache / tipsmana_pwa_badge)
// - Un onglet de l'app au premier plan : on lui relaie le message (toast), sans
//   notification système (sauf appel client, toujours affiché)
// - Sinon : notification système ; le clic ouvre / focalise l'app sur l'URL fournie
/* eslint-env serviceworker */

const DEFAULT_URL = '/mobile/notifications'
const ICON = '/mobile/icons/icon-192.png'
const BADGE_ICON = '/mobile/icons/icon-96.png'

// Même base que src/shared/offlineStore.js
const DB_NAME = 'tipsmana_offline_cache'
const DB_VERSION = 1
const CACHE_STORE = 'api_cache'
const BADGE_KEY = 'tipsmana_pwa_badge'

// Libellés par défaut (le backend envoie normalement title/body déjà traduits)
const DEFAULTS = {
  new_order: { title: 'Nouvelle commande', url: '/mobile/cuisine/board' },
  order_status: { title: 'Commande', url: '/mobile/service/history' },
  message: { title: 'Message', url: DEFAULT_URL },
}

function parsePayload(event) {
  if (!event.data) return {}
  try {
    return event.data.json()
  } catch {
    return { body: event.data.text() }
  }
}

function kindOf(data) {
  const type = data.type
  if (type === 'order_ready') return 'order_status'
  if (type === 'new_order' || type === 'order_status' || type === 'waiter_call') return type
  return 'message' // 'message', 'server_message', notification générique…
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(CACHE_STORE)) req.result.createObjectStore(CACHE_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// update(count) → nouveau compteur ; renvoie la valeur enregistrée
async function updateBadge(update) {
  let count = 0
  try {
    const db = await openDb()
    count = await new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite')
      const store = tx.objectStore(CACHE_STORE)
      let next = 0
      const req = store.get(BADGE_KEY)
      req.onsuccess = () => {
        next = Math.max(0, Math.round(update(Number(req.result) || 0)))
        if (next > 0) store.put(next, BADGE_KEY)
        else store.delete(BADGE_KEY)
      }
      tx.oncomplete = () => resolve(next)
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch { /* IndexedDB indisponible : badge non persistant */ }
  try {
    if (count > 0) await self.navigator.setAppBadge?.(count)
    else await self.navigator.clearAppBadge?.()
  } catch { /* badge non supporté */ }
  return count
}

self.addEventListener('push', (event) => {
  const payload = parsePayload(event)
  const data = payload.data || {}
  const kind = kindOf(data)

  event.waitUntil((async () => {
    const unread = Number(payload.unread_count ?? data.unread_count)
    const badge = await updateBadge(c => (Number.isFinite(unread) ? unread : c + 1))

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const focused = clients.find(c => c.focused || c.visibilityState === 'visible')

    if (kind === 'order_status') {
      const status = data.status || (data.type === 'order_ready' ? 'ready' : undefined)
      for (const c of clients) {
        c.postMessage({ type: 'ORDER_STATUS', tableNumber: data.table, status, badgeHandled: true })
      }
      if (focused) return // le toast suffit
    }

    // Appel client depuis /mon-add : toujours une notification système (même app
    // ouverte), un appel par table remplace le précédent, le clic ouvre la table
    if (kind === 'waiter_call') {
      await self.registration.showNotification(payload.title || `Table ${data.table}`, {
        body: payload.body || data.message || '',
        tag: payload.tag || `waiter-call-${data.table}`,
        renotify: true,
        requireInteraction: true,
        vibrate: [200, 100, 200],
        icon: payload.icon || ICON,
        badge: BADGE_ICON,
        data: { url: payload.url || data.url || `/mobile/service/table/${data.table}` },
      })
      return
    }

    const defaults = DEFAULTS[kind] || DEFAULTS.message
    const title = payload.title || defaults.title
    const body = payload.body || data.message || ''
    const url = payload.url || data.url || defaults.url

    if (focused && kind !== 'order_status') {
      for (const c of clients) {
        c.postMessage({ type: 'PUSH_RECEIVED', kind, title, body, url, badge })
      }
      return
    }

    await self.registration.showNotification(title, {
      body,
      tag: payload.tag || (kind === 'new_order' && data.ticket_ref ? `new-order-${data.ticket_ref}` : undefined),
      renotify: kind === 'new_order',
      vibrate: kind === 'new_order' ? [300, 100, 300] : [200, 100, 200],
      icon: payload.icon || ICON,
      badge: BADGE_ICON,
      data: { url },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || DEFAULT_URL

  event.waitUntil((async () => {
    // Notification ouverte = lue
    await updateBadge(c => c - 1)
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
