<template>
  <div class="qr-overlay" @click.self="$emit('close')">
    <div class="qr-card">
      <div class="qr-head">
        <span class="qr-title">📷 {{ t('service.qrScanner.title') }}</span>
        <button class="qr-close" :aria-label="t('common.close')" @click="$emit('close')">✕</button>
      </div>

      <div v-if="!cameraError" class="qr-viewport">
        <video ref="videoEl" class="qr-video" playsinline muted></video>
        <div class="qr-frame"></div>
        <div v-if="starting" class="qr-viewport-state">
          <span class="qr-spinner"></span>
          <span>{{ t('service.qrScanner.openingCamera') }}</span>
        </div>
      </div>
      <p v-else class="qr-error">⚠️ {{ t(cameraError) }}</p>

      <p v-if="hint" class="qr-hint">{{ t(hint) }}</p>
      <p v-else-if="!cameraError" class="qr-hint">{{ t('service.qrScanner.aimHint') }}</p>

      <!-- Repli : saisie manuelle -->
      <div class="qr-manual">
        <label class="qr-manual-label" for="qr-manual-input">{{ t('service.qrScanner.tableNumberLabel') }}</label>
        <input
          id="qr-manual-input"
          v-model="manualNumber"
          class="qr-manual-input"
          type="number"
          inputmode="numeric"
          min="1"
          max="999"
          :placeholder="t('service.qrScanner.tableNumberPlaceholder')"
          @keydown.enter="submitManual"
        />
        <button class="qr-btn" :disabled="!manualValid" @click="submitManual">{{ t('common.open') }}</button>
      </div>
    </div>
    <canvas ref="canvasEl" class="qr-canvas"></canvas>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { parseTableQr } from '../shared/serviceOrders'
import { useI18n } from '../i18n'

const emit = defineEmits(['detected', 'close'])
const { t } = useI18n()

const videoEl = ref(null)
const canvasEl = ref(null)
const starting = ref(true)
// Clés i18n (traduites au rendu : suit un changement de langue)
const cameraError = ref('')
const hint = ref('')
const manualNumber = ref('')

const SCAN_EVERY_MS = 150
const MAX_SIDE = 640 // décodage sur une image réduite : plus rapide, suffisant pour un QR de table

let stream = null
let rafId = null
let lastScan = 0
let jsQR = null
let done = false

const manualValid = computed(() => {
  const n = Number(manualNumber.value)
  return Number.isInteger(n) && n > 0 && n < 1000
})

function submitManual() {
  if (!manualValid.value) return
  finish(Number(manualNumber.value))
}

function finish(number) {
  if (done) return
  done = true
  stopCamera()
  emit('detected', number)
}

function stopCamera() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
  stream?.getTracks().forEach(t => t.stop())
  stream = null
}

function cameraErrorMessage(e) {
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') return 'service.qrScanner.cameraDenied'
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') return 'service.qrScanner.noCamera'
  return 'service.qrScanner.cameraUnavailable'
}

function scanFrame(now) {
  rafId = requestAnimationFrame(scanFrame)
  const video = videoEl.value
  const canvas = canvasEl.value
  if (!video || !canvas || video.readyState < 2 || now - lastScan < SCAN_EVERY_MS) return
  lastScan = now

  const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight))
  const w = Math.round(video.videoWidth * scale)
  const h = Math.round(video.videoHeight * scale)
  if (!w || !h) return
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, w, h)
  const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })
  if (!code?.data) return

  const number = parseTableQr(code.data)
  if (number) finish(number)
  else hint.value = 'service.qrScanner.notRecognized'
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraError.value = 'service.qrScanner.cameraUnsupported'
    starting.value = false
    return
  }
  try {
    const [media, lib] = await Promise.all([
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }),
      import('jsqr'),
    ])
    if (done) { media.getTracks().forEach(t => t.stop()); return }
    stream = media
    jsQR = lib.default
    videoEl.value.srcObject = stream
    await videoEl.value.play()
    rafId = requestAnimationFrame(scanFrame)
  } catch (e) {
    stopCamera()
    cameraError.value = cameraErrorMessage(e)
  } finally {
    starting.value = false
  }
}

onMounted(startCamera)

onUnmounted(() => {
  done = true
  stopCamera()
})
</script>

<style scoped>
.qr-overlay {
  position: fixed; inset: 0; z-index: 320; display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(3px);
}
.qr-card {
  width: 92%; max-width: 420px; padding: 16px; border-radius: 18px;
  display: flex; flex-direction: column; gap: 10px;
  background: var(--card-bg, #1a1a2e); border: 1px solid var(--card-border, #2a2a40);
  color: var(--text, #fff); box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
}
.qr-head { display: flex; align-items: center; justify-content: space-between; }
.qr-title { font-size: 17px; font-weight: 800; }
.qr-close {
  width: 34px; height: 34px; border-radius: 10px; cursor: pointer; font-size: 16px;
  border: 1px solid var(--card-border, #2a2a40); background: var(--bg, #0d0d14); color: var(--text, #fff);
}

.qr-viewport {
  position: relative; width: 100%; aspect-ratio: 1; border-radius: 14px; overflow: hidden; background: #000;
}
.qr-video { width: 100%; height: 100%; object-fit: cover; display: block; }
.qr-frame {
  position: absolute; inset: 18%; border-radius: 16px; pointer-events: none;
  border: 3px solid var(--primary, #10b981); box-shadow: 0 0 0 999px rgba(0, 0, 0, 0.35);
}
.qr-viewport-state {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; color: #fff; font-size: 13px;
}
.qr-spinner {
  width: 28px; height: 28px; border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.25); border-top-color: var(--primary, #10b981);
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.qr-hint { margin: 0; font-size: 12px; text-align: center; color: var(--muted, #8a8aa0); }
.qr-error { margin: 0; padding: 14px; border-radius: 12px; font-size: 13px; color: var(--amber, #f59e0b); background: rgba(245, 158, 11, 0.12); }

.qr-manual { display: flex; align-items: center; gap: 8px; }
.qr-manual-label { flex: 1; font-size: 13px; font-weight: 700; }
.qr-manual-input {
  width: 84px; padding: 10px; border-radius: 10px; font-size: 16px; font-weight: 800; text-align: center;
  border: 1px solid var(--card-border, #2a2a40); background: var(--bg, #0d0d14); color: var(--text, #fff);
}
.qr-btn {
  padding: 12px 18px; border: none; border-radius: 10px; cursor: pointer;
  background: var(--primary, #10b981); color: #0d0d14; font-size: 14px; font-weight: 800;
}
.qr-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.qr-canvas { display: none; }
</style>
