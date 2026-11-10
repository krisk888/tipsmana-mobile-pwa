/**
 * Tirer pour rafraîchir (plan de salle, tables du service)
 *
 * Le geste ne démarre qu'en haut de page, au doigt, et pas sur un élément
 * `ignore` (tables déplaçables du plan). Un geste surtout horizontal est
 * abandonné (défilement des onglets). Écouteurs passifs : le défilement
 * natif n'est jamais bloqué ; le « pull-to-refresh » du navigateur est coupé
 * (overscroll-behavior) le temps de l'écran pour ne pas recharger la page.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'

export const PULL_THRESHOLD = 70
export const PULL_MAX = 110
const RESISTANCE = 0.5

/** Suivi d'un geste, sans DOM : start → move… → end (vrai = rafraîchir). */
export function createPullTracker({ threshold = PULL_THRESHOLD, max = PULL_MAX } = {}) {
  let origin = null
  let distance = 0
  return {
    get active() { return origin !== null },
    get distance() { return distance },
    get armed() { return distance >= threshold },
    start(x, y) {
      origin = { x, y }
      distance = 0
    },
    /** Renvoie la distance affichée (0 si geste abandonné). */
    move(x, y) {
      if (!origin) return 0
      const dy = y - origin.y
      const dx = Math.abs(x - origin.x)
      if (dy <= 0 || (distance === 0 && dx > dy)) {
        // Vers le haut ou à l'horizontale avant tout tirage : ce n'est pas notre geste
        if (distance === 0 && (dy < 0 || dx > dy)) origin = null
        distance = 0
        return 0
      }
      distance = Math.min(max, dy * RESISTANCE)
      return distance
    },
    end() {
      const fire = origin !== null && distance >= threshold
      origin = null
      distance = 0
      return fire
    },
    cancel() {
      origin = null
      distance = 0
    },
  }
}

function atTop() {
  const el = document.scrollingElement || document.documentElement
  return (el?.scrollTop || window.scrollY || 0) <= 0
}

/**
 * onRefresh : fonction (éventuellement async) appelée quand le geste dépasse
 * le seuil. Renvoie { distance, refreshing, threshold } pour l'indicateur.
 */
export function usePullToRefresh(onRefresh, { threshold = PULL_THRESHOLD, ignore = null } = {}) {
  const distance = ref(0)
  const refreshing = ref(false)
  const tracker = createPullTracker({ threshold })
  let wasArmed = false
  let prevOverscroll = ''

  function onStart(e) {
    if (refreshing.value || e.touches.length !== 1 || !atTop()) return
    if (ignore && e.target?.closest?.(ignore)) return
    tracker.start(e.touches[0].clientX, e.touches[0].clientY)
    wasArmed = false
  }

  function onMove(e) {
    if (!tracker.active) return
    distance.value = tracker.move(e.touches[0].clientX, e.touches[0].clientY)
    if (tracker.armed && !wasArmed) {
      try { navigator.vibrate?.(10) } catch { /* non supporté */ }
    }
    wasArmed = tracker.armed
  }

  async function onEnd() {
    const fire = tracker.end()
    distance.value = 0
    if (!fire) return
    refreshing.value = true
    try {
      await onRefresh()
    } catch { /* l'écran affiche sa propre erreur */ } finally {
      refreshing.value = false
    }
  }

  onMounted(() => {
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', tracker.cancel, { passive: true })
    prevOverscroll = document.documentElement.style.overscrollBehaviorY
    document.documentElement.style.overscrollBehaviorY = 'contain'
  })

  onBeforeUnmount(() => {
    window.removeEventListener('touchstart', onStart)
    window.removeEventListener('touchmove', onMove)
    window.removeEventListener('touchend', onEnd)
    window.removeEventListener('touchcancel', tracker.cancel)
    document.documentElement.style.overscrollBehaviorY = prevOverscroll
  })

  return { distance, refreshing, threshold }
}
