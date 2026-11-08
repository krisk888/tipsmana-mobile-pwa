<template>
  <div class="wc-shell">
    <header class="wc-header">
      <img src="/images/logo_icon_m.jpg" alt="" class="wc-logo" />
      <div class="wc-header-main">
        <div class="wc-kicker">{{ t('waiterCall.kicker') }}</div>
        <div class="wc-title">{{ tableNumber ? t('common.table', { number: tableNumber }) : t('waiterCall.title') }}</div>
      </div>
    </header>

    <!-- Pas de table dans le lien : le QR code n'a pas été scanné -->
    <div v-if="!tableNumber" class="wc-state">
      <span class="wc-state-icon">📷</span>
      <p class="wc-state-title">{{ t('waiterCall.noTableTitle') }}</p>
      <p class="wc-state-text">{{ t('waiterCall.noTableText') }}</p>
    </div>

    <main v-else class="wc-main">
      <button
        class="wc-call"
        :class="{ done: !!sentAt(main.code) }"
        :disabled="busy || !!sentAt(main.code)"
        @click="send(main.code)"
      >
        <span class="wc-call-icon">{{ main.icon }}</span>
        <span>{{ t(main.labelKey) }}</span>
      </button>

      <p class="wc-or">{{ t('waiterCall.orPreset') }}</p>

      <div class="wc-presets">
        <button
          v-for="m in presets"
          :key="m.code"
          class="wc-preset"
          :class="{ done: !!sentAt(m.code) }"
          :disabled="busy || !!sentAt(m.code)"
          @click="send(m.code)"
        >
          <span class="wc-preset-icon">{{ m.icon }}</span>
          <span class="wc-preset-label">{{ t(m.labelKey) }}</span>
          <span v-if="sentAt(m.code)" class="wc-preset-sent">✓ {{ formatTime(sentAt(m.code)) }}</span>
        </button>
      </div>

      <div v-if="feedback" class="wc-feedback" :class="feedback.kind" role="status">{{ feedback.text }}</div>
    </main>

    <footer class="wc-footer">
      <LanguageSwitcher />
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { WAITER_CALL_MESSAGES, callWaiter, lastCallAt, tableFromRoute } from '../../shared/waiterCall'
import LanguageSwitcher from '../../components/LanguageSwitcher.vue'
import { useI18n } from '../../i18n'

const { t, intlLocale } = useI18n()
const route = useRoute()

const tableNumber = computed(() => tableFromRoute(route))
const main = WAITER_CALL_MESSAGES[0]
const presets = WAITER_CALL_MESSAGES.slice(1)

const busy = ref(false)
const feedback = ref(null)
// Horloge : les boutons se réactivent à la fin du délai entre deux appels
const now = ref(Date.now())
let ticker = null

function sentAt(code) {
  return tableNumber.value ? lastCallAt(tableNumber.value, code, now.value) : null
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' })
}

async function send(code) {
  if (busy.value || !tableNumber.value) return
  busy.value = true
  feedback.value = null
  try {
    const res = await callWaiter(tableNumber.value, code)
    now.value = Date.now()
    feedback.value = res.ok
      ? { kind: 'ok', text: t('waiterCall.sent') }
      : { kind: 'error', text: t(`waiterCall.errors.${res.reason}`) }
  } finally {
    busy.value = false
  }
}

onMounted(() => { ticker = setInterval(() => { now.value = Date.now() }, 5000) })
onUnmounted(() => clearInterval(ticker))
</script>

<style scoped>
/* Page client : claire et lisible quel que soit le thème de l'app */
.wc-shell {
  display: flex; flex-direction: column;
  min-height: 100dvh;
  background: #fafaf7; color: #111827;
  font-size: 18px;
}

.wc-header {
  display: flex; align-items: center; gap: 14px;
  padding: calc(18px + env(safe-area-inset-top)) 20px 18px;
  border-bottom: 1px solid #e5e7eb; background: #fff;
}
.wc-logo { width: 44px; height: 44px; border-radius: 12px; object-fit: cover; }
.wc-kicker { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #059669; }
.wc-title { font-size: 30px; font-weight: 800; line-height: 1.1; }

.wc-main { flex: 1; display: flex; flex-direction: column; gap: 14px; padding: 24px 20px; }

.wc-call {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  min-height: 96px; border: none; border-radius: 20px; cursor: pointer;
  background: #059669; color: #fff; font-size: 24px; font-weight: 800;
  box-shadow: 0 8px 24px rgba(5, 150, 105, 0.3);
}
.wc-call:active:not(:disabled) { transform: scale(0.98); }
.wc-call-icon { font-size: 34px; }
.wc-call.done { background: #d1fae5; color: #065f46; box-shadow: none; }

.wc-or { margin: 8px 0 0; font-size: 15px; font-weight: 700; color: #6b7280; text-align: center; }

.wc-presets { display: flex; flex-direction: column; gap: 10px; }
.wc-preset {
  display: flex; align-items: center; gap: 14px;
  min-height: 64px; padding: 0 18px; border-radius: 16px; cursor: pointer;
  border: 1px solid #e5e7eb; background: #fff; color: #111827;
  font-size: 19px; font-weight: 700; text-align: left;
}
.wc-preset:active:not(:disabled) { background: #f3f4f6; }
.wc-preset.done { border-color: #10b981; background: #ecfdf5; }
.wc-preset-icon { font-size: 26px; }
.wc-preset-label { flex: 1; }
.wc-preset-sent { font-size: 14px; font-weight: 700; color: #059669; }
button:disabled { cursor: default; }

.wc-feedback { padding: 14px 16px; border-radius: 14px; font-size: 16px; font-weight: 600; text-align: center; }
.wc-feedback.ok { background: #ecfdf5; color: #065f46; }
.wc-feedback.error { background: #fef3c7; color: #92400e; }

.wc-state {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  padding: 48px 24px; text-align: center;
}
.wc-state-icon { font-size: 64px; }
.wc-state-title { margin: 0; font-size: 26px; font-weight: 800; }
.wc-state-text { margin: 0; font-size: 18px; color: #6b7280; }

.wc-footer {
  display: flex; justify-content: center;
  padding: 12px 20px calc(16px + env(safe-area-inset-bottom));
}
</style>
