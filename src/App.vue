<template>
  <div id="app">
    <!-- Login screen: no nav -->
    <router-view v-if="isLoginPage" />

    <!-- Main app with bottom nav -->
    <div v-else class="app-layout">
      <main class="app-content">
        <router-view />
      </main>

      <nav class="bottom-nav">
        <router-link
          v-for="tab in tabs"
          :key="tab.path"
          :to="tab.path"
          class="nav-item"
          :class="{ active: $route.path.startsWith(tab.path) }"
        >
          <TipsIcon :name="tab.iconName" :size="22" class="nav-icon" />
          <span class="nav-label">{{ tab.label }}</span>
        </router-link>
        <router-link to="/notifications" class="nav-item" :class="{ active: $route.path === '/notifications' }">
          <span class="nav-icon notif-icon">
            🔔
            <span v-if="notifCount > 0" class="notif-badge">{{ notifCount > 99 ? '99+' : notifCount }}</span>
          </span>
          <span class="nav-label">Alertes</span>
        </router-link>
        <router-link to="/profile" class="nav-item" :class="{ active: $route.path === '/profile' }">
          <span class="nav-icon">👤</span>
          <span class="nav-label">Profil</span>
        </router-link>
        <button class="nav-item nav-logout" @click="handleLogout">
          <TipsIcon name="quitter" :size="22" class="nav-icon" />
          <span class="nav-label">Quitter</span>
        </button>
      </nav>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/authStore'
import TipsIcon from './components/TipsIcon.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const isLoginPage = computed(() => route.path === '/login')

// Detection du safe-area-bottom pour les mobiles à encoche (iOS/Android)
let safeAreaBottom = 0
try {
  // iOS Safari expose safeAreaInsets via CSS env, on le tente avec un calcul JS
  if (typeof CSS !== 'undefined' && CSS.supports) {
    // Vérifie si le navigateur supporte env()
  }
  // Fallback : la valeur par défaut iOS est 34px (barre de navigation)
  // On utilise une valeur conservative
  safeAreaBottom = 34
} catch { safeAreaBottom = 34 }

// Navigation dynamique basée sur le rôle
const tabs = computed(() => authStore.navTabs)
const notifCount = computed(() => authStore.notificationCount)

let notifInterval = null
let onlineWatcher = null

function handleLogout() {
  authStore.logout()
  router.push('/login')
}

onMounted(() => {
  // Set safe area bottom from JS
  document.documentElement.style.setProperty('--safe-area-bottom', '0px')
  // iOS Safari: env(safe-area-inset-bottom) works natively, valeurs par défaut ~34px
  // Pour les autres, on laisse la nav s'adapter via padding-bottom existant

  // Online/offline connectivity watcher — auto-sync when back online
  function onOnline() {
    // Déclenche le sync offline depuis n'importe quelle vue active
    if (window.__flushOfflineQueue) {
      window.__flushOfflineQueue()
    }
  }
  window.addEventListener('online', onOnline)
  onlineWatcher = setInterval(() => {
    if (navigator.onLine && window.__flushOfflineQueue) {
      window.__flushOfflineQueue()
    }
  }, 60000) // Vérification minute

  // Poll notification count every 30s when authenticated + auto-logout if token expired
  notifInterval = setInterval(() => {
    if (authStore.isAuthenticated) {
      authStore.fetchNotificationCount()
    } else if (authStore.user) {
      // Token expired while sitting on a page → force logout
      authStore.logout()
      router.push('/login')
    }
  }, 30000)
})

onUnmounted(() => {
  if (notifInterval) clearInterval(notifInterval)
  if (onlineWatcher) clearInterval(onlineWatcher)
})
</script>

<style>
/* ═══ Thème dark/light — CSS custom properties ═══ */
:root {
  --bg: #0f0f1a;
  --text: #fff;
  --nav-bg: #1a1a2e;
  --nav-border: #2a2a40;
  --nav-active: #059669;
  --nav-inactive: #6b6b7b;
  --logout-hover: #ff6b6b;
}
.theme-light {
  --bg: #f5f5f0;
  --text: #1a1a2e;
  --nav-bg: #e8e8e0;
  --nav-border: #ccc;
  --nav-active: #059669;
  --nav-inactive: #7d7d75;
  --logout-hover: #e05252;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior: none;
  transition: background 0.3s ease, color 0.3s ease;
}
.app-layout { display: flex; flex-direction: column; min-height: 100dvh; }
.app-content { flex: 1; overflow-y: auto; }
.bottom-nav {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: flex; justify-content: space-around;
  padding: 8px 0; padding-bottom: max(8px, var(--safe-area-bottom, env(safe-area-inset-bottom, 0px)));
  background: var(--nav-bg);
  border-top: 1px solid var(--nav-border);
  z-index: 100;
  transition: background 0.3s ease, border-color 0.3s ease;
}
.nav-item {
  display: flex; flex-direction: column; align-items: center;
  gap: 2px; text-decoration: none; color: var(--nav-inactive);
  padding: 4px 8px; border-radius: 8px;
  transition: color 0.2s;
}
.nav-item.active { color: var(--nav-active); }
.nav-icon { font-size: 22px; line-height: 1; }
.nav-label { font-size: 10px; font-weight: 500; }
.nav-logout {
  background: none; border: none; cursor: pointer; font-family: inherit;
  color: var(--nav-inactive); transition: color 0.2s;
}
.nav-logout:active { color: var(--logout-hover); }

/* Notification badge */
.notif-icon { position: relative; display: inline-flex; align-items: center; justify-content: center; font-size: 20px; }
.notif-badge {
  position: absolute; top: -6px; right: -8px;
  background: #ff6b6b; color: #fff;
  font-size: 9px; font-weight: 700;
  min-width: 16px; height: 16px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px; padding: 0 4px;
  line-height: 1;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}

/* Override nav-item for profile/notif — always visible regardless of role */
.bottom-nav .nav-item:not(.nav-logout) { flex-shrink: 0; }
.bottom-nav .nav-item .nav-icon { font-size: 20px; }
.theme-toggle {
  background: none; border: none; cursor: pointer; font-family: inherit;
  color: var(--nav-inactive); transition: color 0.2s;
}
.theme-toggle:active { color: var(--nav-active); }
</style>
