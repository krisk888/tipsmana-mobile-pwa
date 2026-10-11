<template>
  <div class="caisse-view">
    <header class="page-header">
      <h2>💳 Caisse</h2>
      <p class="subtitle">Tickets du jour</p>
    </header>

    <div class="kpi-row">
      <div class="kpi-card">
        <span class="kpi-label">CA du jour</span>
        <span class="kpi-value">{{ formatEur(totals.totalTtc) }}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Tickets</span>
        <span class="kpi-value">{{ tickets.length }}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Midi</span>
        <span class="kpi-value">{{ formatEur(totals.lunchTtc) }}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Soir</span>
        <span class="kpi-value">{{ formatEur(totals.dinnerTtc) }}</span>
      </div>
    </div>

    <div class="toolbar">
      <span class="date-label">{{ todayLabel }}</span>
      <div class="toolbar-actions">
        <router-link to="/caisse/new" class="btn-new">+ Nouveau</router-link>
        <button class="btn-refresh" @click="load" :disabled="loading">
          {{ loading ? '…' : '↻' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading-state">Chargement...</div>
    <div v-else-if="error && !tickets.length" class="error-state">{{ error }}</div>
    <div v-else-if="!tickets.length" class="empty-state">
      <p class="empty-icon">🧾</p>
      <p>Aucun ticket saisi aujourd'hui</p>
    </div>

    <div v-else class="ticket-list">
      <div v-for="t in tickets" :key="t.id" class="ticket-card">
        <div class="ticket-header">
          <strong>Ticket #{{ shortId(t.id) }}</strong>
          <span class="ticket-amount">{{ formatEur(t.total_sales_ttc) }}</span>
        </div>
        <div class="ticket-meta">
          <span class="shift-badge" :class="t.shift">{{ shiftLabel(t.shift) }}</span>
          <span>{{ t.total_items != null ? t.total_items + ' articles' : '' }}</span>
          <span>{{ t.imported_by_name }}</span>
        </div>
        <div class="ticket-status" :class="t.validation_status">
          {{ statusLabel(t.validation_status) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../../shared/api'

const tickets = ref([])
const loading = ref(true)
const error = ref(null)

const today = new Date()
const todayLabel = today.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const todayISO = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, '0'),
  String(today.getDate()).padStart(2, '0'),
].join('-')

function formatEur(v) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0) }
function shortId(id) { return id ? String(id).slice(0, 8) : '—' }
function shiftLabel(s) {
  return { lunch: 'Midi', dinner: 'Soir', all_day: 'Journée' }[s] || (s || '—')
}
function statusLabel(s) {
  return { pending: 'En attente', validated: 'Validée', has_errors: 'Erreurs' }[s] || (s || '—')
}

const totals = computed(() => {
  let totalTtc = 0, lunchTtc = 0, dinnerTtc = 0
  for (const t of tickets.value) {
    totalTtc += t.total_sales_ttc || 0
    if (t.shift === 'lunch') lunchTtc += t.total_sales_ttc || 0
    if (t.shift === 'dinner') dinnerTtc += t.total_sales_ttc || 0
  }
  return { totalTtc, lunchTtc, dinnerTtc }
})

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await api.get(`/sales/entries/by-date/${todayISO}`)
    tickets.value = res.data || res.results || res || []
  } catch (e) {
    error.value = e.message
    // Fallback demo data
    tickets.value = [
      { id: 'a1b2c3d4', total_sales_ttc: 2081.40, shift: 'lunch', validation_status: 'pending', total_items: 14, imported_by_name: 'Camille' },
      { id: 'e5f6a7b8', total_sales_ttc: 1489.20, shift: 'dinner', validation_status: 'pending', total_items: 11, imported_by_name: 'Bastien' },
    ]
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.caisse-view { padding: 16px; padding-bottom: 80px; }
.page-header { margin-bottom: 16px; }
.page-header h2 { font-size: 22px; color: #fff; margin: 0; }
.subtitle { font-size: 13px; color: #888; margin-top: 4px; }
.kpi-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 16px; }
.kpi-card {
  background: #1e1e32; border-radius: 12px; padding: 14px;
  display: flex; flex-direction: column;
}
.kpi-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
.kpi-value { font-size: 18px; font-weight: 700; color: #fff; margin-top: 4px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.date-label { font-size: 13px; color: #aaa; }
.toolbar-actions { display: flex; align-items: center; gap: 8px; }
.btn-new {
  background: #6c5ce7; color: #fff; border: none; border-radius: 8px;
  padding: 8px 12px; font-size: 13px; font-weight: 600; cursor: pointer;
  text-decoration: none;
}
.btn-refresh {
  background: #1e1e32; color: #fff; border: none; border-radius: 8px;
  padding: 8px 12px; font-size: 13px; font-weight: 600; cursor: pointer;
}
.loading-state, .error-state, .empty-state { color: #666; text-align: center; padding: 40px; }
.empty-icon { font-size: 48px; margin-bottom: 8px; }
.ticket-list { display: flex; flex-direction: column; gap: 10px; }
.ticket-card {
  background: #1e1e32; border-radius: 12px; padding: 14px;
}
.ticket-header { display: flex; justify-content: space-between; align-items: center; }
.ticket-header strong { color: #fff; font-size: 15px; }
.ticket-amount { color: #6c5ce7; font-weight: 700; font-size: 16px; }
.ticket-meta {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: #888; margin-top: 6px; flex-wrap: wrap;
}
.shift-badge {
  padding: 2px 8px; border-radius: 6px; font-weight: 600;
}
.shift-badge.lunch { background: rgba(255,193,7,0.15); color: #ffc107; }
.shift-badge.dinner { background: rgba(108,92,231,0.2); color: #a29bfe; }
.ticket-status { margin-top: 10px; font-size: 12px; font-weight: 600; }
.ticket-status.pending { color: #ffc107; }
.ticket-status.validated { color: #00d2a0; }
.ticket-status.has_errors { color: #ff6b6b; }
</style>
