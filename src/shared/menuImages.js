/**
 * Images de la carte — vignettes, galerie, cache hors-ligne
 *
 * Endpoint : GET /mobile/menu/items?with_images=true → [{ id, image_url }]
 * (pas encore dans le backend, vérifié 2026-11-08 : /products/pos-menu ne
 * renvoie pas image_url). Sans lui, la carte s'affiche avec des pictogrammes.
 *
 * Hors-ligne : le service worker sert les images en cache-first (cache
 * « menu-images », vite.config.js). warmMenuImages() les précharge dès que la
 * carte est reçue, pour que la galerie reste complète sans réseau.
 */

import api from './api'

const VIEW_KEY = 'tipsmana_menu_view'
export const MENU_VIEWS = ['list', 'gallery']
// Au-delà, le cache SW (maxEntries) évincerait les premières images
export const WARM_LIMIT = 150

let imagesEndpointMissing = false
const warmed = new Set()

export function resetMenuImagesState() {
  imagesEndpointMissing = false
  warmed.clear()
}

export function imageUrlOf(item) {
  const url = item?.image_url ?? item?.imageUrl ?? item?.image ?? null
  return typeof url === 'string' && url.trim() ? url.trim() : null
}

/** id article → image_url, depuis la réponse de /mobile/menu/items. */
export function imageMapFrom(payload) {
  const list = Array.isArray(payload) ? payload : payload?.items || payload?.data || []
  const map = {}
  for (const it of Array.isArray(list) ? list : []) {
    const url = imageUrlOf(it)
    if (it?.id != null && url) map[String(it.id)] = url
  }
  return map
}

/** Images des articles ; {} si la route n'existe pas ou ne répond pas. */
export async function fetchMenuImages() {
  if (imagesEndpointMissing) return {}
  try {
    const res = await api.get('/mobile/menu/items?with_images=true')
    return imageMapFrom(res?.data ?? res)
  } catch (e) {
    if (e?.status === 404) imagesEndpointMissing = true
    return {}
  }
}

/** Complète les catégories normalisées avec imageUrl (image du pos-menu prioritaire). */
export function applyMenuImages(categories, map) {
  return categories.map(c => ({
    ...c,
    items: c.items.map(i => ({ ...i, imageUrl: i.imageUrl || map[i.id] || null })),
  }))
}

/**
 * Précharge les images (passent par le service worker → mises en cache).
 * Une seule fois par URL et par session, en tâche de fond.
 */
export function warmMenuImages(categories, { load = defaultLoad } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0
  const urls = new Set()
  for (const c of categories) {
    for (const i of c.items) {
      if (i.imageUrl && !warmed.has(i.imageUrl) && warmed.size + urls.size < WARM_LIMIT) urls.add(i.imageUrl)
    }
  }
  for (const u of urls) {
    warmed.add(u)
    load(u)
  }
  return urls.size
}

function defaultLoad(url) {
  const run = () => { const img = new Image(); img.decoding = 'async'; img.src = url }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run)
  else setTimeout(run, 0)
}

export function getMenuView() {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    if (MENU_VIEWS.includes(v)) return v
  } catch { /* stockage indisponible */ }
  return 'list'
}

export function saveMenuView(view) {
  try { localStorage.setItem(VIEW_KEY, view) } catch { /* mode privé */ }
}
