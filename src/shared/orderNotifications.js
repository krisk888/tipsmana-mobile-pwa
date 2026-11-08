/**
 * Notifications de statut des commandes de table (en cuisine → servi)
 *
 * Deux sources :
 *  - Web Push : le service worker (public/push-sw.js) affiche la notification
 *    et relaie le message aux onglets ouverts (type ORDER_STATUS) → toast
 *  - Suivi local : le backend n'émet pas encore de push « statut commande »,
 *    on relève donc périodiquement le statut KDS des bons envoyés depuis ce
 *    téléphone (checkKitchenTransitions)
 *
 * La permission est demandée au premier envoi en cuisine (geste utilisateur),
 * une seule fois : un refus n'est jamais redemandé.
 */
import { checkKitchenTransitions } from './serviceOrders'
import { initPushSubscription } from './push'
import { t } from '../i18n'

const ASKED_KEY = 'tipsmana_notif_asked'
const DEFAULT_INTERVAL = 20000

export const SW_MESSAGE_TYPE = 'ORDER_STATUS'

function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

/**
 * Demande la permission notification si elle n'a jamais été demandée.
 * Renvoie 'granted' | 'denied' | 'default' | 'unsupported'.
 */
export async function ensureNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    if (localStorage.getItem(ASKED_KEY)) return 'default'
    localStorage.setItem(ASKED_KEY, '1')
  } catch { /* mode privé : on demande quand même */ }
  let permission = 'default'
  try {
    permission = await Notification.requestPermission()
  } catch { /* navigateur ancien */ }
  // Permission accordée : abonnement Web Push (silencieux en cas d'échec)
  if (permission === 'granted') initPushSubscription()
  return permission
}

function toast(message, type = 'success') {
  if (typeof window !== 'undefined' && window.__showToast) window.__showToast(message, type)
}

async function showSystemNotification(title, options) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null
    if (reg?.showNotification) {
      await reg.showNotification(title, options)
    } else {
      new Notification(title, options)
    }
    return true
  } catch {
    return false
  }
}

export function statusMessage({ tableNumber, to }) {
  const table = tableNumber ? t('common.table', { number: tableNumber }) : t('service.notifications.order')
  if (to === 'servi') return t('service.notifications.served', { table })
  if (to === 'en_cuisine') return t('service.notifications.inKitchen', { table })
  return t('service.notifications.updated', { table })
}

/**
 * Alerte l'utilisateur d'un changement de statut : toast dans l'app, et
 * notification système quand l'app n'est pas au premier plan.
 */
export async function notifyOrderStatus(transition) {
  const message = statusMessage(transition)
  toast(message)
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return
  await showSystemNotification(t('service.notifications.title'), {
    body: message,
    tag: `order-${transition.ticketId || transition.tableNumber}`,
    icon: '/mobile/icons/icon-192.png',
    data: { url: '/mobile/service/history' },
  })
}

/**
 * Démarre le suivi des statuts. getEstId() renvoie l'établissement actif
 * (relu à chaque passage : la bascule d'établissement est prise en compte).
 * Renvoie une fonction d'arrêt.
 */
export function startOrderStatusWatcher({ getEstId, interval = DEFAULT_INTERVAL } = {}) {
  let running = false
  let stopped = false

  async function tick() {
    if (running || stopped) return
    running = true
    try {
      const transitions = await checkKitchenTransitions(getEstId())
      for (const t of transitions) await notifyOrderStatus(t)
    } catch { /* réseau : on retentera */ } finally {
      running = false
    }
  }

  function onSwMessage(event) {
    const msg = event.data
    if (msg?.type !== SW_MESSAGE_TYPE) return
    toast(statusMessage({ tableNumber: msg.tableNumber, to: msg.status }))
  }

  const sw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : null
  sw?.addEventListener('message', onSwMessage)
  const timer = setInterval(tick, interval)
  tick()

  return function stop() {
    stopped = true
    clearInterval(timer)
    sw?.removeEventListener('message', onSwMessage)
  }
}
