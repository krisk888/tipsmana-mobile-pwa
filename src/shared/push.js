/**
 * Push notifications — abonnement Web Push (PWA)
 *
 * S'abonne silencieusement quand le navigateur supporte le Web Push :
 *  - navigator.serviceWorker + PushManager requis (sinon no-op)
 *  - VAPID optionnel : import.meta.env.VITE_VAPID_PUBLIC_KEY
 *    (fallback : subscribe sans applicationServerKey)
 *  - La souscription est persistée via offlineStore (PUSH_SUB_KEY)
 *  - Toute erreur est silencieuse — le push est un bonus, jamais bloquant
 */
import { offlineStore } from './offlineStore'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || null

// base64url → Uint8Array (format attendu par pushManager.subscribe)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/**
 * Active l'abonnement push (une seule fois par session côté appelant).
 * prompt=false : n'affiche pas la demande de permission (abonne seulement si
 * déjà accordée) — les rôles de salle la voient au premier envoi en cuisine.
 * Retourne true si abonné (existant ou nouveau), false sinon.
 */
export async function initPushSubscription({ prompt = true } = {}) {
  try {
    if (typeof navigator === 'undefined') return false
    if (!('serviceWorker' in navigator)) return false
    if (!('PushManager' in window)) return false

    // Déjà souscrit et persisté : rien à faire (ne re-demande pas la permission)
    if (await offlineStore.getPushSubscription()) return true

    const reg = await navigator.serviceWorker.ready
    if (!reg.pushManager) return false

    let subscription = await reg.pushManager.getSubscription()
    if (!subscription) {
      // Permission refusée : on ne re-demande pas
      if (Notification.permission === 'denied') return false
      if (Notification.permission === 'default') {
        if (!prompt) return false
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return false
      }
      const options = { userVisibleOnly: true }
      if (VAPID_PUBLIC_KEY) {
        options.applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      }
      subscription = await reg.pushManager.subscribe(options)
    }

    await offlineStore.setPushSubscription(subscription.toJSON())
    return true
  } catch {
    return false // silencieux — push non supporté / erreur réseau
  }
}

export default initPushSubscription