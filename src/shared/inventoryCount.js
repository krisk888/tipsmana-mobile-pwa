/**
 * Inventaire complet — comptage de tous les produits depuis le mobile
 *
 *  « Démarrer le comptage » : photo des quantités théoriques, mouvements de
 *  stock gelés sur ce téléphone (adjustItem refuse tout ajustement) et session
 *  d'inventaire ouverte côté backend (POST /inventory/sessions, best effort).
 *  « Terminer » : envoi des quantités réelles et des écarts, puis dégel.
 *
 * Endpoints :
 *  - POST /inventory/count { session_id, started_at, counts: [{ product_id,
 *      theoretical_quantity, counted_quantity, variance, unit_cost, variance_value }] }
 *    (pas encore dans le backend, vérifié 2026-11-10)
 *  - Repli (routes existantes) : POST /inventory/sessions → POST
 *    /inventory/sessions/{id}/counts/bulk → PUT /inventory/sessions/{id}/complete
 *    (la validation qui crée les mouvements d'ajustement reste au back-office)
 *
 * Le backend ne gèle pas les mouvements : ventes et réceptions saisies ailleurs
 * continuent de bouger le stock théorique ; le comptage compare à la photo prise
 * au démarrage. Le comptage en cours est gardé en localStorage (reprise après
 * fermeture de l'app, saisie hors-ligne) ; terminer demande le réseau.
 */
import api from './api'

const STORAGE_KEY = 'tipsmana_inventory_count'

function round3(v) {
  return Math.round((Number(v) || 0) * 1000) / 1000
}

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100
}

function currentEst() {
  return api.getEstablishmentId?.() || null
}

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function writeAll(all) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)) } catch { /* quota / mode privé */ }
}

function estKey(estId) {
  return estId || 'default'
}

// Date UTC : le backend refuse une session_date « dans le futur » par rapport
// à son horloge (UTC) — après minuit heure de Paris, la date locale le serait
function dateOf(ts) {
  return new Date(ts).toISOString().slice(0, 10)
}

/** Comptage en cours pour l'établissement (null sinon). */
export function getActiveCount(estId = currentEst()) {
  return readAll()[estKey(estId)] || null
}

/** Vrai pendant un comptage : les ajustements de stock sont bloqués. */
export function isStockFrozen(estId = currentEst()) {
  return !!getActiveCount(estId)
}

export function saveCount(state) {
  const all = readAll()
  all[estKey(state.establishmentId)] = state
  writeAll(all)
  return state
}

function clearCount(estId) {
  const all = readAll()
  delete all[estKey(estId)]
  writeAll(all)
}

function snapshotItem(i) {
  return {
    id: String(i.id),
    productId: String(i.productId ?? i.id),
    name: i.name,
    unit: i.unit || null,
    barcode: i.barcode || null,
    sku: i.sku || null,
    theoretical: round3(i.quantity),
    unitCost: i.unitCost != null && Number.isFinite(Number(i.unitCost)) ? Number(i.unitCost) : null,
  }
}

async function createSession(now) {
  const res = await api.post('/inventory/sessions', {
    session_name: `Inventaire complet ${dateOf(now)}`,
    session_date: dateOf(now),
    session_type: 'physical_count',
    notes: 'Comptage mobile — mouvements gelés pendant le comptage',
  })
  if (res?.queued) return null
  const id = (res?.data ?? res)?.id
  return id != null ? String(id) : null
}

/**
 * Démarre le comptage sur la liste de produits chargée. La session backend
 * est facultative ici (hors-ligne : créée à la fin).
 */
export async function startCount(items, { now = Date.now(), estId = currentEst() } = {}) {
  let sessionId = null
  try {
    sessionId = await createSession(now)
  } catch { /* session créée à la fin du comptage */ }
  return saveCount({
    establishmentId: estId,
    startedAt: now,
    sessionId,
    items: items.map(snapshotItem),
    counts: {},
    scanned: {},
  })
}

/** Quantité réelle d'un produit ; null / '' efface la saisie. Renvoie false si invalide. */
export function setCounted(state, id, value, { scanned = false } = {}) {
  if (value === null || value === undefined || String(value).trim() === '') {
    delete state.counts[id]
    saveCount(state)
    return true
  }
  const n = Number(String(value).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return false
  state.counts[id] = round3(n)
  if (scanned) state.scanned[id] = true
  saveCount(state)
  return true
}

/** Produit scanné absent de la photo de départ : ajouté avec un théorique à 0. */
export function addCountItem(state, item) {
  const existing = state.items.find(i => i.id === String(item.id))
  if (existing) return existing
  const snap = { ...snapshotItem({ ...item, quantity: 0 }), added: true }
  state.items.push(snap)
  saveCount(state)
  return snap
}

export function findByBarcode(state, code) {
  const c = String(code || '').replace(/\s+/g, '')
  return c ? state.items.find(i => i.barcode && String(i.barcode).replace(/\s+/g, '') === c) || null : null
}

/** Lignes du comptage : théorique, réel (null si pas compté), écart et sa valeur. */
export function countLines(state) {
  return state.items.map(i => {
    const counted = state.counts[i.id] ?? null
    const variance = counted == null ? null : round3(counted - i.theoretical)
    return {
      ...i,
      counted,
      variance,
      varianceValue: variance == null || i.unitCost == null ? null : round2(variance * i.unitCost),
    }
  })
}

/**
 * Résumé : produits comptés, écarts (lignes comptées ≠ théorique), valeur
 * totale des écarts (signée : négative = manquant), pertes / surplus séparés.
 */
export function summarizeCount(state) {
  const lines = countLines(state)
  const counted = lines.filter(l => l.counted != null)
  const withVariance = counted.filter(l => l.variance !== 0)
  let varianceValue = 0
  let lossValue = 0
  let gainValue = 0
  for (const l of withVariance) {
    if (l.varianceValue == null) continue
    varianceValue += l.varianceValue
    if (l.varianceValue < 0) lossValue += l.varianceValue
    else gainValue += l.varianceValue
  }
  return {
    total: lines.length,
    counted: counted.length,
    notCounted: lines.length - counted.length,
    variances: withVariance.length,
    varianceValue: round2(varianceValue),
    lossValue: round2(lossValue),
    gainValue: round2(gainValue),
    // Écarts sans coût connu : non valorisés
    unvalued: withVariance.filter(l => l.varianceValue == null).length,
  }
}

export function buildCountPayload(state, now = Date.now()) {
  return {
    session_id: state.sessionId,
    started_at: new Date(state.startedAt).toISOString(),
    finished_at: new Date(now).toISOString(),
    counts: countLines(state)
      .filter(l => l.counted != null)
      .map(l => ({
        product_id: l.productId,
        theoretical_quantity: l.theoretical,
        counted_quantity: l.counted,
        variance: l.variance,
        unit_cost: l.unitCost,
        variance_value: l.varianceValue,
        barcode_scanned: !!state.scanned[l.id],
      })),
  }
}

function isMissingRoute(e) {
  return e?.status === 404 || e?.status === 405 || e?.status === 501
}

async function finishViaSession(state, payload, summary) {
  const sessionId = state.sessionId || await createSession(Date.now())
  if (!sessionId) throw new Error('session')
  state.sessionId = sessionId
  saveCount(state)
  await api.post(`/inventory/sessions/${encodeURIComponent(sessionId)}/counts/bulk`, {
    counts: payload.counts.map(c => ({
      product_id: c.product_id,
      counted_quantity: c.counted_quantity,
      barcode_scanned: c.barcode_scanned,
    })),
  })
  await api.put(`/inventory/sessions/${encodeURIComponent(sessionId)}/complete`, {
    notes: `Comptage mobile : ${summary.counted} produits, ${summary.variances} écarts (${summary.varianceValue.toFixed(2)} €)`,
  })
  return sessionId
}

/**
 * Termine le comptage : envoie les écarts puis dégèle. Renvoie
 * { summary, sessionId, via: 'count' | 'session' }. Erreur { offline: true }
 * sans réseau (le comptage reste enregistré sur le téléphone).
 */
export async function finishCount(state, { now = Date.now() } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw Object.assign(new Error('offline'), { offline: true })
  }
  const summary = summarizeCount(state)
  const payload = buildCountPayload(state, now)
  if (!payload.counts.length) throw Object.assign(new Error('empty'), { empty: true })
  let via = 'count'
  let sessionId = state.sessionId
  try {
    const res = await api.post('/inventory/count', payload)
    if (res?.queued) throw Object.assign(new Error('offline'), { offline: true })
  } catch (e) {
    if (!isMissingRoute(e)) throw e
    via = 'session'
    sessionId = await finishViaSession(state, payload, summary)
  }
  clearCount(state.establishmentId)
  return { summary, sessionId, via }
}

/** Abandonne le comptage (dégel) ; la session backend ouverte est supprimée si possible. */
export async function abandonCount(state) {
  clearCount(state.establishmentId)
  if (state.sessionId) {
    try { await api.del(`/inventory/sessions/${encodeURIComponent(state.sessionId)}`) } catch { /* reste au back-office */ }
  }
}
