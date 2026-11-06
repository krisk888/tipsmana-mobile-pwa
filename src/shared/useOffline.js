/**
 * useOffline — Composable d'état offline réactif
 *
 * Exposes isOnline, pendingCount, onlineEvent (EventTarget)
 * Utilise offlineStore pour le compteur de requêtes en attente.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import offlineStore from './offlineStore'

const isOnline = ref(navigator.onLine)
const pendingCount = ref(0)
const onlineEvent = new EventTarget()

let pollInterval = null

async function refreshPendingCount() {
  try {
    const count = await offlineStore.pendingRequestCount()
    pendingCount.value = count
  } catch {
    pendingCount.value = 0
  }
}

export function useOffline() {
  onMounted(() => {
    function handleOnline() {
      isOnline.value = true
      onlineEvent.dispatchEvent(new Event('online'))
      refreshPendingCount()
    }
    function handleOffline() {
      isOnline.value = false
      onlineEvent.dispatchEvent(new Event('offline'))
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    refreshPendingCount()

    pollInterval = setInterval(refreshPendingCount, 10000)

    onUnmounted(() => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(pollInterval)
      pollInterval = null
    })
  })

  return { isOnline, pendingCount, onlineEvent }
}

export default useOffline