<template>
  <div class="recep-view">
    <header class="page-header">
      <button class="back-btn" @click="$router.push('/stock')">←</button>
      <div>
        <h2>{{ t('stock.receptions.title') }}</h2>
        <p class="subtitle">{{ t('stock.receptions.subtitle') }}</p>
      </div>
    </header>

    <div v-if="loading" class="state">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="movements.length === 0" class="state empty">
      <span class="empty-icon">🚚</span>
      <p>{{ t('stock.receptions.empty') }}</p>
    </div>

    <div v-else class="mov-list">
      <div v-for="m in movements" :key="m.id" class="mov-card">
        <div class="mov-head">
          <strong>{{ m.product_name || m.product_id || t('stock.productFallback') }}</strong>
          <span class="qty" :class="movClass(m.movement_type)">{{ sign(m.quantity) }} {{ unit(m) }}</span>
        </div>
        <div class="mov-meta">
          <span>{{ typeLabel(m.movement_type) }}</span>
          <span>{{ fmtDate(m.created_at || m.movement_date) }}</span>
          <span v-if="m.supplier_name">· {{ m.supplier_name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../shared/api'
import { useI18n } from '../../i18n'

const { t, intlLocale } = useI18n()

const movements = ref([])
const loading = ref(true)
const error = ref(null)

function sign(q) {
  const n = Number(q)
  return (isNaN(n) ? q : n > 0 ? '+' + n : n)
}
function unit(m) {
  return m.unit || m.unit_name || (m.quantity != null ? t('stock.unitShort') : '')
}
const MOVEMENT_TYPES = ['delivery', 'reception', 'purchase', 'transfer_in', 'adjustment', 'loss', 'transfer_out', 'consumption']
function typeLabel(type) {
  if (MOVEMENT_TYPES.includes(type)) return t(`stock.receptions.types.${type}`)
  return type || t('stock.receptions.movementFallback')
}
function movClass(type) {
  return ['delivery', 'reception', 'purchase', 'transfer_in', 'adjustment'].includes(type) ? 'in' : 'out'
}
function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(intlLocale(), { day: '2-digit', month: 'short' })
}

async function load() {
  loading.value = true
  try {
    const res = await api.get('/inventory/deliveries')
    const data = res.data || res || {}
    const out = []
    if (Array.isArray(data)) out.push(...data)
    else {
      out.push(...(data.kitchen?.movements || []))
      out.push(...(data.dining_room?.movements || []))
    }
    movements.value = out
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.recep-view { padding: 16px; padding-bottom: 80px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.page-header h2 { font-size: 20px; color: #fff; margin: 0; }
.subtitle { font-size: 12px; color: #888; margin-top: 2px; }
.back-btn { background: #1e1e32; border: none; color: #fff; width: 34px; height: 34px; border-radius: 10px; font-size: 16px; cursor: pointer; }
.state { text-align: center; color: #666; padding: 40px; }
.state.error { color: #ff6b6b; }
.empty-icon { font-size: 44px; }
.mov-card { background: #1e1e32; border-radius: 12px; padding: 14px; margin-bottom: 8px; }
.mov-head { display: flex; justify-content: space-between; align-items: center; }
.mov-head strong { color: #fff; font-size: 14px; }
.qty { font-weight: 700; font-size: 14px; }
.qty.in { color: #00d2a0; }
.qty.out { color: #ff6b6b; }
.mov-meta { display: flex; gap: 10px; font-size: 12px; color: #888; margin-top: 6px; }
</style>
