import { ref } from 'vue'

const STORAGE_KEY = 'tipsmana-theme'

/**
 * Thème initial : localStorage d'abord, sinon préférence système, sinon dark.
 */
function getInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch (e) {
    // localStorage indisponible (mode privé) → on ignore
  }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'dark'
}

const theme = ref(getInitialTheme())

/** Applique la classe theme-dark/theme-light sur <html> + meta theme-color. */
function applyTheme(t) {
  const root = document.documentElement
  root.classList.toggle('theme-dark', t === 'dark')
  root.classList.toggle('theme-light', t === 'light')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0f0f1a' : '#f5f5f0')
}

/** À appeler au démarrage (main.js) pour éviter le flash avant le mount. */
export function initTheme() {
  applyTheme(theme.value)
}

export function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  try {
    localStorage.setItem(STORAGE_KEY, theme.value)
  } catch (e) {
    // localStorage indisponible → thème seulement pour la session
  }
  applyTheme(theme.value)
}

export function useTheme() {
  return { theme, toggleTheme }
}

export default useTheme
