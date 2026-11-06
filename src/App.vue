<template>
  <div id="app">
    <!-- Offline banner -->
    <OfflineBanner
      :is-online="isOnline"
      :pending-count="pendingCount"
      :is-syncing="isSyncing"
      :synced="syncedCount"
      @flush="flushQueue"
    />

    <!-- Login screen: no nav -->
    <router-view v-if="isLoginPage" v-slot="{ Component }">
      <transition name="page-fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>

    <!-- Main app with bottom nav -->
    <div v-else class="app-layout">
      <main class="app-content">
        <router-view v-slot="{ Component }">
          <transition name="page-slide" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>

      <nav class="bottom-nav">
        <router-link
          v-for="tab in tabs"
          :key="tab.path"
          :to="tab.path"
          class="nav-item"
          :class="{ active: $route.path.startsWith(tab.path) }"
        >
          <span class="nav-icon-wrap">
            <TipsIcon :name="tab.iconName" :size="22" class="nav-icon" />
            <span v-if="tab.showNotifDot && notifCount > 0" class="nav-notif-dot"></span>
          </span>
          <span class="nav-label">{{ tab.label }}</span>
        </router-link>

        <!-- Pending offline indicator on notification tab -->
        <router-link to="/notifications" class="nav-item" :class="{ active: $route.path === '/notifications' }">
          <span class="nav-icon-wrap">
            <TipsIcon name="notifications_overview" :size="20" class="nav-icon" />
            <span v-if="notifCount > 0" class="notif-badge">{{ notifCount > 99 ? '99+' : notifCount }}</span>
            <span v-if="pendingCount > 0 && !isOnline" class="offline-dot"></span>
          </span>
          <span class="nav-label">Alertes</span>
        </router-link>

        <router-link to="/profile" class="nav-item" :class="{ active: $route.path === '/profile' }">
          <span class="nav-icon-wrap">
            <TipsIcon name="users_edit_users" :size="20" class="nav-icon" />
          </span>
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
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/authStore'
import { useOffline } from './shared/useOffline'
import TipsIcon from './components/TipsIcon.vue'
import OfflineBanner from './components/OfflineBanner.vue'
import api from './shared/api'
import { offlineStore } from './shared/offlineStore'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const isLoginPage = computed(() => route.path === '/login')

// Offline state
const { isOnline, pendingCount, onlineEvent } = useOffline()
const isSyncing = ref(false)
const syncedCount = ref(0)

// Navigation dynamique basée sur le rôle
const tabs = computed(() => authStore.navTabs)
const notifCount = computed(() => authStore.notificationCount)

let notifInterval = null

function handleLogout() {
  authStore.logout()
  router.push('/login')
}

async function flushQueue() {
  isSyncing.value = true
  syncedCount.value = 0
  try {
    const result = await api.flushQueue()
    syncedCount.value = result.synced
  } finally {
    setTimeout(() => {
      isSyncing.value = false
      syncedCount.value = 0
    }, 2000)
  }
}

// Auto-flush when coming back online
function onReconnect() {
  setTimeout(() => { flushQueue() }, 1500)
}

// Toast helper
function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container')
  if (!container) {
    container = document.createElement('div')
    container.className = 'toast-container'
    document.body.appendChild(container)
  }
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.textContent = message
  container.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(-8px)'
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}

window.__showToast = showToast

onMounted(() => {
  document.documentElement.style.setProperty('--safe-area-bottom', '0px')

  // Auto-flush on reconnect
  onlineEvent.addEventListener('online', onReconnect)

  // Poll notification count every 30s when authenticated + auto-logout if token expired
  notifInterval = setInterval(() => {
    if (authStore.isAuthenticated) {
      authStore.fetchNotificationCount()
    } else if (authStore.user) {
      authStore.logout()
      router.push('/login')
    }
  }, 30000)

  // Restore PWA badge count from offline cache
  offlineStore.getBadgeCount().then(saved => {
    if (saved > 0) {
      try {
        if (navigator.setAppBadge) {
          navigator.setAppBadge(saved)
        } else if (navigator.setClientBadge) {
          navigator.setClientBadge(saved)
        }
      } catch { /* badge non supporté */ }
    }
  }).catch(() => {})
})

onUnmounted(() => {
  if (notifInterval) clearInterval(notifInterval)
  onlineEvent.removeEventListener('online', onReconnect)
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
.app-content {
  flex: 1;
  overflow-y: auto;
}

/* ═══ Page transitions ═══ */

/* Fade transition (login) */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.25s ease;
}
.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}

/* Slide transition (app pages) */
.page-slide-enter-active {
  transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.page-slide-leave-active {
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}
.page-slide-enter-from {
  opacity: 0;
  transform: translateX(18px);
}
.page-slide-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}
.bottom-nav {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: flex; justify-content: space-around;
  padding: 8px 0; padding-bottom: max(8px, var(--safe-area-bottom, env(safe-area-inset-bottom, 0px)));
  background: var(--nav-bg);
  border-top: 1px solid var(--nav-border);
  z-index: 100;
  transition: background 0.3s ease, border-color 0.3s ease;
  box-shadow: 0 -2px 16px rgba(0, 0, 0, 0.2);
}
.nav-item {
  display: flex; flex-direction: column; align-items: center;
  gap: 2px; text-decoration: none; color: var(--nav-inactive);
  padding: 4px 8px; border-radius: 8px;
  transition: color 0.2s, transform 0.15s;
}
.nav-item:active {
  transform: scale(0.92);
}
.nav-item.active { color: var(--nav-active); }
.nav-icon { font-size: 22px; line-height: 1; }
.nav-icon-wrap { position: relative; display: inline-flex; align-items: center; justify-content: center; }
.nav-notif-dot {
  position: absolute; top: -2px; right: -4px;
  width: 8px; height: 8px; border-radius: 50%;
  background: #ff6b6b; border: 2px solid var(--nav-bg);
}
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
.offline-dot {
  position: absolute; bottom: -4px; right: -4px;
  width: 10px; height: 10px;
  background: #f59e0b;
  border: 2px solid var(--nav-bg);
  border-radius: 50%;
  animation: offline-pulse 2s ease-in-out infinite;
}
@keyframes offline-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
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
