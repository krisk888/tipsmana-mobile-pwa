/**
 * Stock mobile — liste des produits, seuils, ajustements rapides
 *
 * Endpoints demandés (pas encore dans le backend, vérifié 2026-11-08) :
 *  - GET   /inventory/items              → [{ id, name, quantity, threshold, unit }]
 *  - PATCH /inventory/items/{id}/adjust  → { delta }
 * Replis sur les routes existantes :
 *  - GET  /inventory/stock/theoretical   → stock calculé + minimum_stock_level
 *  - POST /inventory/movements           → mouvement « adjustment » (quantité signée)
 *
 * Hors-ligne, api.js met les ajustements en file ; une fois le repli détecté,
 * c'est la route de repli qui est mise en file (rejouable plus tard).
 */

import api from './api'
import { t, intlLocale } from '../i18n'
import { isStockFrozen } from './inventoryCount'

const THEORETICAL_PAGE_SIZE = 200
const THEORETICAL_MAX_PAGES = 5

let itemsEndpointMissing = false

export function resetInventoryState() {
  itemsEndpointMissing = false
}

export function usesFallback() {
  return itemsEndpointMissing
}

function num(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Arrondi d'affichage / de calcul : les stocks sont souvent en kg ou L. */
export function roundQty(v) {
  return Math.round((Number(v) || 0) * 1000) / 1000
}

export function normalizeInventoryItem(raw) {
  if (!raw) return null
  const id = raw.id ?? raw.product_id
  if (id == null) return null
  return {
    id: String(id),
    productId: String(raw.product_id ?? id),
    name: raw.name || raw.product_name || t('stock.productFallback'),
    sku: raw.sku || raw.product_sku || null,
    barcode: raw.barcode || raw.product_barcode || null,
    quantity: roundQty(num(raw.quantity ?? raw.current_stock ?? raw.theoretical_quantity) ?? 0),
    threshold: num(raw.threshold ?? raw.minimum_stock_level ?? raw.min_quantity),
    unit: raw.unit || raw.unit_symbol || raw.unit_name || null,
    category: raw.category || raw.category_name || null,
    // Coût moyen d'achat : valorisation des écarts d'inventaire
    unitCost: num(raw.unit_cost ?? raw.average_unit_cost ?? raw.cost),
  }
}

export function isLowStock(item) {
  return item.threshold != null && item.quantity < item.threshold
}

export function filterItems(items, { lowOnly = false, search = '' } = {}) {
  const q = search.trim().toLocaleLowerCase()
  return items
    .filter(i => !lowOnly || isLowStock(i))
    .filter(i => !q || i.name.toLocaleLowerCase().includes(q) || (i.sku || '').toLocaleLowerCase().includes(q))
    // Stock bas d'abord, puis ordre alphabétique
    .sort((a, b) => Number(isLowStock(b)) - Number(isLowStock(a)) || a.name.localeCompare(b.name, intlLocale()))
}

function listFrom(res) {
  const data = res?.data ?? res
  if (Array.isArray(data)) return data
  return data?.items || []
}

// Réponse groupée par section : { kitchen: {stock_levels}, dining_room: {stock_levels} }
function theoreticalLevels(res) {
  const data = res?.data ?? res ?? {}
  const sections = [data.kitchen, data.dining_room].filter(Boolean)
  return {
    levels: sections.flatMap(s => s.stock_levels || []),
    pages: Math.max(0, ...sections.map(s => Number(s.pages) || 0)),
  }
}

async function fetchTheoretical() {
  const all = []
  for (let page = 1; page <= THEORETICAL_MAX_PAGES; page++) {
    const { levels, pages } = theoreticalLevels(
      await api.get(`/inventory/stock/theoretical?page_size=${THEORETICAL_PAGE_SIZE}&page=${page}`)
    )
    all.push(...levels)
    if (page >= pages) break
  }
  // Un produit présent en cuisine et en salle : quantités cumulées
  const byId = new Map()
  for (const raw of all) {
    const item = normalizeInventoryItem(raw)
    if (!item) continue
    const prev = byId.get(item.id)
    if (prev) prev.quantity = roundQty(prev.quantity + item.quantity)
    else byId.set(item.id, item)
  }
  return [...byId.values()]
}

/** Produits en stock. Renvoie { items, fromCache, fallback }. */
export async function fetchInventoryItems() {
  if (!itemsEndpointMissing) {
    try {
      const res = await api.get('/inventory/items')
      return {
        items: listFrom(res).map(normalizeInventoryItem).filter(Boolean),
        fromCache: !!res?.fromCache,
        fallback: false,
      }
    } catch (e) {
      // Hors-ligne sans cache de /inventory/items : le repli a peut-être été mis en cache
      if (e?.status == null) {
        try {
          return { items: await fetchTheoretical(), fromCache: true, fallback: true }
        } catch { throw e }
      }
      if (e.status !== 404) throw e
      itemsEndpointMissing = true
    }
  }
  return { items: await fetchTheoretical(), fromCache: !navigator.onLine, fallback: true }
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function postMovement(item, delta) {
  return api.post('/inventory/movements', {
    product_id: item.productId,
    movement_type: 'adjustment',
    quantity: delta,
    movement_date: today(),
    notes: 'Ajustement mobile',
  })
}

/** Ajuste le stock d'un produit de `delta` (signé). Renvoie { queued }. */
export async function adjustItem(item, delta) {
  delta = roundQty(delta)
  if (!delta) return { queued: false }
  // Comptage d'inventaire en cours : aucun mouvement depuis ce téléphone
  if (isStockFrozen()) throw Object.assign(new Error(t('stock.count.frozenError')), { frozen: true })
  if (!itemsEndpointMissing) {
    try {
      const res = await api.patch(`/inventory/items/${encodeURIComponent(item.id)}/adjust`, { delta })
      return { queued: !!res?.queued }
    } catch (e) {
      if (e?.status !== 404) throw e
      itemsEndpointMissing = true
    }
  }
  const res = await postMovement(item, delta)
  return { queued: !!res?.queued }
}

/**
 * Regroupe les taps rapides (+1 +1 +1) en un seul ajustement par produit.
 *   const adj = createAdjuster({ send: adjustItem, onError, onDone })
 *   adj.push(item, +1)    → envoi après `delay` ms sans nouveau tap
 *   adj.flush()           → envoie tout de suite (sortie de page)
 */
export function createAdjuster({ send = adjustItem, delay = 700, onDone, onError } = {}) {
  const pending = new Map() // id → { item, delta, timer }

  async function sendOne(id) {
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    clearTimeout(p.timer)
    const delta = roundQty(p.delta)
    if (!delta) return
    try {
      const res = await send(p.item, delta)
      onDone?.(p.item, delta, res)
    } catch (e) {
      onError?.(p.item, delta, e)
    }
  }

  return {
    push(item, delta) {
      const p = pending.get(item.id) || { item, delta: 0, timer: null }
      p.item = item
      p.delta += delta
      clearTimeout(p.timer)
      p.timer = setTimeout(() => sendOne(item.id), delay)
      pending.set(item.id, p)
    },
    pendingDelta(id) {
      return pending.get(id)?.delta || 0
    },
    flush() {
      return Promise.all([...pending.keys()].map(sendOne))
    },
  }
}
