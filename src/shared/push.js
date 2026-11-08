/**
 * Push notifications — abonnement Web Push (PWA)
 *
 *  - navigator.serviceWorker + PushManager requis (sinon no-op)
 *  - Clé VAPID publique : import.meta.env.VITE_VAPID_PUBLIC_KEY (le backend
 *    n'expose pas de route pour la lire, vérifié 2026-11-08)
 *  - La souscription est envoyée au backend : POST /notifications/push/subscribe
 *    { endpoint, keys: { p256dh, auth } } (upsert côté serveur), une fois par
 *    session et par établissement, puis persistée via offlineStore (PUSH_SUB_KEY)
 *  - Toute erreur est silencieuse — le push est un bonus, jamais bloquant :
 *    sans push, l'app relève les notifications toutes les 30 s (App.vue)
 *
 * Les notifications elles-mêmes sont affichées par le service worker
 * (public/push-sw.js) : nouvelle commande, commande prête, message du serveur.
 */
import api from './api'
import { offlineStore } from './offlineStore'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || null

// Message relayé par le service worker aux onglets ouverts (app au premier plan)
export const FOREGROUND_PUSH_TYPE = 'PUSH_RECEIVED'

// Établissement pour lequel la souscription a déjà été envoyée pendant cette session
let sentFor = null

export function resetPushState() {
  sentFor = null
}

// base64url → Uint8Array (format attendu par pushManager.subscribe)
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

export function pushSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window
}

/** 'granted' | 'denied' | 'default' | 'unsupported' */
export function notificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/** Corps attendu par le backend (PushSubscribeRequest). */
export function subscriptionPayload(subscription) {
  const json = typeof subscription?.toJSON === 'function' ? subscription.toJSON() : subscription
  if (!json?.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }
}

async function sendToBackend(subscription) {
  const payload = subscriptionPayload(subscription)
  if (!payload) return false
  const est = api.getEstablishmentId() || 'default'
  if (sentFor === `${est}|${payload.endpoint}`) return true
  await api.post('/notifications/push/subscribe', payload)
  sentFor = `${est}|${payload.endpoint}`
  return true
}

/**
 * Active l'abonnement push et l'enregistre côté serveur.
 * prompt=false : n'affiche pas la demande de permission (abonne seulement si
 * déjà accordée) — les rôles de salle la voient au premier envoi en cuisine.
 * Retourne true si abonné et enregistré, false sinon.
 */
export async function initPushSubscription({ prompt = true } = {}) {
  try {
    if (!pushSupported()) return false

    // Permission refusée : on ne re-demande pas (repli sur le relevé périodique)
    if (Notification.permission === 'denied') return false
    if (Notification.permission === 'default') {
      if (!prompt) return false
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return false
    }

    const reg = await navigator.serviceWorker.ready
    if (!reg.pushManager) return false

    let subscription = await reg.pushManager.getSubscription()
    if (!subscription) {
      const options = { userVisibleOnly: true }
      if (VAPID_PUBLIC_KEY) {
        options.applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      }
      subscription = await reg.pushManager.subscribe(options)
    }

    await offlineStore.setPushSubscription(subscription.toJSON())
    return await sendToBackend(subscription)
  } catch {
    return false // silencieux — push non supporté / pas de clé VAPID / erreur réseau
  }
}

/**
 * Écoute les push reçus pendant que l'app est au premier plan (le service
 * worker n'affiche alors pas de notification système et relaie le message).
 * onPush({ kind, title, body, url }). Renvoie une fonction d'arrêt.
 */
export function listenForegroundPushes(onPush) {
  const sw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : null
  if (!sw) return () => {}
  function onMessage(event) {
    const msg = event.data
    if (msg?.type === FOREGROUND_PUSH_TYPE) onPush(msg)
  }
  sw.addEventListener('message', onMessage)
  return () => sw.removeEventListener('message', onMessage)
}

export default initPushSubscription
