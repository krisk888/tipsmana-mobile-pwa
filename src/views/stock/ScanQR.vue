<template>
  <div class="scan-view">
    <header class="page-header">
      <h2>{{ t('stock.scan.title') }}</h2>
      <p class="subtitle">{{ t('stock.scan.subtitle') }}</p>
    </header>

    <div class="camera-placeholder">
      <div class="camera-frame">
        <span class="camera-icon">📷</span>
        <p>{{ t('stock.scan.tapToOpen') }}</p>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        capture="environment"
        @change="onFileCapture"
        style="display:none"
      />
      <button class="btn-camera" :disabled="busy" @click="$refs.fileInput.click()">{{ t('stock.scan.openCamera') }}</button>
    </div>

    <form class="manual-entry" @submit.prevent="lookup(manualCode)">
      <input v-model="manualCode" inputmode="numeric" :placeholder="t('stock.scan.manualPlaceholder')" />
      <button type="submit" :disabled="busy || !manualCode.trim()">{{ t('stock.scan.ok') }}</button>
    </form>

    <div v-if="result" class="scan-result">
      <h3>{{ t('stock.scan.resultTitle') }}</h3>
      <p><strong>{{ t('stock.scan.code') }}</strong> {{ result.code }}</p>
      <p><strong>{{ t('stock.scan.product') }}</strong> {{ result.product_name }}</p>
      <p v-if="result.quantity != null"><strong>{{ t('stock.scan.theoreticalStock') }}</strong> {{ result.quantity }}</p>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../../shared/api'
import { useI18n } from '../../i18n'

const { t } = useI18n()

const router = useRouter()
const fileInput = ref(null)
const manualCode = ref('')
const result = ref(null)
const error = ref(null)
const busy = ref(false)
const navigatingToTable = ref(false)

// Le backend n'a pas d'endpoint de décodage d'image
async function decodeImage(file) {
  if (!('BarcodeDetector' in window)) return null
  if (typeof createImageBitmap !== 'function') return null
  try {
    const bitmap = await createImageBitmap(file)
    if (!bitmap) return null
    const codes = await new window.BarcodeDetector().detect(bitmap)
    return (codes && codes.length > 0 && codes[0]?.rawValue) ? codes[0].rawValue : null
  } catch {
    return null
  }
}

async function onFileCapture(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return

  error.value = null
  result.value = null
  try {
    const code = await decodeImage(file)
    if (!code) {
      error.value = t('stock.scan.notDetected')
      return
    }
    manualCode.value = code
    await lookup(code)
  } catch (e) {
    error.value = e.message || t('stock.scan.scanFailed')
  }
}

async function lookup(rawCode) {
  const code = String(rawCode || '').trim()
  if (!code) return
  busy.value = true
  error.value = null
  result.value = null

  // Détection QR table de restaurant
  const tableMatch = code.match(/^table[:\s]?(\d+)$/i)
  if (tableMatch) {
    const tableNum = tableMatch[1]
    navigatingToTable.value = true
    busy.value = false
    router.push({ name: 'Caisse', query: { table: tableNum } })
    return
  }

  try {
    const res = await api.get(`/inventory/barcode/lookup?code=${encodeURIComponent(code)}`)
    const data = res.data || {}
    result.value = {
      code,
      product_name: data.product?.name,
      quantity: data.theoretical_stock,
    }
  } catch (e) {
    error.value = e.status === 404 ? t('stock.scan.noProduct', { code }) : (e.message || t('stock.scan.lookupFailed'))
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.scan-view { padding: 16px; padding-bottom: 80px; }
.page-header { margin-bottom: 16px; }
.page-header h2 { font-size: 22px; color: #fff; margin: 0; }
.subtitle { font-size: 13px; color: #888; margin-top: 4px; }
.camera-placeholder { margin: 24px 0; text-align: center; }
.camera-frame {
  background: #1e1e32; border: 2px dashed #3a3a50; border-radius: 16px;
  padding: 48px 24px; margin-bottom: 16px;
}
.camera-icon { font-size: 48px; }
.camera-frame p { color: #888; font-size: 14px; margin-top: 8px; }
.btn-camera {
  padding: 14px 24px; background: linear-gradient(135deg, #6c5ce7, #a29bfe);
  border: none; border-radius: 12px; color: white; font-size: 16px; font-weight: 600;
  cursor: pointer;
}
.scan-result {
  margin-top: 16px; padding: 16px; background: #1e1e32; border-radius: 12px;
}
.scan-result h3 { font-size: 14px; color: #6c5ce7; margin-bottom: 8px; }
.scan-result p { font-size: 13px; color: #ddd; margin-bottom: 4px; }
.btn-camera:disabled { opacity: 0.5; }
.manual-entry { display: flex; gap: 8px; }
.manual-entry input {
  flex: 1; padding: 12px 14px; background: #1e1e32; border: 1px solid #3a3a50;
  border-radius: 10px; color: #fff; font-size: 15px;
}
.manual-entry button {
  padding: 0 18px; background: #6c5ce7; border: none; border-radius: 10px;
  color: #fff; font-weight: 600; cursor: pointer;
}
.manual-entry button:disabled { opacity: 0.5; }
.error-msg { color: #ff6b6b; text-align: center; margin-top: 12px; }
</style>