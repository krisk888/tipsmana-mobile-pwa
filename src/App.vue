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
        <ThemeToggle />
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
        <button class="nav-item nav-logout" @click="handleLogout">
          <TipsIcon name="quitter" :size="22" class="nav-icon" />
          <span class="nav-label">Quitter</span>
        </button>
      </nav>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/authStore'
import TipsIcon from './components/TipsIcon.vue'
import ThemeToggle from './shared/ThemeToggle.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const isLoginPage = computed(() => route.path === '/login')

// Navigation dynamique basée sur le rôle
const tabs = computed(() => authStore.navTabs)

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
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
  padding: 8px 0; padding-bottom: max(8px, env(safe-area-inset-bottom));
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
.theme-toggle {
  background: none; border: none; cursor: pointer; font-family: inherit;
  color: var(--nav-inactive); transition: color 0.2s;
}
.theme-toggle:active { color: var(--nav-active); }
</style>
