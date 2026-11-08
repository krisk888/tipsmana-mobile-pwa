/**
 * Badge de l'icône PWA — nombre de notifications non lues
 *
 * Compteur persisté dans IndexedDB (offlineStore, clé tipsmana_pwa_badge),
 * partagé avec le service worker (public/push-sw.js) qui l'incrémente à
 * chaque push. Remis à zéro à l'ouverture des écrans Notifications et
 * « Commandes en cours ».
 */
import { offlineStore } from './offlineStore'

export function setAppBadge(count) {
  try {
    if (count > 0) (navigator.setAppBadge || navigator.setClientBadge)?.call(navigator, count)?.catch?.(() => {})
    else (navigator.clearAppBadge || navigator.clearClientBadge)?.call(navigator)?.catch?.(() => {})
  } catch { /* badge non supporté */ }
}

// Les incréments sont chaînés : deux alertes simultanées ne lisent pas le même compteur
let badgeChain = Promise.resolve()

/** +1 sur le badge de l'icône de l'app. Renvoie le nouveau compteur. */
export function incrementOrderBadge() {
  const run = badgeChain.then(async () => {
    const count = (await offlineStore.getBadgeCount()) + 1
    await offlineStore.setBadgeCount(count)
    setAppBadge(count)
    return count
  })
  badgeChain = run.catch(() => {})
  return run
}

export function clearOrderBadge() {
  const run = badgeChain.then(async () => {
    await offlineStore.clearBadge()
    setAppBadge(0)
  })
  badgeChain = run.catch(() => {})
  return run
}

