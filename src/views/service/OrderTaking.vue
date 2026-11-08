<template>
  <div class="ot-shell" :class="{ 'has-cart': cart.length }">
    <!-- ═══ HEADER ═══ -->
    <header class="ot-header">
      <button class="ot-back" :title="t('service.backToTables')" @click="router.push('/service')">←</button>
      <div class="ot-header-main">
        <div class="ot-title">
          {{ t('common.table', { number: tableNumber }) }}
          <span v-if="linkedTables.length" class="ot-merged">+ {{ linkedTables.join(', ') }}</span>
        </div>
        <div class="ot-subtitle">
          <template v-if="ticket">👤{{ ticket.covers }} · {{ t('service.orderTaking.onNote', { amount: formatEur(ticket.totalTtc) }) }}</template>
          <template v-else>{{ t('service.orderTaking.newNote') }} · 👤{{ covers }}</template>
        </div>
      </div>
      <router-link to="/service/history" class="ot-icon-btn" :title="t('service.orderTaking.ordersInProgress')">🧾</router-link>
    </header>

    <!-- ═══ ONGLETS Carte / Note ═══ -->
    <div class="ot-tabs">
      <button class="ot-tab" :class="{ active: tab === 'menu' }" @click="tab = 'menu'">🍽 {{ t('service.orderTaking.tabMenu') }}</button>
      <button class="ot-tab" :class="{ active: tab === 'note' }" @click="tab = 'note'">
        🧾 {{ t('service.orderTaking.tabNote') }} <span v-if="ticketItemCount" class="ot-tab-count">{{ ticketItemCount }}</span>
      </button>
    </div>

    <!-- Envoi cuisine en échec : relance -->
    <div v-if="failedItems.length" class="ot-alert">
      <span>⚠️ {{ t('service.orderTaking.failedAlert', { count: failedItems.length }) }}</span>
      <button class="ot-alert-btn" :disabled="sending" @click="retryDispatch">{{ t('service.orderTaking.resend') }}</button>
    </div>

    <!-- ═══ CARTE ═══ -->
    <template v-if="tab === 'menu'">
      <div v-if="loadingMenu" class="ot-state">
        <span class="ot-spinner"></span>
        <span>{{ t('service.orderTaking.loadingMenu') }}</span>
      </div>
      <div v-else-if="menuError" class="ot-state ot-error">
        <p>⚠️ {{ menuError }}</p>
        <button class="btn-primary" @click="loadMenu">{{ t('common.retry') }}</button>
      </div>
      <div v-else-if="!categories.length" class="ot-state">
        <span class="ot-empty-icon">📭</span>
        <p>{{ t('service.orderTaking.emptyMenu') }}</p>
      </div>

      <template v-else>
        <div class="ot-cats">
          <button
            v-for="c in categories"
            :key="c.id"
            class="ot-cat"
            :class="{ active: activeCatId === c.id }"
            :style="activeCatId === c.id ? { background: c.color, borderColor: c.color } : null"
            @click="activeCatId = c.id"
          >{{ c.icon }} {{ c.name }}</button>
        </div>

        <div class="ot-prod-grid">
          <div
            v-for="p in activeCategory?.items || []"
            :key="p.id"
            class="ot-prod"
            :class="{ 'in-cart': qtyInCart(p.id) }"
          >
            <button class="ot-prod-main" @click="tapProduct(p)">
              <span class="ot-prod-name">{{ p.name }}</span>
              <span class="ot-prod-price">{{ formatEur(p.price) }}</span>
              <span v-if="hasOptions(p)" class="ot-prod-hint">⚙️ {{ t('service.orderTaking.optionsHint') }}</span>
            </button>
            <button class="ot-prod-edit" :title="t('service.orderTaking.editProduct')" @click="openSheet(p)">✎</button>
            <span v-if="qtyInCart(p.id)" class="ot-prod-badge">{{ qtyInCart(p.id) }}</span>
          </div>
        </div>
      </template>
    </template>

    <!-- ═══ NOTE (déjà enregistrée) ═══ -->
    <template v-else>
      <div v-if="loadingTicket" class="ot-state">
        <span class="ot-spinner"></span>
      </div>
      <div v-else-if="!ticket || !ticket.items.length" class="ot-state">
        <span class="ot-empty-icon">🧾</span>
        <p>{{ t('service.orderTaking.emptyNote') }}</p>
      </div>
      <div v-else class="ot-note">
        <div v-for="g in ticketGroups" :key="g.key" class="ot-group">
          <div class="ot-group-title">{{ g.icon }} {{ t(g.labelKey) }}</div>
          <div v-for="i in g.lines" :key="i.id" class="ot-line">
            <span class="ot-line-qty">{{ i.qty }}×</span>
            <span class="ot-line-info">
              <span class="ot-line-name">{{ i.name }}</span>
              <span v-if="i.options" class="ot-line-sub">⚙️ {{ formatOptions(i.options) }}</span>
              <span v-if="i.note" class="ot-line-sub">📝 {{ i.note }}</span>
            </span>
            <span v-if="failedIds.includes(i.id)" class="ot-line-flag">{{ t('service.orderTaking.notSent') }}</span>
            <span class="ot-line-price">{{ formatEur(i.qty * i.price) }}</span>
          </div>
        </div>
        <div class="ot-totals">
          <div class="ot-total-row"><span>{{ t('service.totals.totalHt') }}</span><span>{{ formatEur(ticket.totalHt) }}</span></div>
          <div class="ot-total-row"><span>{{ t('service.totals.vat') }}</span><span>{{ formatEur(ticket.totalTtc - ticket.totalHt) }}</span></div>
          <div class="ot-total-row ot-total-main"><span>{{ t('service.totals.totalTtc') }}</span><span>{{ formatEur(ticket.totalTtc) }}</span></div>
        </div>
        <div class="ot-note-actions">
          <button class="ot-note-btn" @click="openQr">📱 {{ t('service.orderTaking.customerQr') }}</button>
          <button v-if="linkedTables.length" class="ot-note-btn" @click="openSplit">✂️ {{ t('service.orderTaking.splitByTable') }}</button>
        </div>
      </div>
    </template>

    <!-- ═══ PANIER ═══ -->
    <div v-if="cart.length" class="ot-cart" :class="{ open: cartOpen }">
      <div class="ot-cart-header" @click="cartOpen = !cartOpen">
        <span class="ot-cart-title">🛒 {{ t('service.orderTaking.cart') }} <span class="ot-cart-count">{{ t('service.itemsShort', { count: cartCount }) }}</span></span>
        <span class="ot-cart-header-right">
          <span class="ot-cart-total">{{ formatEur(cartTotals.ttc) }}</span>
          <span class="ot-chevron" :class="{ open: cartOpen }">▾</span>
        </span>
      </div>

      <div v-if="cartOpen" class="ot-cart-body">
        <div v-for="g in cartGroups" :key="g.key" class="ot-group">
          <div class="ot-group-title">{{ g.icon }} {{ t(g.labelKey) }}</div>
          <div v-for="l in g.lines" :key="lineKey(l)" class="ot-line">
            <button class="ot-line-info ot-line-edit" :title="t('service.orderTaking.editLine')" @click="openLineEditor(l)">
              <span class="ot-line-name">{{ l.name }} <span class="ot-line-pen">✎</span></span>
              <span v-if="l.options" class="ot-line-sub">⚙️ {{ formatOptions(l.options) }}</span>
              <span v-if="l.note" class="ot-line-sub">📝 {{ l.note }}</span>
            </button>
            <span class="ot-qty">
              <button class="ot-qty-btn" @click="changeQty(l, -1)">−</button>
              <span class="ot-qty-val">{{ l.qty }}</span>
              <button class="ot-qty-btn" @click="changeQty(l, 1)">+</button>
            </span>
            <span class="ot-line-price">{{ formatEur(l.qty * l.price) }}</span>
          </div>
        </div>

        <div class="ot-totals">
          <div class="ot-total-row"><span>{{ t('service.totals.totalHt') }}</span><span>{{ formatEur(cartTotals.ht) }}</span></div>
          <div class="ot-total-row"><span>{{ t('service.totals.vat') }}</span><span>{{ formatEur(cartTotals.tva) }}</span></div>
          <div class="ot-total-row ot-total-main"><span>{{ t('service.totals.totalTtc') }}</span><span>{{ formatEur(cartTotals.ttc) }}</span></div>
          <div v-if="ticket" class="ot-total-row ot-total-table">
            <span>{{ t('service.orderTaking.tableTotalAfter') }}</span><span>{{ formatEur(ticket.totalTtc + cartTotals.ttc) }}</span>
          </div>
        </div>
        <button class="ot-clear" @click="clearCart">{{ t('service.orderTaking.clearCart') }}</button>
      </div>

      <div class="ot-cart-footer">
        <button class="ot-send" :disabled="sending" @click="send">
          <span v-if="sending" class="ot-btn-spinner"></span>
          <span v-else>📤 {{ t('service.orderTaking.sendToKitchen', { amount: formatEur(cartTotals.ttc) }) }}</span>
        </button>
      </div>
    </div>

    <!-- ═══ ÉDITION D'UNE LIGNE DU PANIER ═══ -->
    <div v-if="lineEdit" class="modal-overlay" @click.self="lineEdit = null">
      <div class="modal-card">
        <div class="modal-header">
          <span class="modal-title">{{ lineEdit.line.name }}</span>
          <button class="modal-close" @click="lineEdit = null">✕</button>
        </div>

        <div class="sheet-qty">
          <span class="sheet-label">{{ t('service.orderTaking.quantity') }}</span>
          <span class="ot-qty">
            <button class="ot-qty-btn lg" @click="changeQty(lineEdit.line, -1)">−</button>
            <span class="ot-qty-val lg">{{ lineEdit.line.qty }}</span>
            <button class="ot-qty-btn lg" @click="changeQty(lineEdit.line, 1)">+</button>
          </span>
        </div>

        <div class="sheet-group">
          <div class="sheet-label">{{ t('service.orderTaking.course') }}</div>
          <div class="sheet-opts">
            <button
              v-for="c in courses"
              :key="c.key"
              class="sheet-opt"
              :class="{ active: lineEdit.line.course === c.key }"
              @click="changeCourse(c.key)"
            >{{ c.icon }} {{ t(c.labelKey) }}</button>
          </div>
        </div>

        <div class="sheet-group">
          <div class="sheet-label">{{ t('service.orderTaking.orderInCourse') }}</div>
          <div class="sheet-opts">
            <button class="sheet-opt" :disabled="!canMove(-1)" @click="move(-1)">▲ {{ t('service.orderTaking.moveUp') }}</button>
            <button class="sheet-opt" :disabled="!canMove(1)" @click="move(1)">▼ {{ t('service.orderTaking.moveDown') }}</button>
          </div>
        </div>

        <div class="sheet-group">
          <label class="sheet-label" for="line-note">{{ t('service.orderTaking.kitchenNote') }}</label>
          <div class="sheet-opts">
            <button v-for="q in notePresets" :key="q" class="sheet-opt sm" @click="appendNote(q)">{{ q }}</button>
          </div>
          <textarea
            id="line-note"
            v-model="lineEdit.note"
            class="sheet-note"
            rows="2"
            maxlength="120"
            :placeholder="t('service.orderTaking.lineNotePlaceholder')"
          ></textarea>
        </div>

        <div class="modal-actions">
          <button class="btn-danger" @click="askRemove(lineEdit.line)">🗑 {{ t('common.delete') }}</button>
          <span class="modal-spacer"></span>
          <button class="btn-primary" @click="saveLineNote">{{ t('common.validate') }}</button>
        </div>
      </div>
    </div>

    <!-- ═══ CONFIRMATION SUPPRESSION ═══ -->
    <div v-if="removeFor" class="modal-overlay confirm" @click.self="removeFor = null">
      <div class="modal-card">
        <div class="modal-title">{{ t('service.orderTaking.removeTitle') }}</div>
        <p class="modal-text">{{ t('service.orderTaking.removeText', { qty: removeFor.qty, name: removeFor.name }) }}</p>
        <div class="modal-actions">
          <span class="modal-spacer"></span>
          <button class="btn-ghost" @click="removeFor = null">{{ t('common.cancel') }}</button>
          <button class="btn-danger" @click="confirmRemove">{{ t('common.delete') }}</button>
        </div>
      </div>
    </div>

    <!-- ═══ QR NOTE CLIENT ═══ -->
    <div v-if="qr" class="modal-overlay" @click.self="qr = null">
      <div class="modal-card qr-card">
        <div class="modal-header">
          <span class="modal-title">📱 {{ t('service.orderTaking.qrTitle', { table: tableNumber }) }}</span>
          <button class="modal-close" @click="qr = null">✕</button>
        </div>
        <p class="modal-text">{{ t('service.orderTaking.qrText') }}</p>
        <img v-if="qr.dataUrl" :src="qr.dataUrl" class="qr-img" :alt="t('service.orderTaking.qrAlt')" />
        <p v-else-if="qr.error" class="ot-error">{{ qr.error }}</p>
        <span v-else class="ot-spinner"></span>
        <div class="modal-actions">
          <a class="btn-ghost" :href="qr.url" target="_blank" rel="noopener">{{ t('service.orderTaking.openCustomerScreen') }}</a>
        </div>
      </div>
    </div>

    <!-- ═══ SÉPARATION PAR TABLE ═══ -->
    <div v-if="split" class="modal-overlay" @click.self="split = null">
      <div class="modal-card">
        <div class="modal-header">
          <span class="modal-title">✂️ {{ t('service.orderTaking.splitTitle') }}</span>
          <button class="modal-close" @click="split = null">✕</button>
        </div>
        <p class="modal-text">{{ t('service.orderTaking.splitText', { table: tableNumber }) }}</p>
        <div class="split-list">
          <div v-for="i in ticket.items" :key="i.id" class="split-row">
            <span class="split-name">{{ i.qty }}× {{ i.name }}</span>
            <span class="split-tables">
              <button
                v-for="n in allTables"
                :key="n"
                class="split-table"
                :class="{ active: split.assignments[i.id] === n }"
                @click="split.assignments[i.id] = n"
              >{{ n }}</button>
            </span>
          </div>
        </div>
        <div class="modal-actions">
          <span class="modal-spacer"></span>
          <button class="btn-ghost" @click="split = null">{{ t('common.cancel') }}</button>
          <button class="btn-primary" :disabled="split.busy || !splitMoves" @click="confirmSplit">
            {{ t('service.orderTaking.splitConfirm', { count: splitMoves }) }}
          </button>
        </div>
      </div>
    </div>

    <!-- ═══ FICHE ARTICLE ═══ -->
    <div v-if="sheet" class="modal-overlay" @click.self="sheet = null">
      <div class="modal-card">
        <div class="modal-header">
          <span class="modal-title">{{ sheet.product.name }}</span>
          <button class="modal-close" @click="sheet = null">✕</button>
        </div>

        <div class="sheet-qty">
          <span class="sheet-label">{{ t('service.orderTaking.quantity') }}</span>
          <span class="ot-qty">
            <button class="ot-qty-btn lg" :disabled="sheet.qty <= 1" @click="sheet.qty--">−</button>
            <span class="ot-qty-val lg">{{ sheet.qty }}</span>
            <button class="ot-qty-btn lg" @click="sheet.qty++">+</button>
          </span>
        </div>

        <div v-for="group in sheetGroups" :key="group.key" class="sheet-group">
          <div class="sheet-label">{{ t(group.labelKey) }}</div>
          <div class="sheet-opts">
            <button
              v-for="opt in group.options"
              :key="opt"
              class="sheet-opt"
              :class="{ active: sheet.options[group.key] === opt }"
              @click="toggleOption(group.key, opt)"
            >{{ optionLabel(opt) }}</button>
          </div>
        </div>

        <div class="sheet-group">
          <label class="sheet-label" for="sheet-note">{{ t('service.orderTaking.kitchenNote') }}</label>
          <textarea
            id="sheet-note"
            v-model="sheet.note"
            class="sheet-note"
            rows="2"
            maxlength="120"
            :placeholder="t('service.orderTaking.sheetNotePlaceholder')"
          ></textarea>
        </div>

        <div class="modal-actions">
          <span class="modal-price">{{ formatEur(sheet.qty * sheet.product.price) }}</span>
          <button class="btn-primary" @click="addFromSheet">+ {{ t('service.orderTaking.add') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QRCode from 'qrcode'
import {
  OPTION_GROUPS, COURSE_OPTIONS, COURSES,
  addLine, setLineQty, lineKey, computeTotals, groupByCourse, formatEur, formatOptions, optionLabel,
  removeLine, setLineNote, setLineCourse, moveLine, ticketTables, splitTableTicket, customerDisplayUrl,
  fetchMenu, fetchTableTicket, sendOrder, retryFailedDispatch,
  getKitchenRecord, loadDraft, saveDraft, currentEstablishmentId, toNumber, recordServiceOrder,
} from '../../shared/serviceOrders'
import { ensureNotificationPermission } from '../../shared/orderNotifications'
import { useAuthStore } from '../../stores/authStore'
import { useI18n } from '../../i18n'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { t } = useI18n()

const tableNumber = computed(() => toNumber(route.params.number))
const covers = computed(() => Math.max(1, toNumber(route.query.covers, 1)))
// Figé au montage : la vue est remontée à chaque bascule d'établissement (App.vue)
const estId = currentEstablishmentId()

const tab = ref('menu')
const categories = ref([])
const activeCatId = ref(null)
const loadingMenu = ref(true)
const menuError = ref(null)

const ticket = ref(null)
const loadingTicket = ref(true)
const kitchenRec = ref({ refs: [], sentItemIds: [], failedItemIds: [] })

const cart = ref(loadDraft(estId, tableNumber.value))
const cartOpen = ref(false)
const sending = ref(false)
const sheet = ref(null)
const lineEdit = ref(null)
const removeFor = ref(null)
const qr = ref(null)
const split = ref(null)

const courses = COURSES
// Raccourcis de note : texte libre inséré dans la langue de l'écran
const NOTE_PRESET_KEYS = ['options.saignant', 'options.aPoint', 'options.bienCuit', 'notePresets.glutenFree', 'notePresets.lactoseFree', 'notePresets.nutAllergy', 'notePresets.noOnions']
const notePresets = computed(() => NOTE_PRESET_KEYS.map(k => t(`service.${k}`)))

/* ═══ Computed ═══ */
const activeCategory = computed(() =>
  categories.value.find(c => c.id === activeCatId.value) || categories.value[0] || null
)
const cartTotals = computed(() => computeTotals(cart.value))
const cartCount = computed(() => cart.value.reduce((s, l) => s + l.qty, 0))
const cartGroups = computed(() => groupByCourse(cart.value))
const ticketGroups = computed(() => groupByCourse(ticket.value?.items || []))
const ticketItemCount = computed(() => (ticket.value?.items || []).reduce((s, i) => s + i.qty, 0))
const failedIds = computed(() => kitchenRec.value.failedItemIds)
const failedItems = computed(() =>
  (ticket.value?.items || []).filter(i => failedIds.value.includes(i.id))
)
const allTables = computed(() => (ticket.value ? ticketTables(ticket.value, estId) : [tableNumber.value]))
const linkedTables = computed(() => allTables.value.filter(n => n !== tableNumber.value))
const splitMoves = computed(() =>
  split.value ? Object.values(split.value.assignments).filter(n => n !== tableNumber.value).length : 0
)
const sheetGroups = computed(() => (sheet.value ? optionGroupsFor(sheet.value.product) : []))

watch(cart, val => saveDraft(estId, tableNumber.value, val), { deep: true })

// Changement de table sans démontage (même route, autre paramètre)
watch(tableNumber, number => {
  if (!number) return
  sheet.value = null
  lineEdit.value = null
  removeFor.value = null
  qr.value = null
  split.value = null
  cartOpen.value = false
  tab.value = 'menu'
  ticket.value = null
  cart.value = loadDraft(estId, number)
  loadTicket()
})

/* ═══ Chargements ═══ */
async function loadMenu() {
  loadingMenu.value = true
  menuError.value = null
  try {
    categories.value = await fetchMenu()
    if (!categories.value.some(c => c.id === activeCatId.value)) {
      activeCatId.value = categories.value[0]?.id || null
    }
  } catch (e) {
    menuError.value = e.message || t('service.orderTaking.toasts.menuUnavailable')
  } finally {
    loadingMenu.value = false
  }
}

async function loadTicket() {
  loadingTicket.value = true
  try {
    ticket.value = await fetchTableTicket(tableNumber.value)
  } catch {
    // Hors-ligne sans cache : on garde la note affichée
  } finally {
    loadingTicket.value = false
    refreshKitchenRec()
  }
}

function refreshKitchenRec() {
  kitchenRec.value = ticket.value
    ? getKitchenRecord(estId, ticket.value.id)
    : { refs: [], sentItemIds: [], failedItemIds: [] }
}

/* ═══ Articles ═══ */
function optionGroupsFor(product) {
  return (COURSE_OPTIONS[product.course] || []).map(k => OPTION_GROUPS[k]).filter(Boolean)
}

function hasOptions(product) {
  return optionGroupsFor(product).length > 0
}

function qtyInCart(productId) {
  return cart.value.reduce((s, l) => s + (l.productId === productId ? l.qty : 0), 0)
}

function tapProduct(product) {
  if (hasOptions(product)) {
    openSheet(product)
    return
  }
  cart.value = addLine(cart.value, product)
}

function openSheet(product) {
  sheet.value = { product, qty: 1, options: {}, note: '' }
}

function toggleOption(groupKey, opt) {
  const current = sheet.value.options[groupKey]
  sheet.value.options = { ...sheet.value.options, [groupKey]: current === opt ? null : opt }
}

function addFromSheet() {
  const { product, qty, note } = sheet.value
  const opts = sheetGroups.value.map(g => sheet.value.options[g.key]).filter(Boolean)
  cart.value = addLine(cart.value, product, { qty, options: opts.join(' + ') || null, note })
  sheet.value = null
}

/* ═══ Panier ═══ */
function lineIndex(line) {
  return cart.value.findIndex(l => lineKey(l) === lineKey(line))
}

function changeQty(line, delta) {
  const idx = lineIndex(line)
  if (idx === -1) return
  const qty = cart.value[idx].qty + delta
  // Passer à 0 = supprimer : on demande confirmation
  if (qty <= 0) return askRemove(cart.value[idx])
  cart.value = setLineQty(cart.value, idx, qty)
  if (lineEdit.value) lineEdit.value.line = cart.value[idx]
}

function askRemove(line) {
  removeFor.value = line
}

function confirmRemove() {
  const idx = lineIndex(removeFor.value)
  if (idx !== -1) cart.value = removeLine(cart.value, idx)
  removeFor.value = null
  lineEdit.value = null
  if (!cart.value.length) cartOpen.value = false
}

/* Édition d'une ligne : note, service, ordre */
function openLineEditor(line) {
  lineEdit.value = { line, note: line.note || '' }
}

function changeCourse(course) {
  const idx = lineIndex(lineEdit.value.line)
  if (idx === -1) return
  cart.value = setLineCourse(cart.value, idx, course)
  lineEdit.value.line = cart.value[idx]
}

function canMove(dir) {
  const idx = lineIndex(lineEdit.value.line)
  return idx !== -1 && moveLine(cart.value, idx, dir) !== cart.value
}

function move(dir) {
  const idx = lineIndex(lineEdit.value.line)
  if (idx !== -1) cart.value = moveLine(cart.value, idx, dir)
}

function appendNote(text) {
  const cur = lineEdit.value.note.trim()
  if (cur.split(/,\s*/).includes(text)) return
  lineEdit.value.note = cur ? `${cur}, ${text}` : text
}

function saveLineNote() {
  const idx = lineIndex(lineEdit.value.line)
  if (idx !== -1) cart.value = setLineNote(cart.value, idx, lineEdit.value.note)
  lineEdit.value = null
}

function clearCart() {
  cart.value = []
  cartOpen.value = false
}

/* ═══ Envoi ═══ */
function toast(message, type = 'success') {
  if (window.__showToast) window.__showToast(message, type)
}

async function send() {
  if (!cart.value.length || sending.value) return
  // Premier envoi : demande la permission (doit partir du geste utilisateur), sans bloquer l'envoi
  ensureNotificationPermission()
  sending.value = true
  try {
    const sentCount = cartCount.value
    const res = await sendOrder({
      tableNumber: tableNumber.value,
      cart: cart.value,
      covers: covers.value,
      openTable: !ticket.value,
    })
    recordServiceOrder({ estId, userId: authStore.user?.id, tableNumber: tableNumber.value, itemCount: sentCount })
    cart.value = []
    cartOpen.value = false
    if (res.queued) {
      toast(t('service.orderTaking.toasts.queued'), 'warning')
    } else {
      ticket.value = res.ticket
      if (res.dispatched) toast(t('service.orderTaking.toasts.sent', { table: tableNumber.value }))
      else toast(t('service.orderTaking.toasts.savedDispatchFailed', { error: res.error }), 'error')
    }
    refreshKitchenRec()
  } catch (e) {
    toast(e.data?.detail || e.message || t('service.orderTaking.toasts.sendFailed'), 'error')
  } finally {
    sending.value = false
  }
}

/* ═══ Note client (QR) ═══ */
async function openQr() {
  if (!ticket.value) return
  const url = customerDisplayUrl(ticket.value)
  qr.value = { url, dataUrl: null, error: null }
  try {
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: 'L' })
    if (qr.value?.url === url) qr.value.dataUrl = dataUrl
  } catch {
    if (qr.value) qr.value.error = t('service.orderTaking.toasts.qrFailed')
  }
}

/* ═══ Séparation d'une note fusionnée ═══ */
function openSplit() {
  if (!ticket.value) return
  split.value = {
    busy: false,
    assignments: Object.fromEntries(ticket.value.items.map(i => [i.id, tableNumber.value])),
  }
}

async function confirmSplit() {
  if (!split.value || split.value.busy) return
  split.value.busy = true
  try {
    const res = await splitTableTicket({ ticket: ticket.value, assignments: split.value.assignments })
    split.value = null
    if (res.queued) toast(t('service.orderTaking.toasts.splitQueued'), 'warning')
    else toast(t('service.orderTaking.toasts.splitDone'))
    await loadTicket()
  } catch (e) {
    if (split.value) split.value.busy = false
    toast(e.data?.detail || e.message || t('service.orderTaking.toasts.splitFailed'), 'error')
  }
}

async function retryDispatch() {
  if (!ticket.value || sending.value) return
  sending.value = true
  try {
    const res = await retryFailedDispatch(ticket.value)
    if (res.dispatched) toast(t('service.orderTaking.toasts.retrySent'))
    else toast(t('service.orderTaking.toasts.retryFailed', { error: res.error }), 'error')
  } finally {
    refreshKitchenRec()
    sending.value = false
  }
}

onMounted(() => {
  loadMenu()
  loadTicket()
})
</script>

<style scoped>
.ot-shell {
  display: flex; flex-direction: column; gap: 10px;
  min-height: 100dvh;
  padding: 0 10px calc(90px + env(safe-area-inset-bottom));
  background: var(--bg, #0d0d14);
  color: var(--text, #fff);
}
.ot-shell.has-cart { padding-bottom: calc(190px + env(safe-area-inset-bottom)); }

/* ─── Header ─── */
.ot-header {
  position: sticky; top: 0; z-index: 50;
  display: flex; align-items: center; gap: 10px;
  margin: 0 -10px; padding: 10px 12px;
  background: var(--nav-bg, #15152a); border-bottom: 1px solid var(--card-border, #2a2a40);
}
.ot-back {
  width: 38px; height: 38px; border-radius: 10px; font-size: 18px; font-weight: 800; cursor: pointer;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e); color: var(--text, #fff);
}
.ot-header-main { flex: 1; min-width: 0; }
.ot-title { font-size: 18px; font-weight: 800; }
.ot-subtitle { font-size: 12px; color: var(--muted, #8a8aa0); }
.ot-icon-btn {
  width: 38px; height: 38px; border-radius: 10px; font-size: 18px; text-decoration: none;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e); color: var(--text, #fff);
}

/* ─── Onglets ─── */
.ot-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.ot-tab {
  padding: 10px; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e); color: var(--muted, #8a8aa0);
}
.ot-tab.active { background: var(--primary, #10b981); border-color: var(--primary, #10b981); color: #0d0d14; }
.ot-tab-count {
  display: inline-block; min-width: 18px; padding: 0 5px; margin-left: 4px; border-radius: 9px;
  font-size: 11px; background: rgba(0, 0, 0, 0.25);
}

.ot-alert {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 12px;
  font-size: 12px; font-weight: 700; color: var(--amber, #f59e0b);
  background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35);
}
.ot-alert span { flex: 1; }
.ot-alert-btn {
  padding: 8px 12px; border: none; border-radius: 8px; cursor: pointer;
  background: var(--amber, #f59e0b); color: #0d0d14; font-size: 12px; font-weight: 800;
}

/* ─── Catégories ─── */
.ot-cats {
  position: sticky; top: 59px; z-index: 40;
  display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none;
  margin: 0 -10px; padding: 6px 10px; background: var(--bg, #0d0d14);
}
.ot-cats::-webkit-scrollbar { display: none; }
.ot-cat {
  flex-shrink: 0; padding: 9px 14px; border-radius: 20px; cursor: pointer; white-space: nowrap;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e);
  color: var(--text, #fff); font-size: 13px; font-weight: 700;
}
.ot-cat.active { color: #0d0d14; font-weight: 800; }

/* ─── Produits ─── */
.ot-prod-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ot-prod {
  position: relative; display: flex; border-radius: 14px; overflow: hidden;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e);
}
.ot-prod.in-cart { border-color: var(--primary, #10b981); }
.ot-prod-main {
  flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
  min-height: 86px; padding: 12px 10px; border: none; background: none; cursor: pointer;
  color: var(--text, #fff); text-align: left;
}
.ot-prod-main:active { background: rgba(16, 185, 129, 0.1); }
.ot-prod-name { font-size: 13px; font-weight: 700; line-height: 1.2; }
.ot-prod-price { margin-top: auto; font-size: 15px; font-weight: 800; color: var(--success, #10b981); }
.ot-prod-hint { font-size: 10px; color: var(--muted, #8a8aa0); }
.ot-prod-edit {
  width: 34px; border: none; border-left: 1px solid var(--card-border, #2a2a40); cursor: pointer;
  background: rgba(255, 255, 255, 0.03); color: var(--muted, #8a8aa0); font-size: 15px;
}
.ot-prod-badge {
  position: absolute; top: 6px; right: 40px; min-width: 22px; height: 22px; padding: 0 6px;
  display: flex; align-items: center; justify-content: center; border-radius: 11px;
  background: var(--primary, #10b981); color: #0d0d14; font-size: 12px; font-weight: 800;
}

/* ─── Lignes (note + panier) ─── */
.ot-note { display: flex; flex-direction: column; gap: 10px; }
.ot-group { display: flex; flex-direction: column; }
.ot-group-title {
  font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--muted, #8a8aa0); padding: 6px 0 2px;
}
.ot-line {
  display: flex; align-items: center; gap: 8px; padding: 8px 0;
  border-bottom: 1px solid var(--card-border, #2a2a40);
}
.ot-line-qty { font-weight: 800; color: var(--primary, #10b981); min-width: 26px; }
.ot-line-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ot-line-name { font-size: 13px; font-weight: 700; }
.ot-line-sub { font-size: 11px; color: var(--muted, #8a8aa0); }
.ot-line-flag {
  font-size: 9px; font-weight: 800; text-transform: uppercase; padding: 2px 6px; border-radius: 6px;
  color: var(--amber, #f59e0b); background: rgba(245, 158, 11, 0.15);
}
.ot-line-price { font-size: 13px; font-weight: 800; min-width: 62px; text-align: right; color: var(--success, #10b981); }

.ot-qty { display: flex; align-items: center; gap: 4px; }
.ot-qty-btn {
  width: 28px; height: 28px; border-radius: 7px; cursor: pointer; font-size: 15px; line-height: 1;
  border: 1px solid var(--card-border, #2a2a40); background: var(--hover-bg, #2a2a40); color: var(--text, #fff);
}
.ot-qty-btn:disabled { opacity: 0.35; }
.ot-qty-btn.lg { width: 40px; height: 40px; font-size: 20px; border-radius: 10px; }
.ot-qty-val { min-width: 22px; text-align: center; font-size: 14px; font-weight: 800; }
.ot-qty-val.lg { min-width: 36px; font-size: 20px; }

.ot-totals { display: flex; flex-direction: column; gap: 4px; padding-top: 8px; }
.ot-total-row { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted, #8a8aa0); }
.ot-total-main { font-size: 16px; font-weight: 800; color: var(--text, #fff); }
.ot-total-table { font-size: 12px; font-weight: 700; color: var(--amber, #f59e0b); }

/* ─── Panier flottant ─── */
.ot-cart {
  position: fixed; left: 8px; right: 8px; bottom: calc(64px + env(safe-area-inset-bottom)); z-index: 90;
  display: flex; flex-direction: column; max-height: 62dvh; overflow: hidden;
  border-radius: 16px; border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e);
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.45);
}
.ot-cart-header {
  display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; cursor: pointer;
  background: var(--nav-bg, #15152a);
}
.ot-cart-title { font-size: 14px; font-weight: 800; display: flex; align-items: center; gap: 8px; }
.ot-cart-count {
  font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 8px;
  background: rgba(16, 185, 129, 0.2); color: var(--success, #10b981);
}
.ot-cart-header-right { display: flex; align-items: center; gap: 10px; }
.ot-cart-total { font-size: 16px; font-weight: 800; color: var(--success, #10b981); }
.ot-chevron { color: var(--muted, #8a8aa0); font-size: 12px; transition: transform 0.2s; }
.ot-chevron.open { transform: rotate(180deg); }
.ot-cart-body { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 12px 8px; }
.ot-clear {
  margin-top: 8px; padding: 6px 0; border: none; background: none; cursor: pointer;
  color: var(--danger, #ef4444); font-size: 12px; font-weight: 700;
}
.ot-cart-footer { padding: 8px 12px 10px; border-top: 1px solid var(--card-border, #2a2a40); }
.ot-send {
  width: 100%; padding: 13px; border: none; border-radius: 12px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #34d399, #059669); color: #0d0d14;
  font-size: 15px; font-weight: 800; letter-spacing: 0.3px;
}
.ot-send:disabled { opacity: 0.5; cursor: not-allowed; }
.ot-btn-spinner {
  width: 18px; height: 18px; border-radius: 50%;
  border: 2px solid rgba(13, 13, 20, 0.3); border-top-color: #0d0d14; animation: spin 0.6s linear infinite;
}

/* ─── États ─── */
.ot-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  padding: 48px 16px; text-align: center; color: var(--muted, #8a8aa0);
}
.ot-error { color: var(--danger, #ef4444); }
.ot-empty-icon { font-size: 44px; }
.ot-spinner {
  width: 28px; height: 28px; border-radius: 50%;
  border: 3px solid var(--card-border, #2a2a40); border-top-color: var(--primary, #10b981);
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ─── Édition panier / note ─── */
.ot-merged {
  font-size: 12px; font-weight: 800; padding: 2px 8px; border-radius: 8px; vertical-align: middle;
  color: #a78bfa; background: rgba(139, 92, 246, 0.15);
}
.ot-line-edit {
  border: none; background: none; padding: 0; cursor: pointer; text-align: left; color: inherit; font: inherit;
}
.ot-line-pen { font-size: 11px; color: var(--muted, #8a8aa0); }
.ot-note-actions { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 6px; }
.ot-note-btn {
  flex: 1; padding: 12px; border-radius: 12px; cursor: pointer; font-size: 13px; font-weight: 800;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e); color: var(--text, #fff);
}
.modal-overlay.confirm { z-index: 310; }
.modal-text { font-size: 13px; color: var(--muted, #8a8aa0); margin: 0; }
.modal-spacer { flex: 1; }
.sheet-opt.sm { padding: 6px 10px; font-size: 12px; }
.sheet-opt:disabled { opacity: 0.35; cursor: not-allowed; }
.qr-card { align-items: center; text-align: center; }
.qr-img { width: 240px; height: 240px; border-radius: 12px; background: #fff; padding: 8px; }
.split-list { display: flex; flex-direction: column; gap: 6px; }
.split-row {
  display: flex; align-items: center; gap: 8px; padding: 6px 0;
  border-bottom: 1px solid var(--card-border, #2a2a40);
}
.split-name { flex: 1; min-width: 0; font-size: 13px; font-weight: 700; }
.split-tables { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.split-table {
  min-width: 34px; padding: 6px 8px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 800;
  border: 1px solid var(--card-border, #2a2a40); background: var(--bg, #0d0d14); color: var(--text, #fff);
}
.split-table.active { background: #8b5cf6; border-color: #8b5cf6; color: #fff; }
.btn-ghost {
  padding: 12px 18px; border-radius: 10px; cursor: pointer; text-decoration: none;
  border: 1px solid var(--card-border, #2a2a40); background: var(--bg, #0d0d14);
  color: var(--text, #fff); font-size: 14px; font-weight: 700;
}
.btn-danger {
  padding: 12px 18px; border: none; border-radius: 10px; cursor: pointer;
  background: var(--danger, #ef4444); color: #fff; font-size: 14px; font-weight: 800;
}
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

/* ─── Fiche article ─── */
.modal-overlay {
  position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(3px);
}
.modal-card {
  width: 92%; max-width: 400px; max-height: 88dvh; overflow-y: auto; padding: 20px; border-radius: 18px;
  display: flex; flex-direction: column; gap: 12px;
  background: var(--card-bg, #1a1a2e); border: 1px solid var(--card-border, #2a2a40);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
}
.modal-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.modal-title { font-size: 17px; font-weight: 800; }
.modal-close { background: none; border: none; color: var(--muted, #8a8aa0); font-size: 18px; cursor: pointer; padding: 4px; }
.modal-actions { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
.modal-price { flex: 1; font-size: 18px; font-weight: 800; color: var(--success, #10b981); }
.sheet-qty { display: flex; align-items: center; justify-content: space-between; }
.sheet-group { display: flex; flex-direction: column; gap: 6px; }
.sheet-label {
  font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #8a8aa0);
}
.sheet-opts { display: flex; flex-wrap: wrap; gap: 6px; }
.sheet-opt {
  padding: 10px 14px; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 600;
  border: 1px solid var(--card-border, #2a2a40); background: var(--bg, #0d0d14); color: var(--text, #fff);
}
.sheet-opt.active { background: var(--primary, #10b981); border-color: var(--primary, #10b981); color: #0d0d14; }
.sheet-note {
  width: 100%; padding: 10px; border-radius: 10px; resize: none; font: inherit; font-size: 14px;
  border: 1px solid var(--card-border, #2a2a40); background: var(--bg, #0d0d14); color: var(--text, #fff);
}

.btn-primary {
  padding: 12px 18px; border: none; border-radius: 10px; cursor: pointer;
  background: var(--primary, #10b981); color: #0d0d14; font-size: 14px; font-weight: 800;
}
</style>
