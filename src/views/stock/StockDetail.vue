<template>
  <div class="detail-view">
    <header class="page-header">
      <button class="back-btn" @click="$router.push('/stock')">←</button>
      <div>
        <h2>{{ session.session_name || t('stock.detail.fallbackTitle') }}</h2>
        <p class="subtitle">{{ statusLabel(session.status) }} · {{ fmtDate(session.session_date) }}</p>
      </div>
    </header>

    <div v-if="loading" class="state">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="state error">{{ error }}</div>

    <template v-else>
      <div class="info-card">
        <div class="info-row"><span>{{ t('stock.detail.type') }}</span><b>{{ typeLabel(session.session_type) }}</b></div>
        <div class="info-row"><span>{{ t('stock.detail.startedBy') }}</span><b>{{ session.started_by_user_name || '—' }}</b></div>
        <div class="info-row" v-if="session.completed_at"><span>{{ t('stock.detail.completed') }}</span><b>{{ fmtDateTime(session.completed_at) }}</b></div>
        <div class="info-row" v-if="session.validated_at"><span>{{ t('stock.detail.validated') }}</span><b>{{ fmtDateTime(session.validated_at) }}</b></div>
        <div class="info-row" v-if="session.notes"><span>{{ t('stock.detail.notes') }}</span><b>{{ session.notes }}</b></div>
      </div>

      <div class="actions" v-if="session.status === 'in_progress'">
        <button class="btn-complete" @click="completeSession">{{ t('stock.detail.complete') }}</button>
      </div>

      <h3 class="section-title">{{ t('stock.detail.counts', { n: counts.length }) }}</h3>
      <div v-if="counts.length === 0" class="state empty">
        <p>{{ t('stock.detail.empty') }}</p>
        <router-link to="/scan" class="btn-scan">{{ t('stock.detail.scan') }}</router-link>
      </div>
      <div v-for="c in counts" :key="c.id" class="count-card">
        <div class="count-head">
          <strong>{{ c.product_name || c.product_id }}</strong>
          <span class="count-qty">{{ c.quantity != null ? c.quantity : '—' }} {{ c.unit || t('stock.unitShort') }}</span>
        </div>
        <div class="count-meta" v-if="c.expected_quantity != null">
          <span>{{ t('stock.detail.theoretical', { n: c.expected_quantity }) }}</span>
          <span :class="varianceClass(c)">{{ t('stock.detail.variance', { v: variance(c) }) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '../../shared/api'
import { useI18n } from '../../i18n'

const { t, intlLocale } = useI18n()

const route = useRoute()
const session = ref({})
const counts = ref([])
const loading = ref(true)
const error = ref(null)

function statusLabel(s) {
  return ['in_progress', 'completed', 'validated', 'cancelled'].includes(s) ? t(`stock.status.${s}`) : (s || '—')
}
function typeLabel(type) {
  return ['physical_count', 'theoretical'].includes(type) ? t(`stock.detail.types.${type}`) : (type || '—')
}
function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(intlLocale(), { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(intlLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function variance(c) {
  if (c.quantity == null || c.expected_quantity == null) return '—'
  const v = Number(c.quantity) - Number(c.expected_quantity)
  return v > 0 ? '+' + v : v
}
function varianceClass(c) {
  if (c.quantity == null || c.expected_quantity == null) return ''
  const v = Number(c.quantity) - Number(c.expected_quantity)
  return v === 0 ? 'ok' : v > 0 ? 'over' : 'under'
}

async function load() {
  loading.value = true
  try {
    const [sRes, cRes] = await Promise.all([
      api.get(`/inventory/sessions/${route.params.id}/light`),
      api.get(`/inventory/sessions/${route.params.id}/counts`),
    ])
    session.value = sRes.data || sRes || {}
    const cd = cRes.data || cRes || {}
    const items = Array.isArray(cd) ? cd : (cd.items || cd.kitchen?.items || cd.dining_room?.items || [])
    counts.value = Array.isArray(items) ? items : []
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function completeSession() {
  try {
    await api.put(`/inventory/sessions/${route.params.id}/complete`, {})
    await load()
  } catch (e) {
    error.value = e.message || t('stock.detail.closeFailed')
  }
}

onMounted(load)
</script>

<style scoped>
.detail-view { padding: 16px; padding-bottom: 80px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.page-header h2 { font-size: 20px; color: #fff; margin: 0; word-break: break-word; }
.subtitle { font-size: 12px; color: #888; margin-top: 2px; }
.back-btn { background: #1e1e32; border: none; color: #fff; width: 34px; height: 34px; border-radius: 10px; font-size: 16px; cursor: pointer; }
.state { text-align: center; color: #666; padding: 40px; }
.state.error { color: #ff6b6b; }
.info-card { background: #1e1e32; border-radius: 12px; padding: 14px; margin-bottom: 16px; }
.info-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
.info-row span { color: #888; }
.info-row b { color: #fff; font-weight: 600; }
.actions { margin-bottom: 16px; }
.btn-complete { background: #00d2a0; color: #0a0a1a; border: none; border-radius: 8px; padding: 12px; font-size: 14px; font-weight: 700; width: 100%; cursor: pointer; }
.section-title { font-size: 14px; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
.count-card { background: #1e1e32; border-radius: 12px; padding: 14px; margin-bottom: 8px; }
.count-head { display: flex; justify-content: space-between; align-items: center; }
.count-head strong { color: #fff; font-size: 14px; }
.count-qty { font-weight: 700; color: #00d2a0; }
.count-meta { display: flex; gap: 12px; font-size: 12px; color: #888; margin-top: 6px; }
.count-meta .ok { color: #00d2a0; }
.count-meta .over { color: #f7b731; }
.count-meta .under { color: #ff6b6b; }
.empty { padding: 30px 0; }
.btn-scan { display: inline-block; margin-top: 10px; background: #6c5ce7; color: #fff; text-decoration: none; border-radius: 8px; padding: 10px 20px; font-size: 14px; font-weight: 600; }
</style>
