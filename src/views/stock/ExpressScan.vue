<template>
  <div class="express-view">
    <!-- ============ ÉTAPE 1 : CHOIX / CRÉATION SESSION ============ -->
    <div v-if="step === 'sessions'" class="pane">
      <header class="page-header">
        <h2>⚡ Inventaire express</h2>
        <p class="subtitle">Comptage par zones — fonctionne hors-ligne</p>
      </header>

      <div v-if="loading" class="loading-state">Chargement…</div>
      <div v-else-if="error" class="error-state">{{ error }}</div>

      <template v-else>
        <div class="sessions-section">
          <h3>Reprendre une session</h3>
          <div v-if="sessions.length === 0" class="empty-state">
            <span class="empty-icon">📭</span>
            <p>Aucune session express en cours</p>
          </div>
          <div
            v-for="s in sessions"
            :key="s.id"
            class="session-card"
            @click="openSession(s)"
          >
            <div class="session-header">
              <strong>{{ s.session_name || 'Session #' + shortId(s.id) }}</strong>
              <span class="session-status">Express</span>
            </div>
            <div class="session-meta">
              <span>Démarrée {{ timeAgo(s.started_at) }}</span>
              <span v-if="s.total_variance_amount != null">{{ s.total_variance_amount }} €</span>
            </div>
          </div>
        </div>

        <button class="btn-primary btn-block" :disabled="creating" @click="createSession">
          {{ creating ? 'Création…' : '＋ Nouvel inventaire express' }}
        </button>
      </template>
    </div>

    <!-- ============ ÉTAPE 2 : ZONES ============ -->
    <div v-else-if="step === 'zones'" class="pane">
      <header class="page-header">
        <h2>⚡ {{ sessionName }}</h2>
        <p class="subtitle">Choisis une zone de comptage</p>
        <button class="btn-text" @click="backToSessions">← Changer de session</button>
      </header>

      <div v-if="loading" class="loading-state">Chargement…</div>
      <div v-else-if="error" class="error-state">{{ error }}</div>

      <template v-else>
        <div class="progress-overview">
          <div class="progress-bar"><div class="progress-fill" :style="{ width: progressPct + '%' }"></div></div>
          <div class="progress-labels">
            <span>{{ progress.counted_products ?? 0 }} / {{ progress.total_products ?? 0 }} produits</span>
            <span>{{ progressPct.toFixed(0) }}%</span>
          </div>
          <div v-if="progress.remaining_estimate_min != null" class="eta">
            ⏱ fin estimée dans ~{{ progress.remaining_estimate_min }} min ({{ progress.speed_items_per_min }}/min)
          </div>
        </div>

        <div v-for="z in zones" :key="z.id" class="zone-card" @click="startZone(z)">
          <div class="zone-top">
            <strong>{{ z.name }}</strong>
            <span class="zone-status" :class="zoneState(z).cls">{{ zoneState(z).label }}</span>
          </div>
          <div class="zone-meta">
            <span>{{ areaLabel(z.area) }}</span>
            <span v-if="z.counted_products != null">{{ z.counted_products }} comptés</span>
            <span v-else>Non démarrée</span>
          </div>
        </div>

        <div v-if="progress.zones_completed === progress.zones_total && progress.zones_total > 0" class="finish-zone">
          <button class="btn-primary btn-block" @click="completeSession">
            ✔ Terminer la session — voir le récapitulatif
          </button>
        </div>
      </template>
    </div>

    <!-- ============ ÉTAPE 3 : COMPTAGE ============ -->
    <div v-else-if="step === 'counting'" class="counting">
      <!-- bandeau d'état -->
      <div class="count-header">
        <button class="btn-icon" @click="leaveCounting">←</button>
        <div class="count-header-info">
          <strong>{{ currentZone?.name || sessionName }}</strong>
          <span class="count-sub">
            {{ progress.counted_products ?? 0 }}/{{ progress.total_products ?? 0 }} · {{ chrono }}
          </span>
        </div>
        <span v-if="!online" class="offline-badge">📴 Hors-ligne</span>
        <span v-else-if="pendingCount > 0" class="offline-badge pending" @click="flushQueue">
          ⬆ {{ pendingCount }} en attente
        </span>
      </div>

      <div class="progress-bar slim"><div class="progress-fill" :style="{ width: progressPct + '%' }"></div></div>

      <!-- caméra -->
      <div class="camera-wrap" :class="{ paused: keypadVisible }">
        <video ref="videoEl" autoplay playsinline muted class="camera-feed"></video>
        <div class="scan-frame"></div>
        <div v-if="cameraError" class="camera-fallback">
          <p>{{ cameraError }}</p>
          <p class="hint">Saisis le code manuellement ci-dessous</p>
        </div>
        <div v-if="!scanning && !cameraError" class="camera-fallback">
          <p>Caméra en pause — appuie sur « Reprendre »</p>
        </div>
      </div>

      <!-- dernier scan -->
      <transition name="pop">
        <div v-if="lastScan" class="last-scan" :class="severityCls(lastScan.severity)">
          <div class="last-scan-info">
            <strong>{{ lastScan.product_name }}</strong>
            <span>{{ lastScan.counted_quantity }} compté{{ lastScan.counted_quantity > 1 ? 's' : '' }}
              <span v-if="lastScan.variance_quantity != null">
                · écart {{ lastScan.variance_quantity > 0 ? '+' : '' }}{{ fmtQty(lastScan.variance_quantity) }}
              </span>
            </span>
          </div>
          <span class="last-scan-close" @click="lastScan = null">✕</span>
        </div>
      </transition>

      <!-- saisie manuelle / sans code -->
      <div class="manual-row">
        <input
          v-model="manualCode"
          type="text"
          inputmode="numeric"
          placeholder="Taper le code / QR…"
          class="manual-input"
          @keyup.enter="submitManualCode"
        />
        <button class="btn-secondary" @click="openPicker">🔍 Sans code</button>
      </div>

      <!-- clavier quantité -->
      <div class="keypad">
        <div class="keypad-screen">
          <div class="qty-display">{{ qtyDisplay }}</div>
          <div class="qty-presets">
            <button class="preset" @click="setQty(1)">+1</button>
            <button class="preset" @click="setQty(6)">+6</button>
            <button class="preset" @click="setQty(12)">+12</button>
            <button class="preset" @click="clearQty">C</button>
          </div>
          <div class="mode-toggle">
            <button class="mode-btn" :class="{ active: countMode === 'set' }" @click="countMode = 'set'">
              Emplacement
            </button>
            <button class="mode-btn" :class="{ active: countMode === 'add' }" @click="countMode = 'add'">
              Unitaire
            </button>
          </div>
        </div>
        <div class="keypad-grid">
          <button v-for="n in [1,2,3,4,5,6,7,8,9]" :key="n" class="key" @click="pressDigit(n)">{{ n }}</button>
          <button class="key key-zero" @click="pressDigit(0)">0</button>
          <button class="key key-back" @click="backspace">⌫</button>
        </div>
        <button class="btn-ok" :disabled="!qtyCount || submitting" @click="submitCount">
          {{ submitting ? '…' : `✔ OK — ${qtyCount || 0}` }}
        </button>
      </div>

      <!-- footer zone -->
      <div class="zone-footer">
        <button class="btn-danger" :disabled="submitting" @click="finishZone">
          🏁 Zone terminée{{ nextZone ? ` → ${nextZone.name}` : ' — terminer la session' }}
        </button>
      </div>

      <!-- picker sans code -->
      <div v-if="showPicker" class="modal" @click.self="showPicker = false">
        <div class="modal-body">
          <h3>Choisir un produit</h3>
          <input v-model="pickerSearch" placeholder="Rechercher…" class="manual-input" />
          <div class="picker-list">
            <div
              v-for="p in filteredMissing"
              :key="p.product_id"
              class="picker-item"
              @click="pickProduct(p)"
            >
              <strong>{{ p.name }}</strong>
              <span>{{ p.sku }} · {{ sectionLabel(p.section) }}</span>
            </div>
            <div v-if="filteredMissing.length === 0" class="empty-state small">
              <p>{{ pickerLoading ? 'Chargement…' : 'Aucun produit en attente 🎉' }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ ÉTAPE 4 : RÉCAPITULATIF ============ -->
    <div v-else-if="step === 'recap'" class="pane">
      <header class="page-header">
        <h2>📋 Récapitulatif</h2>
        <p class="subtitle">{{ sessionName }}</p>
      </header>
      <div v-if="loading" class="loading-state">Chargement…</div>
      <div v-else-if="error" class="error-state">{{ error }}</div>
      <template v-else-if="summary">
        <div class="recap-totals">
          <div class="recap-cell">
            <span class="recap-value">{{ summary.totals?.products_counted ?? 0 }}</span>
            <span class="recap-label">produits comptés</span>
          </div>
          <div class="recap-cell">
            <span class="recap-value">{{ (summary.totals?.variance_value ?? 0).toFixed(2) }} €</span>
            <span class="recap-label">écart total</span>
          </div>
          <div class="recap-cell">
            <span class="recap-value">{{ summary.missing_products_count ?? 0 }}</span>
            <span class="recap-label">non comptés</span>
          </div>
        </div>

        <div v-if="summary.missing_products?.length" class="missing-section">
          <h3>Manquants ({{ summary.missing_products_count }})</h3>
          <div v-for="m in summary.missing_products" :key="m.product_id" class="missing-item">
            <span>{{ m.name }}</span>
            <span class="muted">{{ m.sku }}</span>
          </div>
        </div>

        <router-link to="/stock" class="btn-primary btn-block center">Retour au stock</router-link>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import api from '../../shared/api'
import offlineStore from '../../shared/offlineStore'

// ---------------------------------------------------------------- état
const step = ref('sessions') // sessions | zones | counting | recap
const sessions = ref([])
const sessionId = ref(null)
const sessionName = ref('')
const zones = ref([])
const currentZoneIndex = ref(0)
const completedZoneIds = ref([])
const summary = ref(null)

const loading = ref(false)
const error = ref(null)
const creating = ref(false)
const submitting = ref(false)
const online = ref(navigator.onLine !== false)
const pendingCount = ref(0)

// progression
const progress = ref({})
const chrono = ref('00:00')
let chronoTimer = null
let progressTimer = null

// comptage
const countMode = ref('set') // set (emplacement) | add (unitaire)
const qty = ref('1')
const lastScan = ref(null)
const manualCode = ref('')

// caméra
const videoEl = ref(null)
const scanning = ref(false)
const cameraError = ref(null)
const keypadVisible = ref(false)
let stream = null
let detector = null
let scanLoop = null
let lastDetectedCode = ''
let lastDetectedAt = 0

// picker
const showPicker = ref(false)
const pickerSearch = ref('')
const pickerLoading = ref(false)
const missingProducts = ref([])

const currentZone = computed(() => zones.value[currentZoneIndex.value] || null)
const nextZone = computed(() => zones.value.find((z, i) =>
  i > currentZoneIndex.value && !completedZoneIds.value.includes(z.id) && z.status !== 'completed'
) || null)
const qtyCount = computed(() => {
  const n = parseFloat(qty.value)
  return Number.isFinite(n) && n > 0 ? n : 0
})
const qtyDisplay = computed(() => qty.value || '0')
const progressPct = computed(() => progress.value.pct ?? 0)
const filteredMissing = computed(() => {
  const q = pickerSearch.value.trim().toLowerCase()
  if (!q) return missingProducts.value
  return missingProducts.value.filter(p =>
    (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
  )
})

// ---------------------------------------------------------------- helpers
function shortId(id) { return id ? String(id).slice(0, 8) : '—' }
function fmtQty(n) { return Number(n || 0).toFixed(0) }
function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `${min} min`
  if (min < 1440) return `${Math.floor(min / 60)}h`
  return new Date(iso).toLocaleDateString('fr-FR')
}
function areaLabel(area) {
  return { salle: '🪑 Salle', cuisine: '🍳 Cuisine', reserve: '📦 Réserve', bar: '🍸 Bar' }[area] || area
}
function sectionLabel(section) {
  return { kitchen: 'Cuisine', dining_room: 'Salle', bar: 'Bar', reserve: 'Réserve' }[section] || section
}
function zoneState(z) {
  if (completedZoneIds.value.includes(z.id) || z.status === 'completed')
    return { label: '✔ Terminée', cls: 'done' }
  if (z.status === 'in_progress' || z.status === 'started' || z.counted_products > 0)
    return { label: 'En cours', cls: 'active' }
  return { label: 'À faire', cls: 'todo' }
}
function severityCls(s) {
  return { critical: 'sev-critical', warning: 'sev-warning' }[s] || ''
}
function fmtChrono(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
const todayISO = (() => {
  const t = new Date()
  return [t.getFullYear(), String(t.getMonth() + 1).padStart(2, '0'), String(t.getDate()).padStart(2, '0')].join('-')
})()

// ---------------------------------------------------------------- sessions
async function loadSessions() {
  loading.value = true
  error.value = null
  try {
    const res = await api.get('/inventory/sessions?status=in_progress')
    const data = res.data || res.results || res || {}
    const list = Array.isArray(data)
      ? data
      : [...(data.kitchen?.items || []), ...(data.dining_room?.items || [])]
    sessions.value = [...new Map(list.map(s => [s.id, s])).values()]
      .filter(s => s.session_type === 'express')
  } catch (e) {
    error.value = e.message
    sessions.value = []
  } finally {
    loading.value = false
  }
}

async function createSession() {
  creating.value = true
  error.value = null
  try {
    const res = await api.post('/inventory/sessions', {
      session_name: `Inventaire express ${todayISO}`,
      session_date: todayISO,
      session_type: 'express',
    })
    const data = res.data || {}
    sessionId.value = data.id
    sessionName.value = data.session_name
    zones.value = data.zones || []
    completedZoneIds.value = loadCompletedZones(sessionId.value)
    if (!zones.value.length) await loadZones()
    step.value = 'zones'
    lastScan.value = null
  } catch (e) {
    error.value = e.message || 'Impossible de créer la session'
  } finally {
    creating.value = false
  }
}

function openSession(s) {
  sessionId.value = s.id
  sessionName.value = s.session_name
  step.value = 'zones'
  lastScan.value = null
  loadZones()
}

function backToSessions() {
  stopCamera()
  step.value = 'sessions'
  loadSessions()
}

// ---------------------------------------------------------------- zones / progression
async function loadZones() {
  loading.value = true
  error.value = null
  try {
    const [zRes, pRes] = await Promise.all([
      api.get(`/inventory/sessions/${sessionId.value}/zones`),
      api.get(`/inventory/sessions/${sessionId.value}/progress`).catch(() => null),
    ])
    zones.value = zRes.data || []
    if (pRes?.data) applyProgress(pRes.data)
    completedZoneIds.value = loadCompletedZones(sessionId.value)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function applyProgress(p) {
  progress.value = p
  if (p.counted_by_zone) {
    zones.value = zones.value.map(z => {
      const cz = p.counted_by_zone.find(c => c.id === z.id)
      return cz ? { ...z, counted_products: cz.counted_products, status: cz.status } : z
    })
  }
}

function startZone(z) {
  const idx = zones.value.findIndex(x => x.id === z.id)
  currentZoneIndex.value = idx >= 0 ? idx : 0
  step.value = 'counting'
  keypadVisible.value = false
  qty.value = '1'
  startCamera()
  startCountdown()
  refreshProgress()
  progressTimer = setInterval(refreshProgress, 20000)
}

async function refreshProgress() {
  if (!sessionId.value) return
  try {
    const res = await api.get(`/inventory/sessions/${sessionId.value}/progress`)
    if (res.data) applyProgress(res.data)
  } catch { /* silence hors-ligne */ }
}

function loadCompletedZones(sid) {
  try {
    return JSON.parse(localStorage.getItem(`tipsmana_express_done_${sid}`) || '[]')
  } catch { return [] }
}
function saveCompletedZones() {
  localStorage.setItem(`tipsmana_express_done_${sessionId.value}`, JSON.stringify(completedZoneIds.value))
}

let localSeconds = 0
function startCountdown() {
  localSeconds = progress.value.duration_seconds || 0
  chronoTimer = setInterval(() => {
    localSeconds += 1
    chrono.value = fmtChrono(localSeconds)
  }, 1000)
}

// ---------------------------------------------------------------- caméra
async function startCamera() {
  cameraError.value = null
  stopCamera()
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraError.value = 'Caméra non disponible sur cet appareil'
    return
  }
  if (!('BarcodeDetector' in window)) {
    cameraError.value = 'Détection auto non supportée — saisis les codes manuellement'
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    })
    if (videoEl.value) {
      videoEl.value.srcObject = stream
      await videoEl.value.play().catch(() => {})
    }
    detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'itf'] })
    scanning.value = true
    scanLoop = setInterval(scanTick, 180)
  } catch (e) {
    console.warn('camera start failed', e)
    cameraError.value = 'Impossible d’ouvrir la caméra — saisie manuelle disponible'
  }
}

function stopCamera() {
  scanning.value = false
  if (scanLoop) { clearInterval(scanLoop); scanLoop = null }
  if (stream) {
    stream.getTracks().forEach(t => t.stop())
    stream = null
  }
  if (videoEl.value) videoEl.value.srcObject = null
}

async function scanTick() {
  if (!scanning.value || !detector || !videoEl.value || keypadVisible.value) return
  try {
    const codes = await detector.detect(videoEl.value)
    if (!codes.length) return
    const code = (codes[0].rawValue || '').trim()
    const now = Date.now()
    if (!code || (code === lastDetectedCode && now - lastDetectedAt < 2500)) return
    lastDetectedCode = code
    lastDetectedAt = now
    handleScan(code)
  } catch { /* frame ignorée */ }
}

// ---------------------------------------------------------------- scan → comptage
async function handleScan(code) {
  // Zone QR (UUID du template / qr_payload) → change de zone
  const zone = zones.value.find(z => z.template_zone_id === code || z.qr_payload === code)
  if (zone) {
    const idx = zones.value.findIndex(z => z.id === zone.id)
    if (idx >= 0) currentZoneIndex.value = idx
    navigator.vibrate?.(50)
    return
  }
  navigator.vibrate?.(80)

  if (countMode.value === 'add') {
    // scan unitaire : +1 immédiat
    await submitOne({ code, qty: 1, mode: 'add' })
    return
  }
  // mode emplacement : garde le code et ouvre le clavier
  pendingCode.value = code
  keypadVisible.value = true
  qty.value = '1'
}

const pendingCode = ref(null)

const keypadOpenForManual = ref(false)

function submitManualCode() {
  const code = manualCode.value.trim()
  if (!code) return
  manualCode.value = ''
  handleScan(code)
}

function setQty(v) { qty.value = String(v) }
function clearQty() { qty.value = '' }
function pressDigit(d) {
  qty.value = qty.value === '0' ? String(d) : qty.value + String(d)
}
function backspace() { qty.value = qty.value.slice(0, -1) }
function closeKeypad() {
  keypadVisible.value = false
  pendingCode.value = null
  keypadOpenForManual.value = false
}

async function submitCount() {
  if (!qtyCount.value || submitting.value) return
  let code = pendingCode.value
  const picked = pickedProduct.value
  if (code) {
    await submitOne({ code, qty: qtyCount.value, mode: 'set' })
  } else if (picked) {
    await submitOne({ productId: picked.product_id, qty: qtyCount.value, mode: 'set' })
  } else {
    // saisie manuelle sans scan
    code = manualCode.value.trim()
    if (!code) return
    manualCode.value = ''
    await submitOne({ code, qty: qtyCount.value, mode: 'set' })
  }
  keypadVisible.value = false
  pendingCode.value = null
  pickedProduct.value = null
  keypadOpenForManual.value = false
  qty.value = '1'
  refreshProgress()
}

async function submitOne({ code = null, productId = null, qty: quantity, mode }) {
  submitting.value = true
  const zoneRef = currentZone.value?.id || currentZone.value?.template_zone_id || null
  const payload = {
    items: [{ ...(code ? { barcode: code } : { product_id: productId }), quantity, mode }],
    mode,
    ...(zoneRef ? { zone: zoneRef } : {}),
  }
  try {
    const res = await api.post(`/inventory/sessions/${sessionId.value}/scans`, payload)
    const data = res.data || {}
    const counted = (data.counts || [])[0]
    if (counted) {
      lastScan.value = {
        product_name: counted.product_name,
        counted_quantity: counted.counted_quantity,
        variance_quantity: counted.variance_quantity,
        severity: counted.variance_percent != null && Math.abs(counted.variance_percent) >= 25
          ? 'critical'
          : Math.abs(counted.variance_percent || 0) >= 5 ? 'warning' : 'ok',
      }
    }
    for (const u of data.unknown || []) {
      if (u.barcode) notifyUnknown(u.barcode)
    }
  } catch (e) {
    // hors-ligne → file d'attente IndexedDB
    if (!online.value || e.status === undefined) {
      await offlineStore.add({
        session_id: sessionId.value,
        barcode: code,
        product_id: productId,
        quantity,
        zone: zoneRef,
        mode,
      })
      await updatePendingCount()
      lastScan.value = {
        product_name: code || 'Produit',
        counted_quantity: quantity,
        variance_quantity: null,
        severity: 'queued',
        queued: true,
      }
    } else {
      const msg = e.message || 'Erreur API'
      error.value = msg
      setTimeout(() => { error.value = null }, 3000)
    }
  } finally {
    submitting.value = false
  }
}

function notifyUnknown(code) {
  lastScan.value = {
    product_name: `Code inconnu : ${code}`,
    counted_quantity: 0,
    variance_quantity: null,
    severity: 'unknown',
  }
}

// ---------------------------------------------------------------- offline sync
async function updatePendingCount() {
  try { pendingCount.value = (await offlineStore.getAllPending(sessionId.value)).length } catch { pendingCount.value = 0 }
}

async function flushQueue() {
  if (!sessionId.value) return
  let pending
  try { pending = await offlineStore.getAllPending(sessionId.value) } catch { return }
  if (!pending.length) { pendingCount.value = 0; return }
  try {
    const res = await api.post(`/inventory/sessions/${sessionId.value}/scans`, {
      items: pending.map(p => ({
        ...(p.barcode ? { barcode: p.barcode } : { product_id: p.product_id }),
        quantity: p.quantity,
        ...(p.mode ? { mode: p.mode } : {}),
        ...(p.zone ? { zone: p.zone } : {}),
      })),
      mode: 'set',
    })
    await offlineStore.markSynced(pending.map(p => p.id))
    await offlineStore.clearSynced()
    await updatePendingCount()
    refreshProgress()
    lastScan.value = { product_name: `⬆ ${res.data?.counted ?? pending.length} comptages synchronisés`, counted_quantity: 0, variance_quantity: null, severity: 'ok' }
  } catch (e) {
    if (e.status !== undefined) {
      // refus permanent → on vide pour ne pas bloquer
      await offlineStore.markSynced(pending.map(p => p.id))
      await offlineStore.clearSynced()
      await updatePendingCount()
    }
  }
}

function onOnline() { online.value = true; flushQueue() }
window.__flushOfflineQueue = flushQueue
function onOffline() { online.value = false }

// ---------------------------------------------------------------- zone / session
async function finishZone() {
  if (submitting.value) return
  await flushQueue()
  const z = currentZone.value
  if (z && !completedZoneIds.value.includes(z.id)) {
    completedZoneIds.value.push(z.id)
    saveCompletedZones()
  }
  await refreshProgress()
  if (nextZone.value) {
    startZone(nextZone.value)
  } else {
    // toutes les zones faites → terminer la session
    await completeSession()
  }
}

function leaveCounting() {
  stopCamera()
  if (chronoTimer) clearInterval(chronoTimer)
  if (progressTimer) clearInterval(progressTimer)
  step.value = 'zones'
  loadZones()
}

async function completeSession() {
  submitting.value = true
  error.value = null
  try {
    await flushQueue()
    await api.put(`/inventory/sessions/${sessionId.value}/complete`, { notes: null })
    step.value = 'recap'
    await loadRecap()
  } catch (e) {
    error.value = e.message || 'Impossible de terminer la session'
  } finally {
    submitting.value = false
  }
}

async function loadRecap() {
  loading.value = true
  error.value = null
  try {
    const res = await api.get(`/inventory/sessions/${sessionId.value}/summary`)
    summary.value = res.data || res
    // nettoyage
    localStorage.removeItem(`tipsmana_express_done_${sessionId.value}`)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// ---------------------------------------------------------------- picker produit
async function openPicker() {
  showPicker.value = true
  pickerSearch.value = ''
  if (!missingProducts.value.length) {
    pickerLoading.value = true
    try {
      const res = await api.get(`/inventory/sessions/${sessionId.value}/summary`)
      const data = res.data || res
      missingProducts.value = data.missing_products || []
    } catch {
      missingProducts.value = []
    } finally {
      pickerLoading.value = false
    }
  }
}

const pickedProduct = ref(null)
function pickProduct(p) {
  pickedProduct.value = p
  showPicker.value = false
  keypadVisible.value = true
  keypadOpenForManual.value = true
  qty.value = '1'
}

// ---------------------------------------------------------------- lifecycle
onMounted(() => {
  loadSessions()
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  updatePendingCount()
})

onBeforeUnmount(() => {
  stopCamera()
  if (chronoTimer) clearInterval(chronoTimer)
  if (progressTimer) clearInterval(progressTimer)
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
})
</script>

<style scoped>
.express-view {
  min-height: 100vh;
  background: #131325;
  color: #fff;
}
.pane { padding: 16px; padding-bottom: 90px; }
.page-header { margin-bottom: 16px; }
.page-header h2 { font-size: 22px; color: #fff; margin: 0; }
.subtitle { font-size: 13px; color: #888; margin-top: 4px; }
.btn-text { background: none; border: none; color: #6c5ce7; font-size: 13px; margin-top: 8px; padding: 0; cursor: pointer; }
.loading-state, .error-state, .empty-state { color: #666; text-align: center; padding: 40px; }
.empty-state.small { padding: 20px; }
.empty-icon { font-size: 48px; margin-bottom: 8px; }
.sessions-section { margin-bottom: 20px; }
.sessions-section h3, .missing-section h3 { font-size: 14px; color: #aaa; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
.session-card, .zone-card {
  background: #1e1e32; border-radius: 12px; padding: 14px; margin-bottom: 8px; cursor: pointer;
}
.session-card:active, .zone-card:active { background: #2a2a40; }
.session-header, .zone-top { display: flex; justify-content: space-between; align-items: center; }
.session-header strong, .zone-top strong { color: #fff; font-size: 14px; }
.session-status, .zone-status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; }
.session-status { background: rgba(108,92,231,0.2); color: #a89bf0; }
.zone-status.todo { background: rgba(255,255,255,0.08); color: #999; }
.zone-status.active { background: rgba(255,193,7,0.15); color: #ffc107; }
.zone-status.done { background: rgba(0,210,160,0.15); color: #00d2a0; }
.session-meta, .zone-meta { font-size: 12px; color: #888; margin-top: 6px; display: flex; gap: 12px; }

.btn-primary {
  background: #6c5ce7; color: #fff; border: none; border-radius: 12px;
  padding: 14px; font-size: 15px; font-weight: 600; cursor: pointer;
}
.btn-primary:disabled { opacity: 0.5; }
.btn-block { width: 100%; }
.center { display: block; text-align: center; text-decoration: none; margin-top: 20px; }

/* progression */
.progress-overview { background: #1e1e32; border-radius: 12px; padding: 14px; margin-bottom: 16px; }
.progress-bar { background: #2a2a40; border-radius: 6px; height: 8px; overflow: hidden; }
.progress-bar.slim { height: 4px; border-radius: 0; }
.progress-fill { background: linear-gradient(90deg, #6c5ce7, #00d2a0); height: 100%; transition: width 0.4s; }
.progress-labels { display: flex; justify-content: space-between; font-size: 12px; color: #aaa; margin-top: 8px; }
.eta { font-size: 12px; color: #6c5ce7; margin-top: 6px; }

/* comptage */
.counting { padding-bottom: 20px; }
.count-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; }
.btn-icon { background: #1e1e32; color: #fff; border: none; border-radius: 10px; width: 36px; height: 36px; font-size: 18px; cursor: pointer; }
.count-header-info { flex: 1; min-width: 0; }
.count-header-info strong { display: block; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.count-sub { font-size: 12px; color: #888; }
.offline-badge { font-size: 11px; font-weight: 600; background: rgba(255,80,80,0.15); color: #ff6b6b; padding: 4px 8px; border-radius: 6px; white-space: nowrap; }
.offline-badge.pending { background: rgba(108,92,231,0.2); color: #a89bf0; cursor: pointer; }

.camera-wrap {
  position: relative; margin: 0 16px; border-radius: 14px; overflow: hidden;
  background: #000; aspect-ratio: 4/3;
}
.camera-feed { width: 100%; height: 100%; object-fit: cover; display: block; }
.scan-frame {
  position: absolute; inset: 22%; border: 2px solid rgba(0,210,160,0.8);
  border-radius: 12px; box-shadow: 0 0 0 200vmax rgba(0,0,0,0.25); pointer-events: none;
}
.camera-wrap.paused .camera-feed { opacity: 0.15; }
.camera-fallback {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-size: 13px; color: #ccc; text-align: center; padding: 16px;
}
.camera-fallback .hint { font-size: 12px; color: #888; margin-top: 6px; }

.last-scan {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  margin: 12px 16px 0; background: #1b3a2f; border: 1px solid #00d2a0;
  border-radius: 10px; padding: 10px 12px;
}
.last-scan.sev-critical { background: #3a1f1f; border-color: #ff6b6b; }
.last-scan.sev-warning { background: #3a3015; border-color: #ffc107; }
.last-scan.sev-unknown, .last-scan.sev-queued { background: #23233a; border-color: #6c5ce7; }
.last-scan-info strong { display: block; font-size: 13px; }
.last-scan-info span { font-size: 12px; color: #aaa; }
.last-scan-close { color: #888; font-size: 14px; padding: 4px; cursor: pointer; }

.manual-row { display: flex; gap: 8px; margin: 12px 16px 0; }
.manual-input {
  flex: 1; background: #1e1e32; border: 1px solid #2a2a40; border-radius: 10px;
  color: #fff; padding: 11px 12px; font-size: 14px; outline: none;
}
.btn-secondary {
  background: #1e1e32; color: #a89bf0; border: 1px solid #3a3a55; border-radius: 10px;
  padding: 0 14px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
}
.btn-secondary:active { background: #2a2a40; }

/* clavier */
.keypad { margin: 12px 16px 0; }
.keypad-screen { background: #1e1e32; border-radius: 12px; padding: 12px; }
.qty-display {
  font-size: 40px; font-weight: 700; text-align: center; color: #fff;
  background: #131325; border-radius: 10px; padding: 8px 0; min-height: 56px;
}
.qty-presets { display: flex; gap: 8px; margin-top: 10px; }
.preset {
  flex: 1; background: #2a2a40; color: #fff; border: none; border-radius: 8px;
  padding: 10px 0; font-size: 14px; font-weight: 600; cursor: pointer;
}
.preset:active { background: #3a3a55; }
.mode-toggle { display: flex; gap: 8px; margin-top: 10px; }
.mode-btn {
  flex: 1; background: #131325; color: #888; border: 1px solid #2a2a40; border-radius: 8px;
  padding: 8px 0; font-size: 12px; font-weight: 600; cursor: pointer;
}
.mode-btn.active { background: rgba(108,92,231,0.2); color: #a89bf0; border-color: #6c5ce7; }

.keypad-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
.key {
  background: #1e1e32; color: #fff; border: none; border-radius: 12px;
  padding: 18px 0; font-size: 22px; font-weight: 600; cursor: pointer;
}
.key:active { background: #2a2a40; }
.key-zero { grid-column: 1; }
.key-back { background: #2a2a40; }

.btn-ok {
  width: 100%; margin-top: 10px; background: #00d2a0; color: #06231a; border: none;
  border-radius: 12px; padding: 16px 0; font-size: 17px; font-weight: 700; cursor: pointer;
}
.btn-ok:disabled { opacity: 0.5; }

.zone-footer { margin: 14px 16px 0; }
.btn-danger {
  width: 100%; background: rgba(255,80,80,0.12); color: #ff6b6b; border: 1px solid #4a2a2a;
  border-radius: 12px; padding: 14px 0; font-size: 14px; font-weight: 600; cursor: pointer;
}
.btn-danger:disabled { opacity: 0.5; }
.btn-danger:active { background: rgba(255,80,80,0.2); }

/* modal picker */
.modal {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 50;
  display: flex; align-items: flex-end; justify-content: center;
}
.modal-body {
  background: #1e1e32; border-radius: 16px 16px 0 0; width: 100%; max-width: 480px;
  padding: 16px; max-height: 70vh; display: flex; flex-direction: column;
}
.modal-body h3 { font-size: 16px; margin: 0 0 12px; }
.picker-list { overflow-y: auto; margin-top: 10px; flex: 1; }
.picker-item { background: #131325; border-radius: 10px; padding: 12px; margin-bottom: 8px; cursor: pointer; }
.picker-item:active { background: #2a2a40; }
.picker-item strong { display: block; font-size: 13px; }
.picker-item span { font-size: 11px; color: #888; }

/* récapitulatif */
.recap-totals { display: flex; gap: 10px; margin-bottom: 20px; }
.recap-cell { flex: 1; background: #1e1e32; border-radius: 12px; padding: 14px; text-align: center; }
.recap-value { display: block; font-size: 20px; font-weight: 700; }
.recap-label { font-size: 11px; color: #888; }
.missing-section h3 { margin-top: 8px; }
.missing-item { display: flex; justify-content: space-between; background: #1e1e32; border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; font-size: 13px; }
.muted { color: #888; font-size: 12px; }

.pop-enter-active, .pop-leave-active { transition: all 0.2s ease; }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
