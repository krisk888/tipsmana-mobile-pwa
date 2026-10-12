<template>
  <div class="stock-view">
    <header class="page-header">
      <h2>📦 Stock</h2>
      <p class="subtitle">Inventaire et réceptions</p>
    </header>

    <div v-if="loading" class="loading-state">Chargement…</div>
    <div v-else-if="error" class="error-state">{{ error }}</div>

    <div v-else class="sessions-section">
      <h3>Sessions en cours</h3>
      <div v-if="sessions.length === 0" class="empty-state">
        <span class="empty-icon">📭</span>
        <p>Aucune session active</p>
        <button class="btn-primary" @click="startSession">+ Nouvelle session</button>
      </div>
      <div v-for="s in sessions" :key="s.id" class="session-card" @click="$router.push('/stock/' + s.id)">
        <div class="session-header">
          <strong>{{ s.name || 'Session #' + shortId(s.id) }}</strong>
          <span class="session-status" :class="s.status">{{ statusLabel(s.status) }}</span>
        </div>
        <div class="session-meta">
          <span>Créée {{ timeAgo(s.created_at) }}</span>
          <span v-if="s.product_count != null">{{ s.product_count }} produits</span>
        </div>
      </div>
    </div>

    <div class="quick-links">
      <router-link to="/scan" class="link-card">
        <span class="link-icon">📷</span>
        <div>
          <strong>Scanner un produit</strong>
          <p>QR code ou code-barres</p>
        </div>
      </router-link>
      <router-link to="/stock/receptions" class="link-card">
        <span class="link-icon">📬</span>
        <div>
          <strong>Réceptions</strong>
          <p>Livraisons en attente</p>
        </div>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../shared/api'

const sessions = ref([])
const loading = ref(true)
const error = ref(null)

function shortId(id) { return id ? String(id).slice(0, 8) : '—' }
function statusLabel(s) {
  return { active: 'Active', completed: 'Terminée', cancelled: 'Annulée' }[s] || (s || '—')
}
function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return new Date(iso).toLocaleDateString('fr-FR')
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
    // API renvoie {kitchen: {items}, dining_room: {items}} — on fusionne
    if (Array.isArray(data)) {
      sessions.value = data
    } else {
      sessions.value = [
        ...(data.kitchen?.items || []),
        ...(data.dining_room?.items || []),
      ]
    }
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
      session_name: `Inventaire ${todayISO}`,
      session_date: todayISO,
    })
    await load()
  } catch (e) {
    error.value = e.message || 'Impossible de créer'
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
.session-status.active { background: rgba(0,210,160,0.15); color: #00d2a0; }
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
.link-icon { font-size: 24px; width: 36px; text-align: center; }
.link-card strong { font-size: 14px; }
.link-card p { font-size: 12px; color: #888; margin-top: 2px; }
</style>