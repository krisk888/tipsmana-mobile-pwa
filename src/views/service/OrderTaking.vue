<template>
  <div class="ot-shell" :class="{ 'has-cart': cart.length }">
    <!-- ═══ HEADER ═══ -->
    <header class="ot-header">
      <button class="ot-back" title="Tables" @click="router.push('/service')">←</button>
      <div class="ot-header-main">
        <div class="ot-title">Table {{ tableNumber }}</div>
        <div class="ot-subtitle">
          <template v-if="ticket">👤{{ ticket.covers }} · {{ formatEur(ticket.totalTtc) }} sur la note</template>
          <template v-else>Nouvelle note · 👤{{ covers }}</template>
        </div>
      </div>
      <router-link to="/service/history" class="ot-icon-btn" title="Commandes en cours">🧾</router-link>
    </header>

    <!-- ═══ ONGLETS Carte / Note ═══ -->
    <div class="ot-tabs">
      <button class="ot-tab" :class="{ active: tab === 'menu' }" @click="tab = 'menu'">🍽 Carte</button>
      <button class="ot-tab" :class="{ active: tab === 'note' }" @click="tab = 'note'">
        🧾 Note <span v-if="ticketItemCount" class="ot-tab-count">{{ ticketItemCount }}</span>
      </button>
    </div>

    <!-- Envoi cuisine en échec : relance -->
    <div v-if="failedItems.length" class="ot-alert">
      <span>⚠️ {{ failedItems.length }} article(s) enregistré(s) mais non envoyé(s) en cuisine</span>
      <button class="ot-alert-btn" :disabled="sending" @click="retryDispatch">Renvoyer</button>
    </div>

    <!-- ═══ CARTE ═══ -->
    <template v-if="tab === 'menu'">
      <div v-if="loadingMenu" class="ot-state">
        <span class="ot-spinner"></span>
        <span>Chargement de la carte…</span>
      </div>
      <div v-else-if="menuError" class="ot-state ot-error">
        <p>⚠️ {{ menuError }}</p>
        <button class="btn-primary" @click="loadMenu">Réessayer</button>
      </div>
      <div v-else-if="!categories.length" class="ot-state">
        <span class="ot-empty-icon">📭</span>
        <p>Aucun article actif à la carte.</p>
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
              <span v-if="hasOptions(p)" class="ot-prod-hint">⚙️ options</span>
            </button>
            <button class="ot-prod-edit" title="Quantité, options, note" @click="openSheet(p)">✎</button>
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
        <p>Aucun article sur la note de cette table.</p>
      </div>
      <div v-else class="ot-note">
        <div v-for="g in ticketGroups" :key="g.key" class="ot-group">
          <div class="ot-group-title">{{ g.icon }} {{ g.label }}</div>
          <div v-for="i in g.lines" :key="i.id" class="ot-line">
            <span class="ot-line-qty">{{ i.qty }}×</span>
            <span class="ot-line-info">
              <span class="ot-line-name">{{ i.name }}</span>
              <span v-if="i.options" class="ot-line-sub">⚙️ {{ i.options }}</span>
              <span v-if="i.note" class="ot-line-sub">📝 {{ i.note }}</span>
            </span>
            <span v-if="failedIds.includes(i.id)" class="ot-line-flag">non envoyé</span>
            <span class="ot-line-price">{{ formatEur(i.qty * i.price) }}</span>
          </div>
        </div>
        <div class="ot-totals">
          <div class="ot-total-row"><span>Total HT</span><span>{{ formatEur(ticket.totalHt) }}</span></div>
          <div class="ot-total-row"><span>TVA</span><span>{{ formatEur(ticket.totalTtc - ticket.totalHt) }}</span></div>
          <div class="ot-total-row ot-total-main"><span>Total TTC</span><span>{{ formatEur(ticket.totalTtc) }}</span></div>
        </div>
      </div>
    </template>

    <!-- ═══ PANIER ═══ -->
    <div v-if="cart.length" class="ot-cart" :class="{ open: cartOpen }">
      <div class="ot-cart-header" @click="cartOpen = !cartOpen">
        <span class="ot-cart-title">🛒 Panier <span class="ot-cart-count">{{ cartCount }} art.</span></span>
        <span class="ot-cart-header-right">
          <span class="ot-cart-total">{{ formatEur(cartTotals.ttc) }}</span>
          <span class="ot-chevron" :class="{ open: cartOpen }">▾</span>
        </span>
      </div>

      <div v-if="cartOpen" class="ot-cart-body">
        <div v-for="g in cartGroups" :key="g.key" class="ot-group">
          <div class="ot-group-title">{{ g.icon }} {{ g.label }}</div>
          <div v-for="l in g.lines" :key="lineKey(l)" class="ot-line">
            <span class="ot-line-info">
              <span class="ot-line-name">{{ l.name }}</span>
              <span v-if="l.options" class="ot-line-sub">⚙️ {{ l.options }}</span>
              <span v-if="l.note" class="ot-line-sub">📝 {{ l.note }}</span>
            </span>
            <span class="ot-qty">
              <button class="ot-qty-btn" @click="changeQty(l, -1)">−</button>
              <span class="ot-qty-val">{{ l.qty }}</span>
              <button class="ot-qty-btn" @click="changeQty(l, 1)">+</button>
            </span>
            <span class="ot-line-price">{{ formatEur(l.qty * l.price) }}</span>
          </div>
        </div>

        <div class="ot-totals">
          <div class="ot-total-row"><span>Total HT</span><span>{{ formatEur(cartTotals.ht) }}</span></div>
          <div class="ot-total-row"><span>TVA</span><span>{{ formatEur(cartTotals.tva) }}</span></div>
          <div class="ot-total-row ot-total-main"><span>Total TTC</span><span>{{ formatEur(cartTotals.ttc) }}</span></div>
          <div v-if="ticket" class="ot-total-row ot-total-table">
            <span>Total table après envoi</span><span>{{ formatEur(ticket.totalTtc + cartTotals.ttc) }}</span>
          </div>
        </div>
        <button class="ot-clear" @click="clearCart">Vider le panier</button>
      </div>

      <div class="ot-cart-footer">
        <button class="ot-send" :disabled="sending" @click="send">
          <span v-if="sending" class="ot-btn-spinner"></span>
          <span v-else>📤 Envoyer en cuisine · {{ formatEur(cartTotals.ttc) }}</span>
        </button>
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
          <span class="sheet-label">Quantité</span>
          <span class="ot-qty">
            <button class="ot-qty-btn lg" :disabled="sheet.qty <= 1" @click="sheet.qty--">−</button>
            <span class="ot-qty-val lg">{{ sheet.qty }}</span>
            <button class="ot-qty-btn lg" @click="sheet.qty++">+</button>
          </span>
        </div>

        <div v-for="group in sheetGroups" :key="group.key" class="sheet-group">
          <div class="sheet-label">{{ group.label }}</div>
          <div class="sheet-opts">
            <button
              v-for="opt in group.options"
              :key="opt"
              class="sheet-opt"
              :class="{ active: sheet.options[group.key] === opt }"
              @click="toggleOption(group.key, opt)"
            >{{ opt }}</button>
          </div>
        </div>

        <div class="sheet-group">
          <label class="sheet-label" for="sheet-note">Note cuisine</label>
          <textarea
            id="sheet-note"
            v-model="sheet.note"
            class="sheet-note"
            rows="2"
            maxlength="120"
            placeholder="Sans oignons, allergie…"
          ></textarea>
        </div>

        <div class="modal-actions">
          <span class="modal-price">{{ formatEur(sheet.qty * sheet.product.price) }}</span>
          <button class="btn-primary" @click="addFromSheet">+ Ajouter</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  OPTION_GROUPS, COURSE_OPTIONS,
  addLine, setLineQty, lineKey, computeTotals, groupByCourse, formatEur,
  fetchMenu, fetchTableTicket, sendOrder, retryFailedDispatch,
  getKitchenRecord, loadDraft, saveDraft, currentEstablishmentId, toNumber,
} from '../../shared/serviceOrders'

const route = useRoute()
const router = useRouter()

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
const sheetGroups = computed(() => (sheet.value ? optionGroupsFor(sheet.value.product) : []))

watch(cart, val => saveDraft(estId, tableNumber.value, val), { deep: true })

// Changement de table sans démontage (même route, autre paramètre)
watch(tableNumber, number => {
  if (!number) return
  sheet.value = null
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
    menuError.value = e.message || 'Carte indisponible'
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
function changeQty(line, delta) {
  const idx = cart.value.findIndex(l => lineKey(l) === lineKey(line))
  if (idx !== -1) cart.value = setLineQty(cart.value, idx, cart.value[idx].qty + delta)
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
  sending.value = true
  try {
    const res = await sendOrder({
      tableNumber: tableNumber.value,
      cart: cart.value,
      covers: covers.value,
      openTable: !ticket.value,
    })
    cart.value = []
    cartOpen.value = false
    if (res.queued) {
      toast('Hors-ligne : commande mise en file, envoi à la reconnexion', 'warning')
    } else {
      ticket.value = res.ticket
      if (res.dispatched) toast(`Table ${tableNumber.value} envoyée en cuisine`)
      else toast(`Note enregistrée — envoi cuisine échoué : ${res.error}`, 'error')
    }
    refreshKitchenRec()
  } catch (e) {
    toast(e.data?.detail || e.message || 'Envoi impossible', 'error')
  } finally {
    sending.value = false
  }
}

async function retryDispatch() {
  if (!ticket.value || sending.value) return
  sending.value = true
  try {
    const res = await retryFailedDispatch(ticket.value)
    if (res.dispatched) toast('Envoyé en cuisine')
    else toast(`Envoi cuisine échoué : ${res.error}`, 'error')
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
