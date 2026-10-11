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
          <strong>{{ inv.supplier_name }}</strong>
          <span class="inv-amount">{{ formatEur(inv.total_ttc) }}</span>
        </div>
        <p class="inv-meta">{{ inv.date }} • {{ inv.items_count }} lignes</p>
        <div class="inv-actions">
          <button class="btn-approve" @click="validate(inv.id, 'approved')">Approuver</button>
          <button class="btn-reject" @click="validate(inv.id, 'rejected')">Rejeter</button>
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

function formatEur(v) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0) }

async function load() {
  loading.value = true
  try {
    const res = await api.get('/costs/invoices?status=pending')
    invoices.value = res.data || res.results || []
  } catch (e) {
    error.value = e.message
    // Demo data
    invoices.value = [
      { id: '1', supplier_name: 'France Boissons', total_ttc: 1240.50, date: '2026-10-09', items_count: 12 },
      { id: '2', supplier_name: 'Metro', total_ttc: 845.30, date: '2026-10-08', items_count: 8 },
      { id: '3', supplier_name: 'Bret\'s Fraîcheur', total_ttc: 312.00, date: '2026-10-07', items_count: 5 },
    ]
  } finally {
    loading.value = false
  }
}

async function validate(id, status) {
  try {
    await api.post(`/costs/invoices/${id}/validate`, { status })
    invoices.value = invoices.value.filter(i => i.id !== id)
  } catch (e) {
    alert('Erreur: ' + e.message)
  }
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
</style>