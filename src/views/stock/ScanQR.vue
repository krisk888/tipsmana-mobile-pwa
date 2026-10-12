<template>
  <div class="scan-view">
    <header class="page-header">
      <h2>📷 Scanner</h2>
      <p class="subtitle">Scannez un QR code ou code-barres</p>
    </header>

    <div class="camera-placeholder">
      <div class="camera-frame">
        <span class="camera-icon">📷</span>
        <p>Appuyez pour ouvrir la caméra</p>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        capture="environment"
        @change="onFileCapture"
        style="display:none"
      />
      <button class="btn-camera" :disabled="busy" @click="$refs.fileInput.click()">📸 Ouvrir la caméra</button>
    </div>

    <form class="manual-entry" @submit.prevent="lookup(manualCode)">
      <input v-model="manualCode" inputmode="numeric" placeholder="Ou saisir le code-barres" />
      <button type="submit" :disabled="busy || !manualCode.trim()">OK</button>
    </form>

    <div v-if="result" class="scan-result">
      <h3>Résultat du scan</h3>
      <p><strong>Code :</strong> {{ result.code }}</p>
      <p><strong>Produit :</strong> {{ result.product_name }}</p>
      <p v-if="result.quantity != null"><strong>Stock théorique :</strong> {{ result.quantity }}</p>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import api from '../../shared/api'

const fileInput = ref(null)
const manualCode = ref('')
const result = ref(null)
const error = ref(null)
const busy = ref(false)

// Le backend n'a pas d'endpoint de décodage d'image : le code est lu côté
// navigateur (BarcodeDetector, Chrome/Android) puis recherché par
// GET /inventory/products/lookup/barcode/{code}.
async function decodeImage(file) {
  if (!('BarcodeDetector' in window)) return null
  const bitmap = await createImageBitmap(file)
  const codes = await new window.BarcodeDetector().detect(bitmap)
  return codes[0]?.rawValue || null
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
      error.value = 'Code non détecté — saisissez-le manuellement'
      return
    }
    manualCode.value = code
    await lookup(code)
  } catch (e) {
    error.value = e.message || 'Échec du scan'
  }
}

async function lookup(rawCode) {
  const code = String(rawCode || '').trim()
  if (!code) return
  busy.value = true
  error.value = null
  result.value = null
  try {
    const res = await api.get(`/inventory/products/lookup/barcode/${encodeURIComponent(code)}`)
    const data = res.data || {}
    result.value = {
      code,
      product_name: data.product?.name,
      quantity: data.theoretical_stock,
    }
  } catch (e) {
    error.value = e.status === 404 ? `Aucun produit pour le code ${code}` : (e.message || 'Échec de la recherche')
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