import { ref, readonly } from 'vue'

/**
 * i18n minimal maison : un dossier par langue (locales/<lang>/<namespace>.json),
 * clés "namespace.cle.sous_cle". Les catalogues sont chargés à la demande pour
 * ne pas alourdir le bundle initial, en deux chunks par langue :
 *  - locales/<lang>.core.js : navigation, bandeaux, connexion — attendu avant le mount
 *  - locales/<lang>.full.js : tous les écrans — chargé en arrière-plan, attendu par
 *    le routeur (en parallèle du chunk de la route, donc sans attente en plus)
 *
 *   t('service.tables.title')
 *   t('common.items', { count: 3 })   → "un article | {count} articles"
 */

export const LOCALES = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
]
export const DEFAULT_LOCALE = 'fr'
export const LOCALE_KEY = 'tipsmana_locale'

const SUPPORTED = LOCALES.map(l => l.code)

// locales/fr.core.js → loaders.fr.core
const loaders = {}
for (const [path, load] of Object.entries(import.meta.glob('./locales/*.{core,full}.js', { import: 'default' }))) {
  const [lang, tier] = path.slice('./locales/'.length, -'.js'.length).split('.')
  ;(loaders[lang] ||= {})[tier] = load
}

const messages = {}
const pending = {}
const locale = ref(DEFAULT_LOCALE)
// Incrémenté à chaque catalogue reçu : t() le lit, les vues se re-rendent
const version = ref(0)
export const currentLocale = readonly(locale)

export function isSupported(code) {
  return SUPPORTED.includes(code)
}

export function getSavedLocale() {
  try {
    const saved = localStorage.getItem(LOCALE_KEY)
    if (isSupported(saved)) return saved
  } catch { /* stockage indisponible */ }
  return DEFAULT_LOCALE
}

/** Vrai si l'utilisateur a déjà choisi une langue sur ce téléphone. */
export function hasSavedLocale() {
  try {
    return isSupported(localStorage.getItem(LOCALE_KEY))
  } catch {
    return false
  }
}

/**
 * Langue du navigateur parmi celles gérées ("en-US" → "en"), français sinon.
 * Pour les pages client (carte numérique) ouvertes sans connexion.
 */
export function detectBrowserLocale(languages = typeof navigator !== 'undefined'
  ? (navigator.languages?.length ? navigator.languages : [navigator.language])
  : []) {
  for (const tag of languages || []) {
    const code = String(tag || '').toLowerCase().split(/[-_]/)[0]
    if (isSupported(code)) return code
  }
  return DEFAULT_LOCALE
}

/** Enregistre un catalogue (utilisé par le chargeur et par les tests). */
export function registerMessages(lang, catalog) {
  messages[lang] = { ...(messages[lang] || {}), ...catalog }
  version.value++
}

function loadTier(lang, tier) {
  const key = `${lang}.${tier}`
  if (!pending[key]) {
    const load = loaders[lang]?.[tier]
    pending[key] = (load ? load() : Promise.resolve({}))
      .then(catalog => registerMessages(lang, catalog))
      .catch((e) => { delete pending[key]; throw e })
  }
  return pending[key]
}

/** Charge le catalogue de base (core) ou complet (core + écrans) d'une langue. */
function ensureLoaded(lang, { full = true } = {}) {
  return full
    ? Promise.all([loadTier(lang, 'core'), loadTier(lang, 'full')])
    : loadTier(lang, 'core')
}

/** Résout quand les textes de tous les écrans de la langue active sont chargés. */
export function i18nReady() {
  return ensureLoaded(locale.value)
}

/** Charge la langue puis l'active ; mémorise le choix en localStorage. */
export async function setLocale(code, { persist = true, full = true } = {}) {
  const lang = isSupported(code) ? code : DEFAULT_LOCALE
  await ensureLoaded(lang, { full })
  locale.value = lang
  if (typeof document !== 'undefined') document.documentElement.lang = lang
  if (persist) {
    try { localStorage.setItem(LOCALE_KEY, lang) } catch { /* mode privé */ }
  }
  return lang
}

/**
 * Au démarrage : langue mémorisée (ou français), sans réécrire le stockage.
 * Seul le catalogue de base est attendu ; celui des écrans part en parallèle.
 */
export async function initI18n() {
  const lang = await setLocale(getSavedLocale(), { persist: false, full: false })
  i18nReady().catch(() => {})
  return lang
}

function lookup(lang, key) {
  let node = messages[lang]
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

function interpolate(str, params) {
  return str.replace(/\{(\w+)\}/g, (m, name) => (params[name] ?? m))
}

/**
 * Traduit une clé. Repli : français, puis la clé elle-même.
 * Pluriel : "zéro | un | {count} plusieurs" ou "un | {count} plusieurs" selon params.count.
 */
export function t(key, params = {}) {
  void version.value
  let str = lookup(locale.value, key) ?? lookup(DEFAULT_LOCALE, key)
  if (str == null) return key
  if (str.includes(' | ') && params.count != null) {
    const forms = str.split(' | ')
    const n = Math.abs(Number(params.count))
    if (forms.length >= 3) str = forms[n === 0 ? 0 : n === 1 ? 1 : 2]
    // Le français met le singulier à 0 et 1, l'anglais/espagnol seulement à 1
    else str = forms[(locale.value === 'fr' ? n <= 1 : n === 1) ? 0 : 1]
  }
  return interpolate(str, params)
}

/** Vrai si la clé existe dans la langue active (ou en français). */
export function te(key) {
  void version.value
  return (lookup(locale.value, key) ?? lookup(DEFAULT_LOCALE, key)) != null
}

/** Locale BCP 47 pour Intl (dates, montants). */
export function intlLocale() {
  return { fr: 'fr-FR', en: 'en-GB', es: 'es-ES' }[locale.value] || 'fr-FR'
}

/**
 * Composable : `const { t } = useI18n()`. Le template relit `locale` à
 * chaque rendu via t(), donc le changement de langue est réactif.
 */
export function useI18n() {
  return { t, te, locale: currentLocale, setLocale, intlLocale }
}

/** Plugin : expose $t dans les templates. */
export default {
  install(app) {
    app.config.globalProperties.$t = t
    app.config.globalProperties.$te = te
  },
}
