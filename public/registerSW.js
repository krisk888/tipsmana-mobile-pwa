// registerSW.js — auto-update PWA version forcée
// Unregister tout SW existant d'abord, puis register le nouveau
// Évite les conflits entre versions et les pages cassées après déploiement
(async () => {
  if (!('serviceWorker' in navigator)) return

  // 1. Unregister tout SW existant sous /mobile/
  const existing = await navigator.serviceWorker.getRegistration('/mobile/')
  if (existing) {
    // Forcer l'ancien SW à libérer les clients
    if (existing.active) {
      existing.active.postMessage({ type: 'SKIP_WAITING' })
    }
    await existing.unregister()
  }

  // 2. Forcer le reload complet des caches
  if (window.caches) {
    const keys = await caches.keys()
    await Promise.all(keys.map(k => caches.delete(k)))
  }

  // 3. Register le nouveau SW
  try {
    const reg = await navigator.serviceWorker.register('/mobile/sw.js', { scope: '/mobile/', updateViaCache: 'none' })
    console.log('SW registered:', reg.scope)

    // 4. Si le nouveau SW est en attente, le faire prendre le contrôle
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
  } catch (err) {
    console.warn('SW registration failed (non bloquant):', err)
  }
})()