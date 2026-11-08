/**
 * Appel serveur — page client « /mon-add » ouverte en scannant le QR code de la table
 *
 * Endpoint (public, sans JWT) :
 *  - POST /mobile/tables/{n}/call-waiter?message=… → push au(x) serveur(s) de la table
 *    (pas encore dans le backend, vérifié 2026-11-08)
 *
 * Le client n'est pas connecté : appel fetch direct (pas d'api.js, qui mettrait
 * l'appel en file hors-ligne et redirigerait vers /login sur un 401). Un délai
 * entre deux appels identiques évite de bombarder le serveur.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'
const COOLDOWN_KEY = 'tipsmana_waiter_call'

export const CALL_COOLDOWN_MS = 60 * 1000

// `text` reste en français : c'est la donnée affichée dans la notification du serveur
export const WAITER_CALL_MESSAGES = [
  { code: 'call', icon: '🔔', labelKey: 'waiterCall.messages.call', text: 'Appel serveur' },
  { code: 'bill', icon: '🧾', labelKey: 'waiterCall.messages.bill', text: 'Addition SVP' },
  { code: 'bread', icon: '🥖', labelKey: 'waiterCall.messages.bread', text: 'Plus de pain' },
  { code: 'order', icon: '➕', labelKey: 'waiterCall.messages.order', text: 'Commande supplémentaire' },
]

export function callMessage(code) {
  return WAITER_CALL_MESSAGES.find(m => m.code === code) || WAITER_CALL_MESSAGES[0]
}

/** Numéro de table (1–999) lu dans la route : /mon-add/12, ?table=12 ou ?t=12. */
export function tableFromRoute(route) {
  // Paramètre optionnel absent du chemin : chaîne vide → on passe à la query
  const raw = [route?.params?.table, route?.query?.table, route?.query?.t]
    .map(v => String((Array.isArray(v) ? v[0] : v) ?? '').trim())
    .find(Boolean)
  const s = raw || ''
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  return n > 0 && n < 1000 ? n : null
}

export function waiterCallPath(tableNumber, message) {
  return `/mobile/tables/${encodeURIComponent(tableNumber)}/call-waiter?message=${encodeURIComponent(message)}`
}

function readCooldowns() {
  try {
    return JSON.parse(localStorage.getItem(COOLDOWN_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

/** Millisecondes avant de pouvoir relancer le même appel (0 = possible). */
export function cooldownRemaining(tableNumber, code, now = Date.now()) {
  const at = readCooldowns()[`${tableNumber}:${code}`]
  return at ? Math.max(0, at + CALL_COOLDOWN_MS - now) : 0
}

/** Heure du dernier appel envoyé pour ce message (null si aucun récent). */
export function lastCallAt(tableNumber, code, now = Date.now()) {
  return cooldownRemaining(tableNumber, code, now) ? readCooldowns()[`${tableNumber}:${code}`] : null
}

function rememberCall(tableNumber, code, at) {
  const all = readCooldowns()
  // Purge des appels expirés
  for (const [k, v] of Object.entries(all)) {
    if (v + CALL_COOLDOWN_MS < at) delete all[k]
  }
  all[`${tableNumber}:${code}`] = at
  try { localStorage.setItem(COOLDOWN_KEY, JSON.stringify(all)) } catch { /* mode privé */ }
}

/**
 * Envoie l'appel. Renvoie { ok: true, at } ou { ok: false, reason } avec
 * reason ∈ cooldown | offline | unavailable (route absente) | error.
 */
export async function callWaiter(tableNumber, code, { now = Date.now(), fetchImpl = globalThis.fetch } = {}) {
  if (cooldownRemaining(tableNumber, code, now)) return { ok: false, reason: 'cooldown' }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' }
  const msg = callMessage(code)
  let res
  try {
    res = await fetchImpl(`${API_BASE}${waiterCallPath(tableNumber, msg.text)}`, { method: 'POST' })
  } catch {
    return { ok: false, reason: 'offline' }
  }
  if (res.status === 404 || res.status === 405 || res.status === 501) return { ok: false, reason: 'unavailable', status: res.status }
  if (!res.ok) return { ok: false, reason: 'error', status: res.status }
  rememberCall(tableNumber, msg.code, now)
  return { ok: true, at: now }
}
