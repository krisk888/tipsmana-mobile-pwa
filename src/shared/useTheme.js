import { ref } from 'vue'

const STORAGE_KEY = 'tipsmana-theme'

// Ordre de cycle du toggle : dark → light → auto → dark
const CYCLE = ['dark', 'light', 'auto']

// Fenêtres horaires du mode auto : 20h–7h = sombre, 7h–20h = clair
const DARK_START_HOUR = 20
const LIGHT_START_HOUR = 7

/**
 * Préférence initiale : localStorage d'abord, sinon 'auto'.
 */
function getInitialPreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (CYCLE.includes(stored)) return stored
  } catch (e) {
    // localStorage indisponible (mode privé) → on ignore
  }
  return 'auto'
}

/** Vrai si l'heure locale est dans la fenêtre sombre (20h–7h). */
function isNight() {
  const h = new Date().getHours()
  return h >= DARK_START_HOUR || h < LIGHT_START_HOUR
}

// Préférence stockée : 'dark' | 'light' | 'auto'
const preference = ref(getInitialPreference())

// Thème effectif réellement appliqué : 'dark' | 'light' uniquement.
// En mode auto, il dépend de l'heure courante.
const theme = ref(preference.value === 'auto' ? (isNight() ? 'dark' : 'light') : preference.value)

/** Applique la classe theme-dark/theme-light sur <html> + meta theme-color. */
function applyTheme(t) {
  const root = document.documentElement
  root.classList.toggle('theme-dark', t === 'dark')
  root.classList.toggle('theme-light', t === 'light')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0f0f1a' : '#f5f5f0')
}

/** Resynchronise le thème effectif (préférence + horaire auto) et l'applique. */
function syncTheme() {
  const effective = preference.value === 'auto' ? (isNight() ? 'dark' : 'light') : preference.value
  if (theme.value !== effective) theme.value = effective
  applyTheme(effective)
}

// En mode auto, recale le thème quand on franchit 7h ou 20h
setInterval(syncTheme, 60_000)

/** À appeler au démarrage (main.js) pour éviter le flash avant le mount. */
export function initTheme() {
  syncTheme()
}

/** Cycle la préférence : dark → light → auto → dark. */
export function toggleTheme() {
  const idx = CYCLE.indexOf(preference.value)
  preference.value = CYCLE[(idx + 1) % CYCLE.length]
  try {
    localStorage.setItem(STORAGE_KEY, preference.value)
  } catch (e) {
    // localStorage indisponible → préférence seulement pour la session
  }
  syncTheme()
}

export function useTheme() {
  return { theme, preference, toggleTheme }
}

export default useTheme