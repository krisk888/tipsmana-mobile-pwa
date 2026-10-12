<template>
  <div class="new-ticket-view">
    <header class="page-header">
      <h2>🧾 Nouveau ticket</h2>
      <p class="subtitle">Saisie rapide de vente</p>
    </header>

    <!-- Shift -->
    <div class="shift-row">
      <button
        v-for="s in shifts"
        :key="s.value"
        class="shift-btn"
        :class="{ active: shift === s.value }"
        @click="shift = s.value"
      >
        {{ s.label }}
      </button>
    </div>

    <!-- Line items -->
    <div class="items-section">
      <div v-for="(item, index) in lineItems" :key="index" class="item-card">
        <div class="item-top">
          <input
            v-model="item.item_name_original"
            class="item-name-input"
            list="product-suggestions"
            placeholder="Article (ex: Boeuf Bourguignon)"
          />
          <button class="btn-delete" @click="removeLineItem(index)" :disabled="lineItems.length <= 1">✕</button>
        </div>
        <div class="item-bottom">
          <div class="qty-stepper">
            <button class="step-btn" @click="item.quantity = Math.max(1, item.quantity - 1)">−</button>
            <span class="qty-value">{{ item.quantity }}</span>
            <button class="step-btn" @click="item.quantity++">+</button>
          </div>
          <input
            v-model.number="item.unit_price_ttc"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            class="price-input"
            placeholder="€ TTC"
          />
          <span class="line-total">{{ formatEur(item.quantity * (item.unit_price_ttc || 0)) }}</span>
        </div>
      </div>
      <button class="btn-add-line" @click="addLineItem">+ Ajouter une ligne</button>
    </div>

    <!-- Notes -->
    <input v-model="notes" class="notes-input" placeholder="Note (optionnel)" />

    <datalist id="product-suggestions">
      <option v-for="p in suggestions" :key="p.id" :value="p.name" />
    </datalist>

    <!-- Footer total + submit -->
    <div class="action-bar">
      <div class="total-block">
        <span class="total-label">Total TTC</span>
        <span class="total-value">{{ formatEur(totalSales) }}</span>
      </div>
      <button class="btn-submit" @click="submit" :disabled="!isValid || submitting">
        {{ submitting ? 'Envoi…' : 'Enregistrer le ticket' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../../shared/api'
import { auth } from '../../shared/auth'

const router = useRouter()

const shifts = [
  { value: 'lunch', label: '🍽️ Midi' },
  { value: 'dinner', label: '🌙 Soir' },
  { value: 'all_day', label: '📋 Journée' },
]
const shift = ref('lunch')
const notes = ref('')
const suggestions = ref([])
const submitting = ref(false)

const lineItems = ref([
  { item_name_original: '', quantity: 1, unit_price_ttc: null },
])

const todayISO = (() => {
  const today = new Date()
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
})()

function formatEur(v) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0) }

const addLineItem = () => lineItems.value.push({ item_name_original: '', quantity: 1, unit_price_ttc: null })
const removeLineItem = (index) => {
  if (lineItems.value.length > 1) lineItems.value.splice(index, 1)
}

const totalSales = computed(() =>
  lineItems.value.reduce((sum, item) => sum + (item.quantity || 0) * (item.unit_price_ttc || 0), 0),
)

const validLineItems = computed(() =>
  lineItems.value.filter((item) => item.item_name_original.trim() && item.quantity > 0 && item.unit_price_ttc > 0),
)

const isValid = computed(() => validLineItems.value.length > 0)

async function loadSuggestions() {
  try {
    const res = await api.get('/products?per_page=100&is_active=true&sort_by=name')
    const data = res.data || res
    let list = []
    if (Array.isArray(data)) {
      list = data
    } else {
      if (Array.isArray(data.kitchen)) list = list.concat(data.kitchen)
      if (Array.isArray(data.dining_room)) list = list.concat(data.dining_room)
      if (Array.isArray(data.kitchen_dining_room)) list = list.concat(data.kitchen_dining_room)
      if (Array.isArray(data.products)) list = list.concat(data.products)
    }
    suggestions.value = list
  } catch {
    suggestions.value = []
  }
}

async function submit() {
  if (!isValid.value || submitting.value) return
  submitting.value = true
  try {
    const payload = {
      establishment_id: auth.defaultEstablishmentId || auth.establishments?.[0]?.id,
      date: todayISO,
      shift: shift.value,
      entry_type: 'manual',
      notes: notes.value.trim() || null,
      line_items: validLineItems.value.map((item) => ({
        item_name_original: item.item_name_original.trim(),
        quantity: item.quantity,
        unit_price_ttc: item.unit_price_ttc,
      })),
    }
    await api.post('/sales/entries', payload)
    router.push('/caisse')
  } catch (e) {
    if (e.status === 409) {
      alert('Un ticket existe déjà pour ce service. Retour à la caisse pour le modifier.')
      router.push('/caisse')
    } else {
      alert('Erreur: ' + (e.message || 'envoi impossible'))
    }
  } finally {
    submitting.value = false
  }
}

onMounted(loadSuggestions)
</script>

<style scoped>
.new-ticket-view { padding: 16px; padding-bottom: 120px; }
.page-header { margin-bottom: 16px; }
.page-header h2 { font-size: 22px; color: #fff; margin: 0; }
.subtitle { font-size: 13px; color: #888; margin-top: 4px; }

.shift-row { display: flex; gap: 8px; margin-bottom: 16px; }
.shift-btn {
  flex: 1; padding: 12px 8px; border-radius: 10px; border: 1px solid #2a2a40;
  background: #1e1e32; color: #888; font-size: 14px; font-weight: 600; cursor: pointer;
}
.shift-btn.active { background: #6c5ce7; border-color: #6c5ce7; color: #fff; }

.items-section { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
.item-card { background: #1e1e32; border-radius: 12px; padding: 12px; }
.item-top { display: flex; gap: 8px; margin-bottom: 10px; }
.item-name-input {
  flex: 1; background: #0f0f1a; border: 1px solid #2a2a40; border-radius: 8px;
  padding: 10px 12px; color: #fff; font-size: 15px;
}
.btn-delete {
  width: 36px; height: 36px; border: none; border-radius: 8px;
  background: rgba(255,107,107,0.15); color: #ff6b6b; font-size: 14px; cursor: pointer;
}
.btn-delete:disabled { opacity: 0.3; }
.item-bottom { display: flex; align-items: center; gap: 10px; }
.qty-stepper {
  display: flex; align-items: center; gap: 6px;
  background: #0f0f1a; border: 1px solid #2a2a40; border-radius: 8px; padding: 4px;
}
.step-btn {
  width: 32px; height: 32px; border: none; border-radius: 6px;
  background: #2a2a40; color: #fff; font-size: 16px; cursor: pointer;
}
.qty-value { min-width: 24px; text-align: center; font-weight: 700; color: #fff; }
.price-input {
  flex: 1; background: #0f0f1a; border: 1px solid #2a2a40; border-radius: 8px;
  padding: 10px; color: #fff; font-size: 15px; text-align: right;
}
.line-total { min-width: 72px; text-align: right; font-weight: 700; color: #00d2a0; }

.btn-add-line {
  width: 100%; padding: 12px; border: 1px dashed #2a2a40; border-radius: 10px;
  background: transparent; color: #aaa; font-size: 14px; font-weight: 600; cursor: pointer;
}
.notes-input {
  width: 100%; background: #0f0f1a; border: 1px solid #2a2a40; border-radius: 8px;
  padding: 12px; color: #fff; font-size: 14px; margin-bottom: 16px; box-sizing: border-box;
}

.action-bar {
  position: fixed; left: 16px; right: 16px; bottom: 76px;
  background: #1a1a2e; border: 1px solid #2a2a40; border-radius: 14px;
  padding: 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  z-index: 90;
}
.total-block { display: flex; flex-direction: column; }
.total-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
.total-value { font-size: 22px; font-weight: 700; color: #fff; }
.btn-submit {
  flex: 1; padding: 14px; border: none; border-radius: 10px;
  background: #00d2a0; color: #0f0f1a; font-size: 15px; font-weight: 700; cursor: pointer;
}
.btn-submit:disabled { opacity: 0.4; }
</style>
