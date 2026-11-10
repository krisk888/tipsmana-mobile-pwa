/**
 * Cuisine — commandes en attente : badge et vibration
 *
 *  - badge : nombre de bons non servis (en attente, en préparation, prêts),
 *    sur l'onglet « Cuisine » de la barre de navigation et, pour le rôle
 *    cuisine, sur l'icône de l'app (navigator.setAppBadge)
 *  - vibration à chaque nouvelle commande (rôle cuisine), même hors des
 *    écrans cuisine
 *
 * Source : GET /cash/kds/cuisine, relevé en fond par App.vue. Les écrans
 * cuisine (liste, tableau) chargent déjà les bons et les signalent ici
 * (reportKitchenOrders) : compteur à jour tout de suite, relevé de fond sauté
 * tant qu'ils sont actifs, et pas de double alerte (l'écran sonne lui-même).
 */
import { ref } from 'vue'
import { fetchKdsOrders, columnOf } from './kds'
import { setAppBadge } from './appBadge'

export const KITCHEN_POLL_MS = 20000
export const NEW_ORDER_VIBRATION = [200, 100, 200]

/** Bons non servis du poste cuisine (badge de l'onglet). */
export const kitchenPendingCount = ref(0)

let knownIds = new Set()
let primed = false
let lastReportAt = 0
let iconBadge = false

export function resetKitchenWatch() {
  knownIds = new Set()
  primed = false
  lastReportAt = 0
  iconBadge = false
  kitchenPendingCount.value = 0
}

/** Bons comptés « en attente » : tous ceux qui ne sont pas encore servis. */
export function countWaitingOrders(orders) {
  return (orders || []).filter(o => columnOf(o.status)).length
}

export function vibrateNewOrder() {
  try { navigator.vibrate?.(NEW_ORDER_VIBRATION) } catch { /* non supporté */ }
}

/**
 * Bons du poste cuisine reçus (relevé de fond ou écran cuisine) : compteur et
 * badge mis à jour. Renvoie les nouveaux bons (aucun au premier relevé) ;
 * `alert` : vibration s'il y en a.
 */
export function reportKitchenOrders(orders, { alert = false, now = Date.now() } = {}) {
  const live = (orders || []).filter(o => columnOf(o.status))
  const fresh = primed ? live.filter(o => !knownIds.has(o.id)) : []
  primed = true
  knownIds = new Set(live.map(o => o.id))
  lastReportAt = now
  kitchenPendingCount.value = live.length
  if (iconBadge) setAppBadge(live.length)
  if (alert && fresh.length) vibrateNewOrder()
  return fresh
}

/**
 * Relevé de fond. `alert` : vibrer aux nouvelles commandes ; `appBadge` :
 * compteur affiché sur l'icône de l'app. Renvoie la fonction d'arrêt.
 */
export function startKitchenWatcher({ alert = false, appBadge = false, interval = KITCHEN_POLL_MS } = {}) {
  resetKitchenWatch()
  iconBadge = appBadge
  let stopped = false
  let running = false

  async function tick() {
    if (stopped || running) return
    if (lastReportAt && Date.now() - lastReportAt < interval / 2) return // un écran cuisine vient de relever
    running = true
    try {
      const list = await fetchKdsOrders()
      if (!stopped) reportKitchenOrders(list, { alert })
    } catch { /* réseau : prochain passage */ } finally {
      running = false
    }
  }

  const timer = setInterval(tick, interval)
  tick()

  return function stop() {
    stopped = true
    clearInterval(timer)
    if (iconBadge) setAppBadge(0)
    resetKitchenWatch()
  }
}
