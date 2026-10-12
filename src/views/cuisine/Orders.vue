<template>
  <div class="cuisine-view">
    <header class="page-header">
      <h2>🍳 Cuisine</h2>
      <p class="subtitle">Commandes en attente</p>
    </header>

    <div class="toolbar">
      <span class="count-label">{{ orders.length }} commande{{ orders.length > 1 ? 's' : '' }}</span>
      <button class="btn-refresh" @click="load" :disabled="loading">
        {{ loading ? '…' : '↻ Actualiser' }}
      </button>
    </div>

    <div v-if="loading" class="loading-state">Chargement...</div>
    <div v-else-if="error && !orders.length" class="error-state">{{ error }}</div>
    <div v-else-if="!orders.length" class="empty-state">
      <p class="empty-icon">🍽️</p>
      <p>Tout est servi, rien en attente</p>
    </div>

    <div v-else class="order-list">
      <div v-for="o in orders" :key="o.id" class="order-card">
        <div class="order-card-header">
          <div class="order-header" @click="toggleDetail(o.id)">
            <strong>Cmd #{{ shortId(o.id) }}</strong>
            <span class="order-amount">{{ formatEur(o.total_sales_ttc) }}</span>
          </div>
          <div class="order-meta">
            <span class="shift-badge" :class="o.shift">{{ shiftLabel(o.shift) }}</span>
            <span v-if="o.created_at" class="order-time">{{ formatTimeAgo(o.created_at) }}</span>
            <span>{{ o.total_items != null ? o.total_items + ' lignes' : '' }}</span>
            <span>{{ o.imported_by_user_name }}</span>
          </div>
          <button class="btn-ready" @click.stop="markReady(o.id)" :disabled="readyLoading[o.id]">
            {{ readyLoading[o.id] ? '…' : '✅ Prêt' }}
          </button>
        </div>

        <div v-if="expanded[o.id]" class="order-detail">
          <div v-if="detailLoading[o.id]" class="detail-loading">Chargement du détail...</div>
          <div v-else-if="detailError[o.id]" class="detail-error">{{ detailError[o.id] }}</div>
          <ul v-else-if="detailItems[o.id]?.length" class="item-list">
            <li v-for="li in detailItems[o.id]" :key="li.id" class="item-row">
              <span class="item-qty">×{{ li.quantity || 1 }}</span>
              <span class="item-name">{{ li.product_name || li.recipe_name || 'Produit n°' + shortId(li.product_id || li.recipe_id) }}</span>
            </li>
          </ul>
          <p v-else class="detail-empty">Aucun article détaillé</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import api from '../../shared/api'

const readyLoading = ref({})
const orders = ref([])
const loading = ref(true)
const error = ref(null)
const expanded = ref({})
const detailLoading = ref({})
const detailError = ref({})
const detailItems = ref({})

const today = new Date()
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
function formatTimeAgo(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const ago = Math.round((Date.now() - d.getTime()) / 60000)
  if (ago < 1) return 'à l\'instant'
  if (ago < 60) return `il y a ${ago} min`
  const h = Math.floor(ago / 60)
  const m = ago % 60
  return `il y a ${h}h${m ? m + 'min' : ''}`
}

async function markReady(id) {
  readyLoading.value[id] = true
  try {
    await api.put(`/sales/entries/${id}`, { validation_status: 'validated' })
    orders.value = orders.value.filter(o => o.id !== id)
  } catch (e) {
    alert('Erreur: ' + (e.message || 'mise à jour échouée'))
  } finally {
    readyLoading.value[id] = false
  }
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await api.get(`/sales/entries?date_from=${todayISO}&date_to=${todayISO}&validation_status=pending`)
    orders.value = Array.isArray(res.data) ? res.data : []
  } catch (e) {
    error.value = e.message
    orders.value = []
  } finally {
    loading.value = false
  }
}

async function toggleDetail(id) {
  if (expanded.value[id]) {
    expanded.value[id] = false
    return
  }
  expanded.value[id] = true
  if (detailItems.value[id]) return
  detailLoading.value[id] = true
  detailError.value[id] = null
  try {
    const res = await api.get(`/sales/entries/${id}`)
    const data = res.data || res
    detailItems.value[id] = data.line_items || []
  } catch (e) {
    detailError.value[id] = e.message
  } finally {
    detailLoading.value[id] = false
  }
}

let refreshTimer
onMounted(() => {
  load()
  refreshTimer = setInterval(load, 30000)
})
onUnmounted(() => {
  clearInterval(refreshTimer)
})
</script>

<style scoped>
.cuisine-view { padding: 16px; padding-bottom: 80px; }
.page-header { margin-bottom: 16px; }
.page-header h2 { font-size: 22px; color: #fff; margin: 0; }
.subtitle { font-size: 13px; color: #888; margin-top: 4px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.count-label { font-size: 13px; color: #aaa; }
.btn-refresh {
  background: #1e1e32; color: #fff; border: none; border-radius: 8px;
  padding: 8px 12px; font-size: 13px; font-weight: 600; cursor: pointer;
}
.loading-state, .error-state, .empty-state { color: #666; text-align: center; padding: 40px; }
.empty-icon { font-size: 48px; margin-bottom: 8px; }
.order-list { display: flex; flex-direction: column; gap: 10px; }
.order-card {
  background: #1e1e32; border-radius: 12px; padding: 14px;
}
.order-card:active { background: #2a2a40; }
.order-header { display: flex; justify-content: space-between; align-items: center; }
.order-header strong { color: #fff; font-size: 15px; }
.order-amount { color: #00d2a0; font-weight: 700; font-size: 16px; }
.order-meta {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: #888; margin-top: 6px; flex-wrap: wrap;
}
.shift-badge { padding: 2px 8px; border-radius: 6px; font-weight: 600; }
.shift-badge.lunch { background: rgba(255,193,7,0.15); color: #ffc107; }
.shift-badge.dinner { background: rgba(108,92,231,0.2); color: #a29bfe; }
.order-detail { margin-top: 12px; padding-top: 10px; border-top: 1px solid #2a2a40; }
.detail-loading, .detail-error, .detail-empty { font-size: 12px; color: #888; }
.detail-error { color: #ff6b6b; }
.item-list { list-style: none; margin: 0; padding: 0; }
.item-row {
  display: flex; gap: 8px; padding: 6px 0;
  font-size: 13px; color: #ddd; border-bottom: 1px solid #2a2a40;
}
.item-row:last-child { border-bottom: none; }
.item-qty { color: #6c5ce7; font-weight: 700; min-width: 24px; }
.item-name { flex: 1; }
</style>
