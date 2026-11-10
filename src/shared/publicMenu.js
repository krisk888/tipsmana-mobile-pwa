/**
 * Carte numérique client — page publique « /menu?table=12&est=… » ouverte par
 * le QR code posé sur la table
 *
 * Endpoint (public, sans JWT) :
 *  - GET /public/menu?est={id}&lang={fr|en|es}
 *      → { establishment_name?, categories: [{ id, name, description?, image_url?,
 *          items: [{ id, name, description?, price_ttc, image_url?, allergens? }] }] }
 *    (pas encore dans le backend, vérifié 2026-11-10 : seul /public/tickets/{id}/bill
 *    existe ; /products/pos-menu demande un JWT et ne renvoie ni description ni image)
 *
 * Replis, dans l'ordre :
 *  1. téléphone d'un membre de l'équipe connecté au même établissement → carte
 *     du pos-menu (aperçu de la page client)
 *  2. dernière carte reçue sur ce téléphone (localStorage) → affichée hors-ligne
 *
 * Le client n'est pas connecté : appel fetch direct, comme l'appel serveur et
 * l'avis client (pas d'api.js : file hors-ligne et redirection /login hors de propos).
 */
import { tableFromRoute } from './waiterCall'

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'
const CACHE_KEY = 'tipsmana_public_menu'

export const PUBLIC_MENU_PATH = '/public/menu'

export function menuUrl({ table, establishmentId } = {}, { origin = window.location.origin, base = '/mobile/' } = {}) {
  const params = new URLSearchParams()
  if (table) params.set('table', String(table))
  if (establishmentId) params.set('est', String(establishmentId))
  const qs = params.toString()
  return `${origin}${base.replace(/\/?$/, '/')}menu${qs ? `?${qs}` : ''}`
}

/** { table, establishmentId } lus dans le lien (les deux peuvent manquer). */
export function menuParamsFromRoute(route) {
  const est = [route?.query?.est, route?.query?.establishment_id]
    .map(v => String((Array.isArray(v) ? v[0] : v) ?? '').trim())
    .find(Boolean)
  return { table: tableFromRoute(route), establishmentId: est || null }
}

function text(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function price(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function imageOf(raw) {
  return text(raw?.image_url ?? raw?.imageUrl ?? raw?.image)
}

export function normalizePublicItem(raw) {
  if (!raw || raw.id == null) return null
  return {
    id: String(raw.id),
    name: text(raw.name) || text(raw.label) || '—',
    description: text(raw.description),
    price: price(raw.price_ttc ?? raw.price),
    imageUrl: imageOf(raw),
    allergens: (Array.isArray(raw.allergens) ? raw.allergens : []).map(text).filter(Boolean),
  }
}

/**
 * Catégories prêtes à afficher : articles sans id écartés, catégories vides
 * retirées, image de catégorie = la sienne ou celle du premier article illustré.
 */
export function normalizePublicMenu(payload) {
  const data = payload?.data ?? payload ?? {}
  const cats = Array.isArray(data) ? data : Array.isArray(data.categories) ? data.categories : []
  return {
    establishmentName: text(data.establishment_name) || text(data.establishment?.name),
    categories: cats
      .map((c, idx) => {
        const items = (Array.isArray(c?.items) ? c.items : []).map(normalizePublicItem).filter(Boolean)
        return {
          id: String(c?.id ?? `cat-${idx}`),
          name: text(c?.name) || '—',
          description: text(c?.description),
          imageUrl: imageOf(c) || items.find(i => i.imageUrl)?.imageUrl || null,
          items,
        }
      })
      .filter(c => c.items.length),
  }
}

/* ═══ Cache de la dernière carte reçue ═══ */

function cacheKey(establishmentId) {
  return establishmentId || '-'
}

export function readCachedMenu(establishmentId) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}
    return all[cacheKey(establishmentId)] || null
  } catch {
    return null
  }
}

function writeCachedMenu(establishmentId, lang, menu, at) {
  try {
    // Une seule carte gardée : le client ne passe pas d'un restaurant à l'autre
    localStorage.setItem(CACHE_KEY, JSON.stringify({ [cacheKey(establishmentId)]: { ...menu, lang, at } }))
  } catch { /* quota / mode privé */ }
}

/* ═══ Aperçu équipe : carte du pos-menu ═══ */

async function staffMenu(establishmentId) {
  const [{ default: api }, { fetchMenu }] = await Promise.all([import('./api'), import('./serviceOrders')])
  if (!api.getToken?.()) return null
  if (establishmentId && String(api.getEstablishmentId?.() || '') !== String(establishmentId)) return null
  const cats = await fetchMenu()
  return {
    establishmentName: null,
    categories: cats.map(c => ({
      id: c.id,
      name: c.name,
      description: null,
      imageUrl: c.items.find(i => i.imageUrl)?.imageUrl || null,
      items: c.items.map(i => ({ id: i.id, name: i.name, description: null, price: i.price, imageUrl: i.imageUrl, allergens: [] })),
    })),
  }
}

/**
 * Charge la carte. Renvoie { ok: true, menu, source: 'public' | 'staff' | 'cache', at? }
 * ou { ok: false, reason } avec reason ∈ offline | unavailable (route absente) | error.
 */
export async function fetchPublicMenu({ establishmentId, lang = 'fr' } = {}, {
  now = Date.now(),
  fetchImpl = globalThis.fetch,
  staffLoader = staffMenu,
} = {}) {
  const fromCache = (reason) => {
    const cached = readCachedMenu(establishmentId)
    return cached ? { ok: true, menu: cached, source: 'cache', at: cached.at } : { ok: false, reason }
  }
  const viaStaff = async (reason) => {
    try {
      const menu = await staffLoader(establishmentId)
      if (menu?.categories?.length) return { ok: true, menu, source: 'staff' }
    } catch { /* pas connecté / réseau : on passe au cache */ }
    return fromCache(reason)
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return fromCache('offline')

  const params = new URLSearchParams({ lang })
  if (establishmentId) params.set('est', String(establishmentId))
  let res
  try {
    res = await fetchImpl(`${API_BASE}${PUBLIC_MENU_PATH}?${params}`, { headers: { Accept: 'application/json' } })
  } catch {
    return fromCache('offline')
  }
  if (res.status === 404 || res.status === 405 || res.status === 501) return viaStaff('unavailable')
  if (!res.ok) return viaStaff('error')
  let menu
  try {
    menu = normalizePublicMenu(await res.json())
  } catch {
    return viaStaff('error')
  }
  writeCachedMenu(establishmentId, lang, menu, now)
  return { ok: true, menu, source: 'public' }
}

/** Filtre plein texte (nom, description) ; catégories sans résultat retirées. */
export function searchMenu(categories, query) {
  const q = String(query || '').trim().toLocaleLowerCase()
  if (!q) return categories
  return categories
    .map(c => ({
      ...c,
      items: c.items.filter(i => i.name.toLocaleLowerCase().includes(q) || (i.description || '').toLocaleLowerCase().includes(q)),
    }))
    .filter(c => c.items.length)
}
