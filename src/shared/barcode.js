/**
 * Scan code-barres pour le stock mobile
 *
 *  - Détection : API Barcode Detection (Chrome / Edge Android). Sans elle
 *    (Safari, Firefox, ordinateur), saisie manuelle du code.
 *  - Résolution : GET /inventory/barcode/lookup?code=… (EAN/UPC et QR internes
 *    TIP-<id>) → produit ; 404 = code inconnu. Hors-ligne : correspondance sur
 *    les codes-barres déjà chargés dans la liste.
 *  - Produit inconnu : création via POST /products (code-barres pré-rempli),
 *    puis mouvement d'ajustement pour la quantité initiale.
 */
import api from './api'
import { normalizeInventoryItem, adjustItem, roundQty } from './inventory'

export const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code']

export function cameraAvailable() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

export function barcodeDetectorAvailable() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window && cameraAvailable()
}

/** Détecteur limité aux formats gérés par l'appareil (null si aucun). */
export async function createBarcodeDetector() {
  if (!barcodeDetectorAvailable()) return null
  let formats = BARCODE_FORMATS
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats?.()
    if (Array.isArray(supported)) formats = BARCODE_FORMATS.filter(f => supported.includes(f))
  } catch { /* liste indisponible : on tente tous les formats */ }
  if (!formats.length) return null
  try {
    return new window.BarcodeDetector({ formats })
  } catch {
    return null
  }
}

/** Code lu ou saisi : espaces retirés. Chaîne vide si inexploitable. */
export function normalizeBarcode(raw) {
  return String(raw ?? '').replace(/\s+/g, '').trim()
}

/** Le backend n'accepte que des chiffres comme code-barres produit. */
export function isNumericBarcode(code) {
  return /^\d{4,50}$/.test(code)
}

/**
 * Résout un code-barres. Renvoie :
 *  { status: 'found', item, created: false }  produit connu (item de la liste si présent)
 *  { status: 'unknown', code }                aucun produit avec ce code
 *  { status: 'offline', code }                pas de réseau et code absent de la liste
 */
export async function lookupBarcode(rawCode, items = []) {
  const code = normalizeBarcode(rawCode)
  const local = items.find(i => i.barcode && normalizeBarcode(i.barcode) === code)

  let res
  try {
    res = await api.get(`/inventory/barcode/lookup?code=${encodeURIComponent(code)}`)
  } catch (e) {
    if (e?.status === 404) return local ? { status: 'found', item: local } : { status: 'unknown', code }
    if (e?.status == null) return local ? { status: 'found', item: local } : { status: 'offline', code }
    throw e
  }

  const data = res?.data ?? res ?? {}
  const productId = data.product_id ?? data.id
  if (productId == null) return local ? { status: 'found', item: local } : { status: 'unknown', code }
  const inList = items.find(i => i.productId === String(productId) || i.id === String(productId))
  if (inList) return { status: 'found', item: inList }
  // Produit connu mais absent du stock chargé (pas encore de mouvement)
  return {
    status: 'found',
    item: normalizeInventoryItem({
      product_id: productId,
      name: data.product_name || data.name,
      sku: data.sku,
      barcode: data.barcode || code,
      unit: data.unit_abbreviation || data.unit_name,
      category: data.category_name,
      quantity: 0,
    }),
    notInList: true,
  }
}

function listFrom(res) {
  const data = res?.data ?? res
  if (Array.isArray(data)) return data
  return data?.items || data?.units || data?.tax_rates || []
}

/** Unités et taux de TVA pour le formulaire de création. */
export async function fetchProductFormOptions() {
  const [unitsRes, taxRes] = await Promise.all([
    api.get('/settings/units?limit=100'),
    api.get('/settings/tax-rates?is_active=true&limit=100'),
  ])
  const units = listFrom(unitsRes).map(u => ({
    id: String(u.id),
    label: u.abbreviation ? `${u.name} (${u.abbreviation})` : u.name,
    abbreviation: u.abbreviation || u.name,
  }))
  const taxRates = listFrom(taxRes).map(r => ({
    id: String(r.id),
    label: r.rate != null ? `${r.name} — ${Number(r.rate)} %` : r.name,
    isDefault: !!r.is_default,
  }))
  return { units, taxRates }
}

/**
 * Crée le produit puis enregistre la quantité initiale.
 * Renvoie { item, queued } (queued : quantité mise en file hors-ligne).
 */
export async function createStockProduct({ name, barcode, unitId, taxRateId, price, section = 'kitchen', quantity = 0, unit = null }) {
  const res = await api.post('/products', {
    name: name.trim(),
    barcode: normalizeBarcode(barcode) || undefined,
    unit_id: unitId,
    tax_rate_id: taxRateId,
    current_price: Number(price),
    section,
    stock_tracking_enabled: true,
  })
  const product = res?.data ?? res ?? {}
  if (res?.queued || product.id == null) {
    throw Object.assign(new Error('offline'), { offline: true })
  }
  const item = normalizeInventoryItem({
    product_id: product.id,
    name: product.name || name,
    sku: product.sku,
    barcode: product.barcode || barcode,
    unit,
    quantity: 0,
  })
  const qty = roundQty(quantity)
  let queued = false
  if (qty > 0) {
    queued = (await adjustItem(item, qty)).queued
    item.quantity = qty
  }
  return { item, queued }
}
