/**
 * Mode « table en retard » — commande en cuisine depuis plus de 15 min
 *
 *  - KDS (liste et colonnes) : bon en attente / en préparation depuis > 15 min
 *    (created_at du bon) → carte en rouge pulsé + vibration
 *  - Salle (sélection de table) : note envoyée en cuisine depuis ce téléphone,
 *    ni prête ni servie, depuis > 15 min (sentAt du suivi local) → table en
 *    rouge + vibration. Le backend ne stocke pas la table sur les bons KDS
 *    (vérifié 2026-11-07) : seules les notes envoyées depuis ce téléphone sont
 *    suivies.
 *
 * Une seule vibration par bon / table : les alertes déjà données sont gardées
 * au niveau du module, revenir sur l'écran ne re-vibre pas.
 */
import { columnOf, elapsedMs, AGE_LATE } from './kds'
import { listKitchenRecords } from './serviceOrders'

export const LATE_MS = AGE_LATE * 60 * 1000
export const LATE_VIBRATION = [400, 150, 400, 150, 400]

// Au-delà, le bon n'a sans doute jamais été clôturé au KDS : plus d'alerte
const LATE_WATCH_MAX_MS = 4 * 60 * 60 * 1000

/** Bon toujours en cuisine (pas encore prêt) depuis plus de 15 min. */
export function isOrderLate(order, now = Date.now()) {
  const col = columnOf(order?.status)
  if (col !== 'pending' && col !== 'preparing') return false
  return elapsedMs(order.created_at, now) > LATE_MS
}

export function lateOrderIds(orders, now = Date.now()) {
  return (orders || []).filter(o => isOrderLate(o, now)).map(o => String(o.id))
}

/**
 * Tables en retard d'après le suivi local des envois en cuisine.
 * Renvoie Map(numéro de table → horodatage de l'envoi).
 */
export function lateTables(estId, now = Date.now(), records = listKitchenRecords(estId)) {
  const out = new Map()
  for (const rec of records) {
    if (rec.status !== 'en_cuisine' || !rec.sentAt || rec.tableNumber == null) continue
    const age = now - rec.sentAt
    if (age <= LATE_MS || age > LATE_WATCH_MAX_MS) continue
    const n = Number(rec.tableNumber)
    // Plusieurs notes sur la même table : le plus ancien envoi compte
    if (!out.has(n) || out.get(n) > rec.sentAt) out.set(n, rec.sentAt)
  }
  return out
}

export function vibrateLate() {
  try { navigator.vibrate?.(LATE_VIBRATION) } catch { /* non supporté */ }
}

/**
 * Alerte unique par identifiant. check(ids) renvoie les identifiants qui
 * viennent de passer en retard et vibre s'il y en a ; un identifiant qui n'est
 * plus en retard est oublié (il pourra re-déclencher plus tard).
 */
export function createLateAlert({ vibrate = vibrateLate } = {}) {
  const alerted = new Set()
  return {
    check(ids) {
      const current = new Set((ids || []).map(String))
      for (const id of alerted) if (!current.has(id)) alerted.delete(id)
      const fresh = [...current].filter(id => !alerted.has(id))
      fresh.forEach(id => alerted.add(id))
      if (fresh.length) vibrate()
      return fresh
    },
    reset() { alerted.clear() },
  }
}

export const kitchenLateAlert = createLateAlert()
export const tableLateAlert = createLateAlert()

/** Résumé pour l'en-tête du KDS : plus longue attente et nombre de bons en retard. */
export function waitSummary(orders, now = Date.now()) {
  let longest = 0
  let late = 0
  let waiting = 0
  for (const o of orders || []) {
    const col = columnOf(o.status)
    if (col !== 'pending' && col !== 'preparing') continue
    waiting++
    longest = Math.max(longest, elapsedMs(o.created_at, now))
    if (isOrderLate(o, now)) late++
  }
  return { waiting, late, longest }
}

/** « 17 min » pour un badge de table. */
export function lateMinutes(since, now = Date.now()) {
  return Math.max(0, Math.floor((now - since) / 60000))
}
