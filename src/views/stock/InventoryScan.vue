<template>
  <div class="stock-view">
    <header class="page-header">
      <h2>{{ t('stock.home.title') }}</h2>
      <p class="subtitle">{{ t('stock.home.subtitle') }}</p>
    </header>

    <div v-if="loading" class="loading-state">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="error-state">{{ error }}</div>

    <div v-else class="sessions-section">
      <h3>{{ t('stock.home.activeSessions') }}</h3>
      <div v-if="sessions.length === 0" class="empty-state">
        <span class="empty-icon">📭</span>
        <p>{{ t('stock.home.noActiveSession') }}</p>
        <button class="btn-primary" @click="startSession">{{ t('stock.home.newSession') }}</button>
      </div>
      <div v-for="s in sessions" :key="s.id" class="session-card" @click="$router.push('/stock/' + s.id)">
        <div class="session-header">
          <strong>{{ s.session_name || t('stock.sessionFallback', { id: shortId(s.id) }) }}</strong>
          <span class="session-status" :class="s.status">{{ statusLabel(s.status) }}</span>
        </div>
        <div class="session-meta">
          <span>{{ t('stock.startedAgo', { ago: timeAgo(s.started_at) }) }}</span>
          <span v-if="s.product_count != null">{{ t('stock.home.productsCount', { count: s.product_count }) }}</span>
        </div>
      </div>
    </div>

    <div class="quick-links">
      <router-link v-if="canSeeItems" to="/stock/inventory" class="link-card">
        <span class="link-icon">📋</span>
        <div>
          <strong>{{ t('stock.home.links.itemsTitle') }}</strong>
          <p>{{ t('stock.home.links.itemsDesc') }}</p>
        </div>
      </router-link>
      <router-link v-if="canSeeItems" to="/stock/count" class="link-card">
        <span class="link-icon">🧮</span>
        <div>
          <strong>{{ t('stock.home.links.countTitle') }}</strong>
          <p>{{ t('stock.home.links.countDesc') }}</p>
        </div>
      </router-link>
      <router-link to="/stock/express" class="link-card express">
        <span class="link-icon">⚡</span>
        <div>
          <strong>{{ t('stock.home.links.expressTitle') }}</strong>
          <p>{{ t('stock.home.links.expressDesc') }}</p>
        </div>
      </router-link>
      <router-link to="/scan" class="link-card">
        <span class="link-icon">📷</span>
        <div>
          <strong>{{ t('stock.home.links.scanTitle') }}</strong>
          <p>{{ t('stock.home.links.scanDesc') }}</p>
        </div>
      </router-link>
      <router-link to="/stock/receptions" class="link-card">
        <span class="link-icon">📬</span>
        <div>
          <strong>{{ t('stock.home.links.receptionsTitle') }}</strong>
          <p>{{ t('stock.home.links.receptionsDesc') }}</p>
        </div>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../../shared/api'
import { useAuthStore } from '../../stores/authStore'
import { useI18n } from '../../i18n'

const { t, intlLocale } = useI18n()
const authStore = useAuthStore()
// Mêmes rôles que la route /stock/inventory (ACHATS voit /stock sans l'inventaire produits)
const canSeeItems = computed(() => !authStore.roleCode || ['OWNER', 'MANAGER', 'INVENTAIRE'].includes(authStore.roleCode))

const sessions = ref([])
const loading = ref(true)
const error = ref(null)

function shortId(id) { return id ? String(id).slice(0, 8) : '—' }
function statusLabel(s) {
  // SessionStatus backend : in_progress | completed | validated | cancelled
  return ['in_progress', 'completed', 'validated', 'cancelled'].includes(s) ? t(`stock.status.${s}`) : (s || '—')
}
function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return t('stock.timeAgo.justNow')
  if (min < 60) return t('stock.timeAgo.minutes', { n: min })
  const h = Math.floor(min / 60)
  if (h < 24) return t('stock.timeAgo.hours', { n: h })
  return new Date(iso).toLocaleDateString(intlLocale())
}

const todayISO = (() => {
  const today = new Date()
  return [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-')
})()

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await api.get('/inventory/sessions')
    const data = res.data || res.results || res || {}
    // API renvoie {kitchen: {items}, dining_room: {items}} avec les mêmes
    // sessions dans les deux sections — on fusionne en dédoublonnant par id
    const list = Array.isArray(data)
      ? data
      : [...(data.kitchen?.items || []), ...(data.dining_room?.items || [])]
    sessions.value = [...new Map(list.map(s => [s.id, s])).values()]
  } catch (e) {
    error.value = e.message
    sessions.value = []
  } finally {
    loading.value = false
  }
}

async function startSession() {
  try {
    await api.post('/inventory/sessions', {
      session_name: t('stock.home.defaultSessionName', { date: todayISO }),
      session_date: todayISO,
    })
    await load()
  } catch (e) {
    error.value = e.message || t('stock.home.createError')
  }
}

onMounted(load)
</script>

<style scoped>
.stock-view { padding: 16px; padding-bottom: 80px; }
.page-header { margin-bottom: 16px; }
.page-header h2 { font-size: 22px; color: #fff; margin: 0; }
.subtitle { font-size: 13px; color: #888; margin-top: 4px; }
.loading-state, .error-state, .empty-state { color: #666; text-align: center; padding: 40px; }
.empty-icon { font-size: 48px; margin-bottom: 8px; }
.sessions-section { margin-bottom: 20px; }
.sessions-section h3 { font-size: 14px; color: #aaa; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
.session-card {
  background: #1e1e32; border-radius: 12px; padding: 14px; margin-bottom: 8px; cursor: pointer;
}
.session-card:active { background: #2a2a40; }
.session-header { display: flex; justify-content: space-between; align-items: center; }
.session-header strong { color: #fff; font-size: 14px; }
.session-status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; }
.session-status.in_progress { background: rgba(0,210,160,0.15); color: #00d2a0; }
.session-status.completed { color: #888; }
.session-meta { font-size: 12px; color: #888; margin-top: 6px; display: flex; gap: 12px; }
.btn-primary {
  background: #6c5ce7; color: #fff; border: none; border-radius: 8px;
  padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 12px;
}
.quick-links { display: flex; flex-direction: column; gap: 10px; }
.link-card {
  display: flex; align-items: center; gap: 12px;
  background: #1e1e32; border-radius: 12px; padding: 14px; text-decoration: none; color: #fff;
}
.link-card:active { background: #2a2a40; }
.link-card.express { border: 1px solid rgba(108,92,231,0.4); }
.link-card.express strong { color: #a89bf0; }
.link-icon { font-size: 24px; width: 36px; text-align: center; }
.link-card strong { font-size: 14px; }
.link-card p { font-size: 12px; color: #888; margin-top: 2px; }
</style>