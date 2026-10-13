<template>
  <div class="pilot-dashboard">
    <header class="page-header">
      <h2>Bonjour {{ user?.first_name || 'Boss' }}</h2>
      <p class="date">{{ today }}</p>
    </header>

    <!-- Skeleton de chargement : visible uniquement au 1er chargement sans cache -->
    <div v-if="loading && !cacheAvailable" class="skeleton-grid" aria-busy="true" aria-label="Chargement des indicateurs">
      <div v-for="n in 3" :key="n" class="skeleton-card">
        <div class="skeleton-bar w-40"></div>
        <div class="skeleton-bar w-70 tall"></div>
        <div class="skeleton-bar w-50"></div>
      </div>
    </div>

    <!-- État d'erreur : échec API ET aucun cache disponible -->
    <div v-else-if="error && !cacheAvailable" class="error-state" role="alert">
      <span class="error-icon">⚠️</span>
      <p class="error-title">Connexion impossible</p>
      <p class="error-detail">{{ error }}</p>
      <button class="retry-btn" @click="loadDashboard">Réessayer</button>
    </div>

    <!-- Données : fraîches OU issues du cache localStorage -->
    <template v-else>
      <div v-if="usingCache" class="offline-banner" role="status">
        📡 Données hors ligne — dernière synchro : {{ lastSyncLabel }}
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-label">CA aujourd'hui</span>
          <span class="kpi-value">{{ formatEur(dashboard.today_revenue) }}</span>
          <span class="kpi-delta">{{ dashboard.today_transactions }} transactions</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Ticket moyen</span>
          <span class="kpi-value">{{ formatEur(dashboard.avg_ticket) }}</span>
          <span class="kpi-delta">CA / ticket</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Marge brute</span>
          <span class="kpi-value">{{ formatEur(dashboard.margin) }}</span>
          <span class="kpi-delta" :class="dashboard.margin_pct >= 60 ? 'up' : 'down'">
            {{ dashboard.margin_pct }}%
          </span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Produits actifs</span>
          <span class="kpi-value">{{ dashboard.active_products }}</span>
          <span class="kpi-delta">{{ dashboard.low_stock_items }} en stock faible</span>
        </div>
      </div>

      <div v-if="alerts.length" class="alerts-section">
        <h3>Alertes</h3>
        <div v-for="alert in alerts.slice(0,3)" :key="alert.id" class="alert-item" :class="alert.severity">
          <span class="alert-icon">{{ alert.severity === 'high' ? '🔴' : '🟡' }}</span>
          <span class="alert-text">{{ alert.message }}</span>
        </div>
      </div>

      <div v-if="activities.length" class="activities-section">
        <h3>Activité récente</h3>
        <div v-for="a in activities.slice(0,4)" :key="a.id" class="activity-item">
          <span class="activity-dot"></span>
          <span class="activity-text">{{ a.description }} — {{ a.user_name }}</span>
          <span class="activity-time">{{ timeAgo(a.created_at) }}</span>
        </div>
      </div>
    </template>

    <div class="quick-actions">
      <h3>Actions rapides</h3>
      <div class="action-grid">
        <router-link to="/validations" class="action-btn">✅ Validations</router-link>
        <router-link to="/scan" class="action-btn">📷 Scanner</router-link>
        <router-link to="/stock" class="action-btn">📦 Inventaire</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { auth } from '../../shared/auth'
import api from '../../shared/api'

const user = computed(() => auth.user)
const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

const dashboard = ref({
  today_revenue: 0, today_transactions: 0,
  avg_ticket: 0, margin: 0, margin_pct: 0,
  active_products: 0, low_stock_items: 0
})
const alerts = ref([])
const activities = ref([])
const loading = ref(true)
const error = ref(null)
const usingCache = ref(false)
const cacheAvailable = ref(false)
const lastSync = ref(null)

// Cache localStorage des derniers KPI, isolé par établissement
function cacheKey() {
  const est = api.getEstablishmentId && api.getEstablishmentId()
  return `tipsmana_dashboard_cache_${est || 'default'}`
}

function saveCache(data) {
  try {
    const payload = { savedAt: Date.now(), data }
    localStorage.setItem(cacheKey(), JSON.stringify(payload))
  } catch {
    // localStorage indisponible (mode privé) → cache ignoré, pas bloquant
  }
}

function loadCache() {
  try {
    const raw = localStorage.getItem(cacheKey())
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.data) return null
    return parsed
  } catch {
    return null
  }
}

function applyData(data, fromCache) {
  const qs = data.quick_stats || {}
  const m = data.metrics || {}
  dashboard.value = {
    today_revenue: qs.today_revenue || 0,
    today_transactions: qs.today_transactions || 0,
    avg_ticket: m.average_ticket || 0,
    margin: (m.gross_profit || {}).current_value || 0,
    margin_pct: (m.profit_margin || {}).current_value || 0,
    active_products: qs.active_products || 0,
    low_stock_items: qs.low_stock_items || 0
  }
  alerts.value = (data.active_alerts || []).map(a => ({
    id: a.id || Math.random(),
    severity: (a.severity || 'medium').toLowerCase(),
    message: a.title || a.message || a.description || 'Alerte'
  }))
  activities.value = data.recent_activities || []
  usingCache.value = fromCache
}

function formatEur(amount) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount || 0)
}

const lastSyncLabel = computed(() => {
  if (!lastSync.value) return ''
  return new Date(lastSync.value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
})

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  return new Date(iso).toLocaleDateString('fr-FR')
}

// api.js avale l'offline (retour { success, offline, queued }) sans lever d'erreur :
// on détecte ce cas via l'absence de données exploitables dans la réponse.
function hasUsableData(data) {
  return !!data && typeof data === 'object' &&
    (data.quick_stats || data.metrics || data.active_alerts || data.recent_activities)
}

async function loadDashboard() {
  loading.value = true
  error.value = null
  try {
    const res = await api.get('/dashboard/bundle')
    const data = res && res.data && hasUsableData(res.data) ? res.data : res
    if (!hasUsableData(data)) throw new Error('offline')
    applyData(data, false)
    lastSync.value = Date.now()
    cacheAvailable.value = true
    saveCache(data)
  } catch (e) {
    // Réseau KO ou réponse vide → repli sur le dernier cache localStorage
    const cached = loadCache()
    if (cached && cached.data) {
      applyData(cached.data, true)
      lastSync.value = cached.savedAt
      cacheAvailable.value = true
    } else {
      cacheAvailable.value = false
      const msg = (e && e.message && e.message !== 'offline') ? e.message : ''
      error.value = msg || 'Le serveur est injoignable. Vérifiez votre connexion.'
    }
  } finally {
    loading.value = false
  }
}

let refreshTimer
onMounted(() => {
  // Affiche immédiatement le cache s'il existe (stale-while-revalidate)
  const cached = loadCache()
  if (cached && cached.data) {
    applyData(cached.data, true)
    lastSync.value = cached.savedAt
    cacheAvailable.value = true
  }
  loadDashboard()
  refreshTimer = setInterval(loadDashboard, 30000)
})
onUnmounted(() => {
  clearInterval(refreshTimer)
})
</script>

<style scoped>
.pilot-dashboard { padding: 16px; padding-bottom: 80px; }
.page-header { margin-bottom: 20px; }
.page-header h2 { font-size: 22px; color: #fff; margin: 0; }
.date { font-size: 13px; color: #888; margin: 4px 0 0; }
.kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
.kpi-card {
  background: #1e1e32; border-radius: 12px; padding: 16px;
  display: flex; flex-direction: column;
}
.kpi-label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
.kpi-value { font-size: 24px; font-weight: 700; color: #fff; margin: 4px 0; }
.kpi-delta { font-size: 12px; font-weight: 600; color: #888; }
.kpi-delta.up { color: #00d2a0; }
.kpi-delta.down { color: #ff6b6b; }

/* ---- Skeleton de chargement (3 blocs gris animés) ---- */
.skeleton-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
.skeleton-card {
  background: #1e1e32; border-radius: 12px; padding: 16px;
  display: flex; flex-direction: column; gap: 10px;
}
.skeleton-bar {
  height: 12px; border-radius: 6px;
  background: linear-gradient(90deg, #2a2a40 25%, #3a3a52 50%, #2a2a40 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.2s ease-in-out infinite;
}
.skeleton-bar.tall { height: 24px; }
.skeleton-bar.w-40 { width: 40%; }
.skeleton-bar.w-50 { width: 50%; }
.skeleton-bar.w-70 { width: 70%; }
@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ---- État d'erreur ---- */
.error-state {
  background: rgba(255,107,107,0.08); border: 1px solid rgba(255,107,107,0.35);
  border-radius: 12px; padding: 32px 20px; margin-bottom: 20px;
  display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px;
}
.error-icon { font-size: 40px; }
.error-title { font-size: 17px; font-weight: 700; color: #fff; margin: 4px 0 0; }
.error-detail { font-size: 13px; color: #999; margin: 0 0 12px; }
.retry-btn {
  background: #059669; color: #fff; border: none; border-radius: 10px;
  padding: 12px 28px; font-size: 15px; font-weight: 600; cursor: pointer;
  transition: background 0.2s;
}
.retry-btn:active { background: #047857; }

/* ---- Bandeau données hors ligne (cache) ---- */
.offline-banner {
  background: rgba(255,193,7,0.12); border: 1px solid rgba(255,193,7,0.35);
  color: #fbbf24; font-size: 13px; font-weight: 500;
  border-radius: 10px; padding: 10px 12px; margin-bottom: 14px; text-align: center;
}

.alerts-section, .activities-section { margin-bottom: 20px; }
.alerts-section h3, .quick-actions h3, .activities-section h3 { font-size: 14px; color: #aaa; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
.alert-item {
  display: flex; align-items: center; gap: 10px;
  padding: 12px; border-radius: 10px; margin-bottom: 8px;
}
.alert-item.high { background: rgba(255,107,107,0.15); }
.alert-item.medium { background: rgba(255,193,7,0.15); }
.alert-text { font-size: 13px; color: #ddd; }
.activity-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 0; border-bottom: 1px solid #2a2a40;
}
.activity-dot { width: 8px; height: 8px; border-radius: 50%; background: #6c5ce7; flex-shrink: 0; }
.activity-text { font-size: 13px; color: #ddd; flex: 1; }
.activity-time { font-size: 11px; color: #666; white-space: nowrap; }
.action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.action-btn {
  display: flex; align-items: center; justify-content: center;
  padding: 16px; background: #1e1e32; border-radius: 12px;
  color: #fff; text-decoration: none; font-size: 14px; font-weight: 500;
  transition: background 0.2s;
}
.action-btn:active { background: #2a2a40; }
</style>