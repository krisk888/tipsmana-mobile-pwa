<template>
  <div class="sr-shell">
    <!-- ═══ HEADER ═══ -->
    <header class="sr-header">
      <button class="sr-back" :title="t('service.backToTables')" @click="router.push('/service')">←</button>
      <div class="sr-header-main">
        <h1 class="sr-title">📊 {{ t('service.report.title') }}</h1>
        <span class="sr-subtitle">{{ establishmentName }}</span>
      </div>
      <button class="sr-icon-btn" :disabled="loading" :title="t('common.refresh')" @click="load()">
        <span :class="{ spinning: loading }">⟳</span>
      </button>
    </header>

    <label class="sr-date">
      <span>{{ t('service.report.date') }}</span>
      <input v-model="date" type="date" :max="today" class="sr-date-input" @change="load()" />
    </label>

    <!-- ═══ ÉTATS ═══ -->
    <div v-if="loading && !report" class="sr-state">
      <span class="sr-spinner"></span>
      <p>{{ t('service.report.loading') }}</p>
    </div>
    <div v-else-if="error && !report" class="sr-state" role="alert">
      <p>⚠️ {{ error }}</p>
      <button class="sr-btn" @click="load()">{{ t('common.retry') }}</button>
    </div>

    <template v-else-if="report">
      <!-- ═══ CHIFFRES CLÉS ═══ -->
      <section class="sr-hero">
        <span class="sr-hero-label">{{ t('service.report.kpi.revenue') }}</span>
        <span class="sr-hero-value" data-test="revenue">{{ formatEur(report.revenue) }}</span>
        <span class="sr-hero-sub">{{ t('service.report.kpi.averageTicket') }} {{ formatEur(report.averageTicket) }}
          · {{ t('service.report.kpi.averageCover') }} {{ formatEur(report.averageCover) }}</span>
      </section>
      <section class="sr-kpis">
        <div class="sr-kpi">
          <span class="sr-kpi-value" data-test="covers">{{ report.covers }}</span>
          <span class="sr-kpi-label">{{ t('service.report.kpi.covers') }}</span>
        </div>
        <div class="sr-kpi">
          <span class="sr-kpi-value" data-test="tickets">{{ report.tickets }}</span>
          <span class="sr-kpi-label">{{ t('service.report.kpi.tickets') }}</span>
        </div>
        <div class="sr-kpi">
          <span class="sr-kpi-value" data-test="tables">{{ report.tables }}</span>
          <span class="sr-kpi-label">{{ t('service.report.kpi.tables') }}</span>
        </div>
      </section>

      <!-- ═══ PAIEMENTS ═══ -->
      <section class="sr-card">
        <h2 class="sr-card-title">{{ t('service.report.paymentsTitle') }}</h2>
        <ul class="sr-pay-list">
          <li v-for="row in payments" :key="row.key" class="sr-pay" :data-method="row.key">
            <div class="sr-pay-line">
              <span>{{ t(row.labelKey) }}</span>
              <span class="sr-pay-amount">{{ formatEur(row.amount) }} <span class="sr-pay-share">{{ Math.round(row.share * 100) }} %</span></span>
            </div>
            <div class="sr-bar" aria-hidden="true"><span :style="{ width: (row.share * 100) + '%' }"></span></div>
          </li>
        </ul>
      </section>

      <!-- ═══ TOP ARTICLES ═══ -->
      <section class="sr-card">
        <h2 class="sr-card-title">{{ t('service.report.topTitle') }}</h2>
        <p v-if="!report.topItems.length" class="sr-empty">{{ t('service.report.noSales') }}</p>
        <ol v-else class="sr-top">
          <li v-for="(item, i) in report.topItems" :key="item.name + i" class="sr-top-item">
            <span class="sr-top-rank">{{ i + 1 }}</span>
            <span class="sr-top-name">{{ item.name }}</span>
            <span class="sr-top-qty">× {{ item.quantity }}</span>
            <span class="sr-top-amount">{{ formatEur(item.amount) }}</span>
          </li>
        </ol>
      </section>

      <!-- ═══ EXPORT ═══ -->
      <div class="sr-actions">
        <button class="sr-btn sr-btn-secondary" data-test="export" @click="exportPdf">📄 {{ t('service.report.exportPdf') }}</button>
        <button class="sr-btn" data-test="share" @click="share">📤 {{ t('service.report.share') }}</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '../../i18n'
import { useAuthStore } from '../../stores/authStore'
import { formatEur } from '../../shared/serviceOrders'
import {
  fetchServiceReport, localIsoDate, paymentRows, reportText, reportFileName,
  buildReportPdf, shareReport, downloadReport,
} from '../../shared/serviceReport'

const router = useRouter()
const authStore = useAuthStore()
const { t, intlLocale } = useI18n()

const today = localIsoDate()
const date = ref(today)
const report = ref(null)
const loading = ref(false)
const error = ref(null)

const establishmentName = computed(() => authStore.establishment?.name || '')
const payments = computed(() => (report.value ? paymentRows(report.value) : []))

const dateLabel = computed(() => {
  const [y, m, d] = (report.value?.date || date.value).split('-').map(Number)
  return new Intl.DateTimeFormat(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(y, m - 1, d))
})

let loadSeq = 0
async function load() {
  if (!date.value) return
  const seq = ++loadSeq
  loading.value = true
  error.value = null
  try {
    const r = await fetchServiceReport(date.value)
    if (seq === loadSeq) report.value = r
  } catch (e) {
    if (seq !== loadSeq) return
    report.value = null
    error.value = e.status === 404 ? t('service.report.unavailable') : (e.message || t('common.errors.generic'))
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

function exportOptions() {
  return {
    t,
    fmt: formatEur,
    dateLabel: dateLabel.value,
    establishment: establishmentName.value,
    generatedAt: new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
  }
}

function exportPdf() {
  if (!report.value) return
  downloadReport(buildReportPdf(report.value, exportOptions()), reportFileName(report.value.date))
}

async function share() {
  if (!report.value) return
  const opts = exportOptions()
  const result = await shareReport({
    blob: buildReportPdf(report.value, opts),
    fileName: reportFileName(report.value.date),
    title: t('service.report.shareTitle', { date: opts.dateLabel }),
    text: reportText(report.value, opts),
  })
  if (result === 'downloaded') window.__showToast?.(t('service.report.downloaded'))
}

onMounted(load)
</script>

<style scoped>
.sr-shell {
  display: flex; flex-direction: column; gap: 12px;
  min-height: 100dvh;
  padding: 12px 12px calc(90px + env(safe-area-inset-bottom));
  background: var(--bg, #0d0d14);
  color: var(--text, #fff);
}

.sr-header { display: flex; align-items: center; gap: 8px; }
.sr-header-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.sr-title { font-size: 20px; font-weight: 800; margin: 0; }
.sr-subtitle { font-size: 12px; color: var(--muted, #8a8aa0); }
.sr-back, .sr-icon-btn {
  width: 38px; height: 38px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e);
  color: var(--text, #fff); font-size: 18px; cursor: pointer;
}
.sr-icon-btn:disabled { opacity: 0.5; }
.spinning { display: inline-block; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.sr-date { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--muted, #8a8aa0); }
.sr-date-input {
  min-height: 40px; padding: 0 10px; border-radius: 10px;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e); color: var(--text, #fff);
  font: inherit;
}

.sr-state { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 40px 0; color: var(--muted, #8a8aa0); text-align: center; }
.sr-spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--card-border, #2a2a40); border-top-color: #059669; animation: spin 0.9s linear infinite; }

.sr-hero {
  display: flex; flex-direction: column; gap: 2px;
  padding: 16px; border-radius: 14px; background: var(--card-bg, #1a1a2e);
}
.sr-hero-label { font-size: 12px; color: var(--muted, #8a8aa0); text-transform: uppercase; letter-spacing: 0.04em; }
.sr-hero-value { font-size: 32px; font-weight: 800; font-variant-numeric: tabular-nums; }
.sr-hero-sub { font-size: 12px; color: var(--muted, #8a8aa0); }

.sr-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.sr-kpi { display: flex; flex-direction: column; align-items: center; padding: 12px 6px; border-radius: 12px; background: var(--card-bg, #1a1a2e); }
.sr-kpi-value { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
.sr-kpi-label { font-size: 11px; color: var(--muted, #8a8aa0); text-align: center; }

.sr-card { padding: 14px; border-radius: 14px; background: var(--card-bg, #1a1a2e); }
.sr-card-title { font-size: 15px; font-weight: 800; margin: 0 0 10px; }
.sr-empty { font-size: 13px; color: var(--muted, #8a8aa0); }

.sr-pay-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.sr-pay-line { display: flex; justify-content: space-between; font-size: 14px; }
.sr-pay-amount { font-weight: 700; font-variant-numeric: tabular-nums; }
.sr-pay-share { font-weight: 400; color: var(--muted, #8a8aa0); margin-left: 4px; }
/* Une seule teinte : la barre porte la grandeur, le libellé porte l'identité */
.sr-bar { height: 6px; margin-top: 4px; border-radius: 3px; background: var(--card-border, #2a2a40); overflow: hidden; }
.sr-bar span { display: block; height: 100%; border-radius: 3px; background: #059669; }

.sr-top { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.sr-top-item { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.sr-top-rank {
  width: 24px; height: 24px; flex-shrink: 0; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 800; background: var(--card-border, #2a2a40);
}
.sr-top-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr-top-qty { color: var(--muted, #8a8aa0); font-variant-numeric: tabular-nums; }
.sr-top-amount { font-weight: 700; font-variant-numeric: tabular-nums; min-width: 72px; text-align: right; }

.sr-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sr-btn {
  min-height: 46px; border-radius: 12px; border: 1px solid #059669;
  background: #059669; color: #fff; font-weight: 800; font-size: 15px; cursor: pointer;
}
.sr-btn-secondary { background: transparent; color: var(--text, #fff); border-color: var(--card-border, #2a2a40); }
</style>
