<template>
  <div class="validations-view">
    <header class="page-header">
      <h2>✅ Validations</h2>
      <p class="subtitle">Factures fournisseurs en attente</p>
    </header>

    <div v-if="loading" class="loading-state">Chargement...</div>
    <div v-else-if="error" class="error-state">{{ error }}</div>
    <div v-else-if="!invoices.length" class="empty-state">
      <p class="empty-icon">✅</p>
      <p>Tout est à jour !</p>
    </div>

    <div v-else class="invoice-list">
      <div v-for="inv in invoices" :key="inv.id" class="invoice-card">
        <div class="inv-header">
          <strong>{{ inv.supplier?.name || inv.invoice_number || 'Fournisseur inconnu' }}</strong>
          <span class="inv-amount">{{ formatEur(inv.total_ttc) }}</span>
        </div>
        <p class="inv-meta">{{ inv.date }} • {{ inv.counts?.lines ?? 0 }} lignes</p>
        <div class="inv-actions">
          <button class="btn-approve" :disabled="busy[inv.id] || inv.workflow?.can_validate === false" @click="approve(inv.id)">Approuver</button>
          <button class="btn-reject" :disabled="busy[inv.id]" @click="reject(inv.id)">Rejeter</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../shared/api'

const invoices = ref([])
const loading = ref(true)
const error = ref(null)
const busy = ref({})

function formatEur(v) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0) }

async function load() {
  loading.value = true
  try {
    // InvoiceStatus backend : pending_ocr | pending_validation | validated | rejected | paid
    const res = await api.get('/costs/invoices/list?status=pending_validation&limit=50')
    const data = res.data || res
    invoices.value = data.items || []
  } catch (e) {
    error.value = e.message
    invoices.value = []
  } finally {
    loading.value = false
  }
}

async function run(id, call) {
  busy.value[id] = true
  try {
    await call()
    invoices.value = invoices.value.filter(i => i.id !== id)
  } catch (e) {
    alert('Erreur: ' + e.message)
  } finally {
    busy.value[id] = false
  }
}

function approve(id) {
  return run(id, () => api.post(`/costs/invoices/${id}/validate`, { apply_price_changes: true }))
}

function reject(id) {
  const reason = prompt('Motif du rejet ?')
  if (!reason?.trim()) return
  return run(id, () => api.post(`/costs/invoices/${id}/reject`, { reason: reason.trim() }))
}

onMounted(load)
</script>

<style scoped>
.validations-view { padding: 16px; padding-bottom: 80px; }
.page-header { margin-bottom: 16px; }
.page-header h2 { font-size: 22px; color: #fff; margin: 0; }
.subtitle { font-size: 13px; color: #888; margin-top: 4px; }
.loading-state, .error-state, .empty-state { color: #666; text-align: center; padding: 40px; }
.empty-icon { font-size: 48px; margin-bottom: 8px; }
.invoice-card {
  background: #1e1e32; border-radius: 12px; padding: 16px; margin-bottom: 10px;
}
.inv-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.inv-header strong { color: #fff; font-size: 15px; }
.inv-amount { color: #6c5ce7; font-weight: 700; font-size: 16px; }
.inv-meta { font-size: 12px; color: #888; }
.inv-actions { display: flex; gap: 8px; margin-top: 12px; }
.btn-approve, .btn-reject {
  flex: 1; padding: 10px; border: none; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer;
}
.btn-approve { background: #00d2a0; color: #0f0f1a; }
.btn-reject { background: #ff6b6b; color: #fff; }
.inv-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>