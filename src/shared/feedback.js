/**
 * Avis client — page publique « /feedback?table=12&est=… » ouverte par le QR
 * code affiché après le solde de la table
 *
 * Endpoint (public, sans JWT) :
 *  - POST /feedback { table, rating (1–5), comment?, establishment_id }
 *    (pas encore dans le backend, vérifié 2026-11-08)
 *
 * Le client n'est pas connecté : l'établissement voyage dans le lien (`est`).
 * Appel fetch direct, comme l'appel serveur (pas d'api.js : file hors-ligne et
 * redirection /login hors de propos ici). Un avis par table et par service.
 */
import { tableFromRoute } from './waiterCall'

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'
const SENT_KEY = 'tipsmana_feedback_sent'

export const FEEDBACK_PATH = '/feedback'
export const COMMENT_MAX = 1000
// Une table resservie plus tard dans la journée peut laisser un nouvel avis
export const RESEND_DELAY_MS = 3 * 3600 * 1000

export function feedbackUrl({ table, establishmentId }, { origin = window.location.origin, base = '/mobile/' } = {}) {
  const params = new URLSearchParams({ table: String(table) })
  if (establishmentId) params.set('est', String(establishmentId))
  return `${origin}${base.replace(/\/?$/, '/')}feedback?${params}`
}

/** { table, establishmentId } lus dans le lien (table null si absente / invalide). */
export function feedbackParamsFromRoute(route) {
  const est = [route?.query?.est, route?.query?.establishment_id]
    .map(v => String((Array.isArray(v) ? v[0] : v) ?? '').trim())
    .find(Boolean)
  return { table: tableFromRoute(route), establishmentId: est || null }
}

function readSent() {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function sentKey(table, establishmentId) {
  return `${establishmentId || '-'}:${table}`
}

/** Heure du dernier avis envoyé depuis ce téléphone pour cette table (null sinon). */
export function lastFeedbackAt(table, establishmentId, now = Date.now()) {
  const at = readSent()[sentKey(table, establishmentId)]
  return at && now - at < RESEND_DELAY_MS ? at : null
}

function rememberSent(table, establishmentId, at) {
  const all = readSent()
  for (const [k, v] of Object.entries(all)) {
    if (at - v >= RESEND_DELAY_MS) delete all[k]
  }
  all[sentKey(table, establishmentId)] = at
  try { localStorage.setItem(SENT_KEY, JSON.stringify(all)) } catch { /* mode privé */ }
}

export function isValidRating(rating) {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5
}

/**
 * Envoie l'avis. Renvoie { ok: true, at } ou { ok: false, reason } avec
 * reason ∈ invalid | already | offline | unavailable (route absente) | error.
 */
export async function submitFeedback({ table, rating, comment = '', establishmentId }, { now = Date.now(), fetchImpl = globalThis.fetch } = {}) {
  if (!table || !isValidRating(rating)) return { ok: false, reason: 'invalid' }
  if (lastFeedbackAt(table, establishmentId, now)) return { ok: false, reason: 'already' }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' }
  const body = {
    table,
    rating,
    establishment_id: establishmentId || null,
  }
  const text = String(comment || '').trim().slice(0, COMMENT_MAX)
  if (text) body.comment = text
  let res
  try {
    res = await fetchImpl(`${API_BASE}${FEEDBACK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, reason: 'offline' }
  }
  if (res.status === 404 || res.status === 405 || res.status === 501) return { ok: false, reason: 'unavailable', status: res.status }
  if (!res.ok) return { ok: false, reason: 'error', status: res.status }
  rememberSent(table, establishmentId, now)
  return { ok: true, at: now }
}
