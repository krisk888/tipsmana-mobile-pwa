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
          <span class="nav-icon">{{ tab.icon }}</span>
          <span class="nav-label">{{ tab.label }}</span>
        </router-link>
        <button class="nav-item nav-logout" @click="handleLogout">
          <span class="nav-icon">⏻</span>
          <span class="nav-label">Quitter</span>
        </button>
      </nav>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { logout } from './shared/auth'

const route = useRoute()
const router = useRouter()
const isLoginPage = computed(() => route.path === '/login')

const tabs = [
  { path: '/pilot', icon: '📊', label: 'Pilote' },
  { path: '/stock', icon: '📦', label: 'Stock' },
  { path: '/caisse', icon: '💳', label: 'Caisse' },
  { path: '/cuisine', icon: '🍳', label: 'Cuisine' },
]

function handleLogout() {
  logout()
  router.push('/login')
}
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0f0f1a;
  color: #fff;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior: none;
}
.app-layout { display: flex; flex-direction: column; min-height: 100dvh; }
.app-content { flex: 1; overflow-y: auto; }
.bottom-nav {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: flex; justify-content: space-around;
  padding: 8px 0; padding-bottom: max(8px, env(safe-area-inset-bottom));
  background: #1a1a2e;
  border-top: 1px solid #2a2a40;
  z-index: 100;
}
.nav-item {
  display: flex; flex-direction: column; align-items: center;
  gap: 2px; text-decoration: none; color: #666;
  padding: 4px 12px; border-radius: 8px;
  transition: color 0.2s;
}
.nav-item.active { color: #6c5ce7; }
.nav-icon { font-size: 22px; line-height: 1; }
.nav-label { font-size: 10px; font-weight: 500; }
.nav-logout {
  background: none; border: none; cursor: pointer; font-family: inherit;
  color: #666; transition: color 0.2s;
}
.nav-logout:active { color: #ff6b6b; }
</style>