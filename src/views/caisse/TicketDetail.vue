<template>
  <div class="detail-view">
    <header class="page-header">
      <button class="btn-back" @click="$router.push('/caisse')">← Caisse</button>
      <h2>🧾 Ticket #{{ entry.short_id || entry.id?.slice(0,8) }}</h2>
      <span class="status-badge" :class="statusClass">{{ entry.validation_status || '—' }}</span>
    </header>

    <div v-if="loading" class="loading-state">Chargement...</div>

    <template v-else-if="entry">
      <!-- Info -->
      <div class="info-grid">
        <div class="info-item">
          <span class="label">Date</span>
          <span class="value">{{ formatDate(entry.date) }}</span>
        </div>
        <div class="info-item">
          <span class="label">Shift</span>
          <span class="value">{{ shiftLabel }}</span>
        </div>
        <div class="info-item">
          <span class="label">Type</span>
          <span class="value">{{ entry.entry_type || 'manual' }}</span>
        </div>
        <div class="info-item">
          <span class="label">Importé par</span>
          <span class="value">{{ entry.imported_by_user_name || '—' }}</span>
        </div>
      </div>

      <div v-if="entry.notes" class="notes-card">
        <span class="label">Note</span>
        <p>{{ entry.notes }}</p>
      </div>

      <!-- Line items -->
      <div class="section-title">Articles ({{ (entry.line_items || []).length }})</div>
      <div class="line-items-list">
        <div v-for="item in (entry.line_items || [])" :key="item.id || item.line_item_id" class="line-item-row">
          <div class="li-product">
            <span class="li-name">{{ item.product_name || item.recipe_name || item.item_name_original }}</span>
            <span class="li-match" v-if="item.product_name || item.recipe_name">✅ matché</span>
          </div>
          <div class="li-details">
            <span class="li-qty">x{{ item.quantity }}</span>
            <span class="li-price">{{ formatEur(item.unit_price_ttc) }}</span>
            <span class="li-total">{{ formatEur(item.quantity * item.unit_price_ttc) }}</span>
          </div>
        </div>
      </div>

      <!-- Totals -->
      <div class="totals-card">
        <div class="total-row"><span>Total TTC</span><span class="ttc">{{ formatEur(entry.total_sales_ttc) }}</span></div>
        <div class="total-row"><span>Total HT</span><span>{{ formatEur(entry.total_sales_ht) }}</span></div>
        <div class="total-row" v-if="entry.total_cost"><span>Total coût</span><span>{{ formatEur(entry.total_cost) }}</span></div>
        <div class="total-row" v-if="entry.margin_percent != null"><span>Marge</span><span>{{ Number(entry.margin_percent).toFixed(1) }}%</span></div>
      </div>

      <!-- Actions -->
      <div class="actions-section" v-if="entry.validation_status !== 'validated'">
        <button class="btn-pay" @click="markPaid" :disabled="paying">
          {{ paying ? 'Mise à jour…' : '✅ Valider le ticket' }}
        </button>
        <button class="btn-delete-entry" @click="deleteEntry" :disabled="deleting">
          {{ deleting ? 'Suppression…' : '🗑️ Supprimer' }}
        </button>
      </div>
    </template>

    <div v-else-if="!loading && error" class="error-state">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../../shared/api'

const route = useRoute()
const router = useRouter()
const entry = ref(null)
const loading = ref(true)
const error = ref('')
const paying = ref(false)
const deleting = ref(false)

const statusClass = computed(() => {
  const s = entry.value?.validation_status
  if (s === 'validated') return 'status-validated'
  if (s === 'has_errors') return 'status-pending'
  return 'status-pending'
})

const shiftLabel = computed(() => {
  const s = entry.value?.shift
  if (s === 'lunch') return '🍽️ Midi'
  if (s === 'dinner') return '🌙 Soir'
  if (s === 'all_day') return '📋 Journée'
  return s || '—'
})

function formatEur(v) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0) }

function formatDate(d) {
  if (!d) return '—'
  const parts = d.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return d
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.get(`/sales/entries/${route.params.id}`)
    const data = res.data || res
    entry.value = data
  } catch (e) {
    error.value = e.message || 'Impossible de charger le ticket'
  } finally {
    loading.value = false
  }
}

async function markPaid() {
  paying.value = true
  try {
    await api.put(`/sales/entries/${route.params.id}`, {
      validation_status: 'validated',
    })
    entry.value.validation_status = 'validated'
  } catch (e) {
    alert('Erreur: ' + (e.message || 'mise à jour échouée'))
  } finally {
    paying.value = false
  }
}

async function deleteEntry() {
  if (!confirm('Supprimer ce ticket ?')) return
  deleting.value = true
  try {
    await api.del(`/sales/entries/${route.params.id}`)
    router.push('/caisse')
  } catch (e) {
    alert('Erreur: ' + (e.message || 'suppression échouée'))
  } finally {
    deleting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.detail-view { padding: 16px; padding-bottom: 100px; }
.page-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.page-header h2 { font-size: 20px; color: #fff; margin: 0; flex: 1; }
.btn-back { background: none; border: none; color: #aaa; font-size: 14px; cursor: pointer; padding: 4px 0; }
.status-badge { font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; }
.status-paid { background: rgba(0,210,160,0.15); color: #00d2a0; }
.status-validated { background: rgba(108,92,231,0.15); color: #6c5ce7; }
.status-pending { background: rgba(255,193,7,0.15); color: #ffc107; }

.loading-state, .error-state { text-align: center; color: #888; padding: 40px 0; }

.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
.info-item { background: #1e1e32; border-radius: 10px; padding: 10px; }
.label { display: block; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
.value { font-size: 15px; color: #fff; font-weight: 600; }

.notes-card { background: #1e1e32; border-radius: 10px; padding: 12px; margin-bottom: 16px; }
.notes-card .label { margin-bottom: 6px; }
.notes-card p { margin: 0; color: #ddd; font-size: 14px; }

.section-title { font-size: 14px; font-weight: 700; color: #aaa; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
.line-items-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.line-item-row {
  background: #1e1e32; border-radius: 10px; padding: 10px 12px;
  display: flex; justify-content: space-between; align-items: center;
}
.li-product { display: flex; flex-direction: column; gap: 2px; }
.li-name { font-size: 14px; color: #fff; font-weight: 500; }
.li-match { font-size: 11px; color: #00d2a0; }
.li-details { display: flex; align-items: center; gap: 10px; }
.li-qty { font-size: 13px; color: #aaa; }
.li-price { font-size: 13px; color: #999; }
.li-total { font-size: 15px; font-weight: 700; color: #fff; min-width: 72px; text-align: right; }

.totals-card { background: #1e1e32; border-radius: 12px; padding: 14px; margin-bottom: 16px; }
.total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; color: #ccc; }
.total-row .ttc { font-size: 18px; font-weight: 700; color: #fff; }

.actions-section { display: flex; gap: 10px; }
.btn-pay {
  flex: 1; padding: 14px; border: none; border-radius: 10px;
  background: #00d2a0; color: #0f0f1a; font-size: 15px; font-weight: 700; cursor: pointer;
}
.btn-delete-entry {
  padding: 14px; border: 1px solid rgba(255,107,107,0.3); border-radius: 10px;
  background: transparent; color: #ff6b6b; font-size: 14px; cursor: pointer;
}
.btn-pay:disabled, .btn-delete-entry:disabled { opacity: 0.4; }
</style>