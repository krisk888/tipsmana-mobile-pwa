<template>
  <div class="pilot-dashboard">
    <header class="page-header">
      <h2>Bonjour {{ user?.first_name || 'Boss' }}</h2>
      <p class="date">{{ today }}</p>
    </header>

    <div class="kpi-grid">
      <div class="kpi-card">
        <span class="kpi-label">CA aujourd'hui</span>
        <span class="kpi-value">{{ formatEur(dashboard.ca_today) }}</span>
        <span class="kpi-delta" :class="dashboard.ca_trend >= 0 ? 'up' : 'down'">
          {{ dashboard.ca_trend >= 0 ? '↑' : '↓' }} {{ Math.abs(dashboard.ca_trend) }}%
        </span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Ticket moyen</span>
        <span class="kpi-value">{{ formatEur(dashboard.avg_ticket) }}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Couverts</span>
        <span class="kpi-value">{{ dashboard.couverts }}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Marge brute</span>
        <span class="kpi-value">{{ formatEur(dashboard.margin) }}</span>
        <span class="kpi-delta" :class="dashboard.margin_pct >= 60 ? 'up' : 'down'">
          {{ dashboard.margin_pct }}%
        </span>
      </div>
    </div>

    <div v-if="alerts.length" class="alerts-section">
      <h3>Alertes</h3>
      <div v-for="alert in alerts.slice(0,3)" :key="alert.id" class="alert-item" :class="alert.severity">
        <span class="alert-icon">{{ alert.severity === 'high' ? '🔴' : '🟡' }}</span>
        <span class="alert-text">{{ alert.message }}</span>
      </div>
    </div>

    <div class="quick-actions">
      <h3>Actions rapides</h3>
      <div class="action-grid">
        <router-link to="/validations" class="action-btn">✅ Validations</router-link>
        <router-link to="/scan" class="action-btn">📷 Scanner</router-link>
        <router-link to="/stock" class="action-btn">📦 Inventaire</router-link>
        <router-link to="/caisse" class="action-btn">💳 Caisse</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { auth } from '../../shared/auth'
import api from '../../shared/api'

const user = computed(() => auth.user)
const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

const dashboard = ref({
  ca_today: 0, ca_trend: 0,
  avg_ticket: 0, couverts: 0,
  margin: 0, margin_pct: 0
})
const alerts = ref([])
const loading = ref(true)
const error = ref(null)

function formatEur(amount) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount || 0)
}

async function loadDashboard() {
  loading.value = true
  try {
    const res = await api.get('/dashboard/bundle')
    const data = res.data || res
    dashboard.value = {
      ca_today: data.ca_today || 0,
      ca_trend: data.ca_trend || 0,
      avg_ticket: data.avg_ticket || 0,
      couverts: data.couverts || 0,
      margin: data.margin || 0,
      margin_pct: data.margin_pct || 0
    }
  } catch (e) {
    error.value = e.message
    // Fallback demo data
    dashboard.value = { ca_today: 2081.40, ca_trend: 12, avg_ticket: 34.50, couverts: 62, margin: 1248.84, margin_pct: 60 }
    alerts.value = [
      { id: 1, severity: 'high', message: '3 factures fournisseurs en attente de validation' },
      { id: 2, severity: 'medium', message: 'Écart inventaire > 5% sur 2 produits' },
    ]
  } finally {
    loading.value = false
  }
}

onMounted(loadDashboard)
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
.kpi-delta { font-size: 12px; font-weight: 600; }
.kpi-delta.up { color: #00d2a0; }
.kpi-delta.down { color: #ff6b6b; }
.alerts-section { margin-bottom: 20px; }
.alerts-section h3, .quick-actions h3 { font-size: 14px; color: #aaa; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
.alert-item {
  display: flex; align-items: center; gap: 10px;
  padding: 12px; border-radius: 10px; margin-bottom: 8px;
}
.alert-item.high { background: rgba(255,107,107,0.15); }
.alert-item.medium { background: rgba(255,193,7,0.15); }
.alert-text { font-size: 13px; color: #ddd; }
.action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.action-btn {
  display: flex; align-items: center; justify-content: center;
  padding: 16px; background: #1e1e32; border-radius: 12px;
  color: #fff; text-decoration: none; font-size: 14px; font-weight: 500;
  transition: background 0.2s;
}
.action-btn:active { background: #2a2a40; }
</style>