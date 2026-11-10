/**
 * Modificateurs de la carte (cuisson, garniture, sauce…) proposés à la prise de commande
 *
 * Endpoint (JWT) :
 *  - GET /admin/menu/modifiers
 *      → [{ id, name, required?, min_select?, max_select? | multiple?,
 *           product_ids?, category_ids?, courses?,
 *           options: [{ id, name, price_delta? }] }]
 *    (pas encore dans le backend, vérifié 2026-11-10 : les lignes de note ont
 *    bien un champ texte `options`, mais aucune route ne décrit les modificateurs)
 *
 * Un groupe s'applique à un article :
 *  - si l'article liste ses groupes (`modifier_group_ids` du pos-menu) : ceux-là seuls
 *  - sinon s'il vise l'article (product_ids) ou sa catégorie (category_ids)
 *  - sinon, groupe sans cible : selon le service de l'article (courses)
 *
 * Replis : dernière liste reçue (localStorage, par établissement), puis les
 * groupes intégrés (cuisson / garniture / sauce sur les plats). Une route
 * absente ou interdite (rôle serveur) n'est pas redemandée pendant la session.
 *
 * Les choix sont enregistrés sur la ligne de note dans `options`
 * (« Saignant + Frites + Poivre ») et leur supplément ajouté au prix unitaire.
 */
import api from './api'
import { t } from '../i18n'
import { OPTION_GROUPS, COURSE_OPTIONS, optionLabel, unwrap, round2, toNumber, currentEstablishmentId } from './serviceOrders'

const CACHE_KEY = 'tipsmana_menu_modifiers'

// Sauce : groupe intégré en plus de cuisson / garniture (valeurs en français,
// lues par la cuisine ; libellés traduits par optionLabel)
const SAUCE_GROUP = { key: 'sauce', labelKey: 'service.optionGroups.sauce', options: ['Poivre', 'Béarnaise', 'Roquefort', 'Sans sauce'] }

/** Groupes intégrés : ceux d'OPTION_GROUPS rattachés à leur service, plus la sauce. */
export function defaultModifierGroups() {
  const byGroup = {}
  for (const [course, keys] of Object.entries(COURSE_OPTIONS)) {
    for (const k of keys) (byGroup[k] ||= []).push(course)
  }
  const groups = [...Object.values(OPTION_GROUPS), SAUCE_GROUP]
  return groups.map(g => ({
    id: g.key,
    name: null,
    labelKey: g.labelKey,
    required: false,
    min: 0,
    max: 1,
    productIds: [],
    categoryIds: [],
    courses: byGroup[g.key] || ['plat'],
    options: g.options.map(o => ({ id: o, name: o, priceDelta: 0 })),
  }))
}

function ids(list) {
  return (Array.isArray(list) ? list : []).map(v => String(v?.id ?? v)).filter(Boolean)
}

function text(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export function normalizeModifierGroup(raw) {
  if (!raw || raw.id == null) return null
  const options = (Array.isArray(raw.options) ? raw.options : Array.isArray(raw.modifiers) ? raw.modifiers : [])
    .map(o => (typeof o === 'string' ? { id: o, name: o } : o))
    .filter(o => o && (o.id != null || text(o.name)))
    .map(o => ({
      id: String(o.id ?? o.name),
      name: text(o.name) || text(o.label) || String(o.id),
      priceDelta: round2(o.price_delta ?? o.price ?? o.supplement ?? 0),
    }))
  if (!options.length) return null
  const required = !!raw.required || toNumber(raw.min_select ?? raw.min) > 0
  const min = Math.min(options.length, Math.max(required ? 1 : 0, Math.floor(toNumber(raw.min_select ?? raw.min))))
  const rawMax = raw.max_select ?? raw.max
  const max = rawMax != null && toNumber(rawMax) > 0
    ? Math.min(options.length, Math.floor(toNumber(rawMax)))
    : raw.multiple ? options.length : 1
  return {
    id: String(raw.id),
    name: text(raw.name) || text(raw.label) || String(raw.id),
    labelKey: null,
    required: min > 0,
    min,
    max: Math.max(max, min, 1),
    productIds: ids(raw.product_ids ?? raw.products),
    categoryIds: ids(raw.category_ids ?? raw.categories),
    courses: (Array.isArray(raw.courses) ? raw.courses : []).map(String),
    options,
  }
}

/** Groupes de la réponse, null si elle n'en contient pas (forme inconnue). */
export function normalizeModifierGroups(payload) {
  const data = unwrap(payload)
  const list = Array.isArray(data) ? data : Array.isArray(data?.groups) ? data.groups : Array.isArray(data?.modifiers) ? data.modifiers : null
  return list ? list.map(normalizeModifierGroup).filter(Boolean) : null
}

/** Libellé affiché d'un groupe (intégré : traduit). */
export function groupLabel(group) {
  return group.labelKey ? t(group.labelKey) : group.name
}

/** Libellé affiché d'un choix (intégré : traduit). */
export function modifierOptionLabel(group, option) {
  return group.labelKey ? optionLabel(option.name) : option.name
}

/* ═══ Chargement ═══ */

function readCache(estId) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}
    const list = all[estId || 'default']
    return Array.isArray(list) ? list : null
  } catch {
    return null
  }
}

function writeCache(estId, groups) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}
    all[estId || 'default'] = groups
    localStorage.setItem(CACHE_KEY, JSON.stringify(all))
  } catch { /* quota / mode privé */ }
}

let routeMissing = false
export function resetModifiersEndpointCache() { routeMissing = false }

/** Groupes connus sans réseau : dernière liste reçue, sinon les intégrés. */
export function cachedModifierGroups(estId = currentEstablishmentId()) {
  return readCache(estId) || defaultModifierGroups()
}

/**
 * Charge les modificateurs. Renvoie { groups, source: 'api' | 'cache' | 'default' }.
 * Une liste vide renvoyée par l'API est respectée (aucun modificateur configuré).
 */
export async function fetchModifierGroups(estId = currentEstablishmentId()) {
  const fallback = () => {
    const cached = readCache(estId)
    return cached ? { groups: cached, source: 'cache' } : { groups: defaultModifierGroups(), source: 'default' }
  }
  if (routeMissing) return fallback()
  try {
    const res = await api.get('/admin/menu/modifiers')
    const groups = normalizeModifierGroups(res)
    if (!groups) return fallback()
    if (!res?.fromCache) writeCache(estId, groups)
    return { groups, source: res?.fromCache ? 'cache' : 'api' }
  } catch (err) {
    if ([401, 403, 404, 405, 501].includes(err?.status)) routeMissing = true
    return fallback()
  }
}

/** Groupes proposés pour un article (ordre de la liste). */
export function modifierGroupsFor(product, groups) {
  if (!product) return []
  const explicit = ids(product.modifierGroupIds)
  if (explicit.length) return groups.filter(g => explicit.includes(g.id))
  const pid = String(product.id)
  const cid = product.categoryId != null ? String(product.categoryId) : null
  return groups.filter(g => {
    if (g.productIds.length || g.categoryIds.length) {
      return g.productIds.includes(pid) || (cid != null && g.categoryIds.includes(cid))
    }
    return g.courses.includes(product.course)
  })
}

/* ═══ Sélection : { [groupId]: [optionId, …] } ═══ */

/**
 * Coche / décoche un choix. Groupe à choix unique : remplace (ou décoche si
 * déjà choisi). Choix multiple : ajouté tant que le maximum n'est pas atteint.
 */
export function toggleModifier(selection, group, optionId) {
  const current = selection[group.id] || []
  let next
  if (current.includes(optionId)) next = current.filter(id => id !== optionId)
  else if (group.max === 1) next = [optionId]
  else if (current.length >= group.max) return selection
  else next = [...current, optionId]
  return { ...selection, [group.id]: next }
}

/** Groupes obligatoires pas encore remplis. */
export function missingRequired(groups, selection) {
  return groups.filter(g => (selection[g.id] || []).length < g.min)
}

/** Choix retenus, dans l'ordre des groupes puis des options. */
export function selectedModifiers(groups, selection) {
  const out = []
  for (const g of groups) {
    const chosen = selection[g.id] || []
    for (const o of g.options) {
      if (chosen.includes(o.id)) out.push({ groupId: g.id, id: o.id, name: o.name, priceDelta: o.priceDelta, builtin: !!g.labelKey })
    }
  }
  return out
}

/** Texte enregistré sur la ligne de note (« Saignant + Frites »), null si aucun choix. */
export function modifiersText(mods) {
  return mods.length ? mods.map(m => m.name).join(' + ') : null
}

export function modifiersPrice(mods) {
  return round2(mods.reduce((s, m) => s + toNumber(m.priceDelta), 0))
}

/**
 * Pastilles affichées dans les récaps (panier, note, addition client) :
 * modificateurs détaillés de la ligne si connus (avec supplément), sinon le
 * texte `options` découpé (lignes relues depuis le backend).
 */
export function modifierChips(line) {
  if (Array.isArray(line?.modifiers) && line.modifiers.length) {
    return line.modifiers.map(m => ({
      label: m.builtin === false ? m.name : optionLabel(m.name),
      priceDelta: toNumber(m.priceDelta),
    }))
  }
  if (!line?.options) return []
  return String(line.options).split(' + ').map(s => s.trim()).filter(Boolean).map(s => ({ label: optionLabel(s), priceDelta: 0 }))
}
