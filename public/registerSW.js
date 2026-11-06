// registerSW.js — registration PWA compatible vite-plugin-pwa generateSW (autoUpdate)
// v2 : NE PAS unregister / NE PAS vider les caches au chargement (cassait le mode
// hors-ligne : le precache workbox était détruit à chaque chargement, puis le SW
// ré-enregistré sans cache → rafraîchissement hors-ligne KO).
// Le SW est généré par le build à dist/sw.js et servi sous /mobile/sw.js.
// autoUpdate : quand une nouvelle version est détectée (updatefound), on demande
// le SKIP_WAITING pour que le nouveau SW prenne le contrôle sans double chargement.
(async () => {
  if (!('serviceWorker' in navigator)) return

  try {
    const reg = await navigator.serviceWorker.register('/mobile/sw.js', {
      scope: '/mobile/',
      updateViaCache: 'none',
    })
    console.log('[PWA] SW registered:', reg.scope)

    // autoUpdate : pousser un SW en attente à prendre immédiatement le contrôle
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    }

    // Nouvelle version détectée pendant la session : skipWaiting dès l'install
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing
      if (!installing) return
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          installing.postMessage({ type: 'SKIP_WAITING' })
        }
      })
    })
  } catch (err) {
    console.warn('[PWA] SW registration failed (non bloquant):', err)
  }
})()
