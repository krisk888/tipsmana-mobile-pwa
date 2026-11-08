<template>
  <div class="bs-overlay" role="dialog" aria-modal="true" :aria-label="t('stock.barcode.title')" @click.self="close">
    <div class="bs-card">
      <div class="bs-header">
        <span class="bs-title">📷 {{ t('stock.barcode.title') }}</span>
        <button class="bs-close" :aria-label="t('common.close')" @click="close">✕</button>
      </div>

      <div v-if="mode === 'camera'" class="bs-viewport">
        <video ref="videoEl" class="bs-video" playsinline muted autoplay></video>
        <div class="bs-frame" aria-hidden="true"></div>
        <span class="bs-hint">{{ t('stock.barcode.aim') }}</span>
      </div>
      <p v-else-if="mode === 'starting'" class="bs-info"><span class="bs-spinner"></span></p>
      <p v-else class="bs-info">{{ t(`stock.barcode.fallback.${mode}`) }}</p>

      <form class="bs-manual" @submit.prevent="submitManual">
        <label class="bs-label" for="bs-code">{{ t('stock.barcode.manualLabel') }}</label>
        <div class="bs-row">
          <input
            id="bs-code"
            ref="manualEl"
            v-model="manual"
            class="bs-input"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            :placeholder="t('stock.barcode.manualPlaceholder')"
          />
          <button class="bs-submit" type="submit" :disabled="!manual.trim()">{{ t('stock.barcode.search') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { barcodeDetectorAvailable, cameraAvailable, createBarcodeDetector, normalizeBarcode } from '../shared/barcode'
import { useI18n } from '../i18n'

const emit = defineEmits(['detected', 'close'])
const { t } = useI18n()

// 'starting' | 'camera' | 'noDetector' | 'noCamera' | 'denied'
const mode = ref('starting')
const manual = ref('')
const videoEl = ref(null)
const manualEl = ref(null)
let stream = null
let detector = null
let timer = null
let done = false

function stop() {
  clearInterval(timer)
  timer = null
  stream?.getTracks().forEach(track => track.stop())
  stream = null
  if (videoEl.value) videoEl.value.srcObject = null
}

function found(raw) {
  const code = normalizeBarcode(raw)
  if (!code || done) return
  done = true
  stop()
  try { navigator.vibrate?.(80) } catch { /* non supporté */ }
  emit('detected', code)
}

function close() {
  stop()
  emit('close')
}

function submitManual() {
  found(manual.value)
}

async function tick() {
  if (!detector || !videoEl.value || videoEl.value.readyState < 2) return
  try {
    const codes = await detector.detect(videoEl.value)
    if (codes?.length) found(codes[0].rawValue)
  } catch { /* image ignorée */ }
}

async function start() {
  if (!cameraAvailable()) { mode.value = 'noCamera'; return }
  if (!barcodeDetectorAvailable()) { mode.value = 'noDetector'; return }
  detector = await createBarcodeDetector()
  if (!detector) { mode.value = 'noDetector'; return }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    })
  } catch {
    mode.value = 'denied'
    return
  }
  if (done) { stop(); return }
  mode.value = 'camera'
  await nextTick()
  if (videoEl.value) {
    videoEl.value.srcObject = stream
    await videoEl.value.play?.()?.catch?.(() => {})
  }
  timer = setInterval(tick, 200)
}

onMounted(async () => {
  await start()
  // Pas de caméra exploitable : le clavier s'ouvre directement sur la saisie
  if (mode.value !== 'camera') manualEl.value?.focus()
})
onBeforeUnmount(stop)
</script>

<style scoped>
.bs-overlay {
  position: fixed; inset: 0; z-index: 300; display: flex; align-items: flex-end; justify-content: center;
  background: rgba(0, 0, 0, 0.7);
}
.bs-card {
  width: 100%; max-width: 520px; box-sizing: border-box; padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
  border-radius: 18px 18px 0 0; background: var(--card-bg, #1a1a2e); color: var(--text, #fff);
  display: flex; flex-direction: column; gap: 12px;
}
.bs-header { display: flex; align-items: center; justify-content: space-between; }
.bs-title { font-size: 16px; font-weight: 800; }
.bs-close { background: none; border: none; color: var(--muted, #8a8aa0); font-size: 18px; cursor: pointer; padding: 4px; }
.bs-viewport { position: relative; overflow: hidden; border-radius: 14px; aspect-ratio: 4 / 3; background: #000; }
.bs-video { width: 100%; height: 100%; object-fit: cover; }
.bs-frame {
  position: absolute; left: 12%; right: 12%; top: 32%; bottom: 32%;
  border: 3px solid var(--primary, #10b981); border-radius: 12px; box-shadow: 0 0 0 999px rgba(0, 0, 0, 0.35);
}
.bs-hint {
  position: absolute; left: 0; right: 0; bottom: 10px; text-align: center;
  font-size: 12px; font-weight: 700; color: #fff; text-shadow: 0 1px 3px #000;
}
.bs-info { margin: 0; padding: 12px; border-radius: 12px; font-size: 13px; line-height: 1.4; color: var(--muted, #8a8aa0); background: rgba(255, 255, 255, 0.04); text-align: center; }
.bs-spinner {
  display: inline-block; width: 24px; height: 24px; border-radius: 50%;
  border: 3px solid var(--card-border, #2a2a40); border-top-color: var(--primary, #10b981);
  animation: bs-spin 0.7s linear infinite;
}
@keyframes bs-spin { to { transform: rotate(360deg); } }
.bs-manual { display: flex; flex-direction: column; gap: 6px; }
.bs-label { font-size: 12px; font-weight: 700; color: var(--muted, #8a8aa0); }
.bs-row { display: flex; gap: 8px; }
.bs-input {
  flex: 1; min-width: 0; padding: 11px 12px; border-radius: 12px; font-size: 16px; letter-spacing: 1px;
  border: 1px solid var(--card-border, #2a2a40); background: var(--bg, #0d0d14); color: var(--text, #fff);
}
.bs-submit {
  padding: 0 16px; border-radius: 12px; border: none; cursor: pointer; font-weight: 800;
  background: var(--primary, #10b981); color: #0d0d14;
}
.bs-submit:disabled { opacity: 0.4; cursor: default; }
</style>
