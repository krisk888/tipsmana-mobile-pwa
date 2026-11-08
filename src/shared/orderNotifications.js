/**
 * Notifications de statut des commandes de table (en cuisine → prêt → servi)
 *
 * Deux sources :
 *  - Web Push : le service worker (public/push-sw.js) affiche la notification
 *    et relaie le message aux onglets ouverts (type ORDER_STATUS) → toast
 *  - Suivi local : le backend n'émet pas encore de push « statut commande »,
 *    on relève donc toutes les 15 s le statut des notes envoyées depuis ce
 *    téléphone (checkKitchenTransitions). Dès qu'un push de statut arrive, le
 *    push est réputé disponible et le relevé ralentit (filet de sécurité).
 *
 * Chaque alerte : toast + vibration, notification système si l'app est en
 * arrière-plan, et +1 sur le badge de l'icône (remis à zéro à l'ouverture de
 * l'écran « Commandes en cours »).
 *
 * La permission est demandée au premier envoi en cuisine (geste utilisateur),
 * une seule fois : un refus n'est jamais redemandé.
 */
import { checkKitchenTransitions, applyPushedStatus, normalizeRemoteStatus } from './serviceOrders'
import { initPushSubscription } from './push'
import { offlineStore } from './offlineStore'
import { t } from '../i18n'

const ASKED_KEY = 'tipsmana_notif_asked'
export const POLL_INTERVAL = 15000
export const PUSH_POLL_INTERVAL = 60000
const VIBRATION = [200, 100, 200]

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
  if (to === 'pret') return t('service.notifications.ready', { table })
  if (to === 'en_cuisine') return t('service.notifications.inKitchen', { table })
  return t('service.notifications.updated', { table })
}

function vibrate() {
  try { navigator.vibrate?.(VIBRATION) } catch { /* non supporté */ }
}

function setAppBadge(count) {
  try {
    if (count > 0) (navigator.setAppBadge || navigator.setClientBadge)?.call(navigator, count)?.catch?.(() => {})
    else (navigator.clearAppBadge || navigator.clearClientBadge)?.call(navigator)?.catch?.(() => {})
  } catch { /* badge non supporté */ }
}

// Les incréments sont chaînés : deux alertes simultanées ne lisent pas le même compteur
let badgeChain = Promise.resolve()

/** +1 sur le badge de l'icône de l'app. Renvoie le nouveau compteur. */
export function incrementOrderBadge() {
  const run = badgeChain.then(async () => {
    const count = (await offlineStore.getBadgeCount()) + 1
    await offlineStore.setBadgeCount(count)
    setAppBadge(count)
    return count
  })
  badgeChain = run.catch(() => {})
  return run
}

export function clearOrderBadge() {
  const run = badgeChain.then(async () => {
    await offlineStore.clearBadge()
    setAppBadge(0)
  })
  badgeChain = run.catch(() => {})
  return run
}

function isVisible() {
  return typeof document !== 'undefined' && document.visibilityState === 'visible'
}

/**
 * Alerte l'utilisateur d'un changement de statut : toast + vibration dans
 * l'app, badge sur l'icône, et notification système quand l'app n'est pas au
 * premier plan.
 */
export async function notifyOrderStatus(transition) {
  const message = statusMessage(transition)
  toast(message)
  vibrate()
  await incrementOrderBadge().catch(() => {})
  if (isVisible()) return
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
 * Relevé toutes les `interval` ms tant qu'aucun push de statut n'a été reçu,
 * puis toutes les `pushInterval` ms. Renvoie une fonction d'arrêt.
 */
export function startOrderStatusWatcher({ getEstId, interval = POLL_INTERVAL, pushInterval = PUSH_POLL_INTERVAL } = {}) {
  let running = false
  let stopped = false
  let pushAvailable = false

  async function tick() {
    if (running || stopped) return
    running = true
    try {
      const transitions = await checkKitchenTransitions(getEstId())
      for (const tr of transitions) await notifyOrderStatus(tr)
    } catch { /* réseau : on retentera */ } finally {
      running = false
    }
  }

  let timer = setInterval(tick, interval)

  // Le service worker a déjà affiché la notification système si l'app était
  // en arrière-plan : ici, alerte dans l'app seulement
  function onSwMessage(event) {
    const msg = event.data
    if (msg?.type !== SW_MESSAGE_TYPE) return
    applyPushedStatus(getEstId(), msg.tableNumber, msg.status)
    toast(statusMessage({ tableNumber: msg.tableNumber, to: normalizeRemoteStatus(msg.status) || msg.status }))
    vibrate()
    incrementOrderBadge().catch(() => {})
    if (!pushAvailable && !stopped) {
      pushAvailable = true
      clearInterval(timer)
      timer = setInterval(tick, pushInterval)
    }
  }

  const sw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : null
  sw?.addEventListener('message', onSwMessage)
  tick()

  return function stop() {
    stopped = true
    clearInterval(timer)
    sw?.removeEventListener('message', onSwMessage)
  }
}
