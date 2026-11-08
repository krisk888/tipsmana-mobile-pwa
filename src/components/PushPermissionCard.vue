<template>
  <div v-if="state !== 'active'" class="push-card" :class="state" role="status">
    <span class="push-icon">{{ state === 'denied' ? '🔕' : state === 'prompt' ? '🔔' : 'ℹ️' }}</span>
    <div class="push-body">
      <strong class="push-title">{{ t(`notifications.push.${state}.title`) }}</strong>
      <p class="push-text">{{ t(`notifications.push.${state}.text`) }}</p>
      <button v-if="state === 'prompt'" class="push-btn" :disabled="busy" @click="enable">
        {{ busy ? t('common.loading') : t('notifications.push.enable') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { initPushSubscription, notificationPermission, pushSupported } from '../shared/push'
import { useI18n } from '../i18n'

const { t } = useI18n()

// 'active' | 'prompt' (jamais demandé) | 'denied' (refusé → relevé périodique)
// | 'unsupported' (navigateur sans Web Push, ex. iOS hors écran d'accueil)
// | 'failed' (permission accordée mais abonnement impossible)
const state = ref('active')
const busy = ref(false)

async function refresh({ prompt = false } = {}) {
  if (!pushSupported()) {
    state.value = 'unsupported'
    return
  }
  const permission = notificationPermission()
  if (permission === 'denied') {
    state.value = 'denied'
    return
  }
  if (permission === 'default' && !prompt) {
    state.value = 'prompt'
    return
  }
  const ok = await initPushSubscription({ prompt })
  const after = notificationPermission()
  if (ok) state.value = 'active'
  else if (after === 'denied') state.value = 'denied'
  else if (after === 'default') state.value = 'prompt'
  else state.value = 'failed'
}

async function enable() {
  busy.value = true
  try {
    await refresh({ prompt: true })
  } finally {
    busy.value = false
  }
}

onMounted(() => refresh())
</script>

<style scoped>
.push-card {
  display: flex; gap: 12px; align-items: flex-start;
  margin-bottom: 14px; padding: 12px 14px; border-radius: 12px;
  border: 1px solid rgba(108, 92, 231, 0.4); background: rgba(108, 92, 231, 0.1);
}
.push-card.denied, .push-card.failed { border-color: rgba(245, 158, 11, 0.45); background: rgba(245, 158, 11, 0.1); }
.push-icon { font-size: 22px; line-height: 1; }
.push-body { flex: 1; min-width: 0; }
.push-title { display: block; font-size: 14px; color: var(--text, #fff); }
.push-text { margin: 4px 0 0; font-size: 12px; line-height: 1.4; color: var(--muted, #aaa); }
.push-btn {
  margin-top: 10px; padding: 8px 14px; border-radius: 8px; border: none; cursor: pointer;
  font-size: 13px; font-weight: 700; background: #6c5ce7; color: #fff;
}
.push-btn:disabled { opacity: 0.6; cursor: default; }
</style>
