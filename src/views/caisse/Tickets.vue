<template>
  <div class="caisse-shell">
    <!-- ═══ HEADER — clock, user, table ═══ -->
    <header class="caisse-header">
      <div class="header-left">
        <div class="clock-date">{{ clock.date }}</div>
        <div class="clock-time">{{ clock.time }}</div>
      </div>
      <div class="header-center">
        <span class="header-brand">🧾 Caisse</span>
      </div>
      <div class="header-right">
        <span class="header-user">{{ displayName }}</span>
        <button v-if="selectedTable !== null" class="table-badge" @click="openFloorPlan">
          Table {{ selectedTable }}
          <span class="table-badge-chevron">🪑</span>
        </button>
        <button v-else class="table-badge none" @click="openFloorPlan">
          Aucune table
        </button>
      </div>
    </header>

    <!-- ═══ VUE ACCUEIL — catégories + plan/numpad ═══ -->
    <div v-if="view === 'home'" class="home-view">
      <!-- Grille catégories (2 colonnes max) -->
      <div class="cat-grid">
        <button
          v-for="cat in categories"
          :key="cat.id"
          class="cat-tile"
          :style="tileBg(cat)"
          @click="openCategory(cat)"
        >
          <span class="tile-icon">{{ cat.icon }}</span>
          <span class="tile-name">{{ cat.name }}</span>
        </button>
      </div>

      <!-- Bouton plan de salle + pavé numérique -->
      <div class="home-actions">
        <button class="floor-btn" @click="openFloorPlan">
          <span>🪑</span>
          <span class="floor-label">Plan de salle</span>
          <span v-if="occupiedCount > 0" class="floor-badge">{{ occupiedCount }}</span>
        </button>
      </div>

      <div class="numpad">
        <div class="numpad-display" :class="{ active: numpadNumber }">
          {{ numpadNumber ? numpadNumber : 'Table n°' }}
        </div>
        <div class="numpad-keys">
          <button v-for="d in ['1','2','3','4','5','6','7','8','9']" :key="d" class="np-key" @click="numpadPress(d)">{{ d }}</button>
          <button class="np-key" @click="numpadClear">⌫</button>
          <button class="np-key" @click="numpadPress('0')">0</button>
          <button class="np-key np-ok" @click="numpadOpen">✔ Ouvrir</button>
        </div>
      </div>
    </div>

    <!-- ═══ VUE CATALOGUE — produits de la catégorie ═══ -->
    <div v-else-if="view === 'catalog'" class="catalog-view">
      <div class="catalog-header">
        <button class="back-btn" @click="view = 'home'">← Menus</button>
        <span class="catalog-title">{{ activeCat?.icon }} {{ activeCat?.name }}</span>
        <span class="catalog-spacer"></span>
      </div>

      <div class="prod-grid">
        <button
          v-for="prod in filteredProducts"
          :key="prod.id"
          class="prod-btn"
          @click="pickProduct(prod)"
        >
          <span class="prod-name">{{ prod.name || prod.label }}</span>
          <span class="prod-price">{{ formatEur(prodPrice(prod)) }}</span>
          <span v-if="hasOptions(prod)" class="prod-opt-hint">⚙️ options</span>
        </button>
        <div v-if="!filteredProducts.length" class="empty-state">Aucun article</div>
      </div>
    </div>

    <!-- ═══ CART — composant compact flottant ═══ -->
    <CaisseCart
      :cart="cart"
      :cart-total="cartTotal"
      :course-mode="true"
      :current-course="currentCourse"
      :sealed-courses="sealedCourses"
      :courses="courses"
      :table="selectedTable"
      :paying="paying"
      :ticket-sent="ticketSent"
      @à-suivre="nextCourse"
      @envoi="sendToKitchen"
      @réclamer="openReclaim"
      @addition="openAddition"
      @solder="openPayment"
      @increment="incrementQty"
      @decrement="decrementQty"
      @remove="removeItem"
    />

    <!-- ═══════════ MODALS ═══════════ -->

    <!-- MODAL COUVERTS -->
    <div v-if="coversModal" class="modal-overlay" @click.self="coversModal = null">
      <div class="modal-card">
        <div class="modal-title">👥 Table {{ coversModal.table }}</div>
        <p class="modal-text">Nombre de couverts</p>
        <div class="covers-display">{{ coversInput || '—' }}</div>
        <div class="covers-keys">
          <button v-for="d in ['1','2','3','4','5','6','7','8','9']" :key="d" class="np-key" @click="coversInput = (coversInput + d).slice(0,2)">{{ d }}</button>
          <button class="np-key" @click="coversInput = ''">⌫</button>
          <button class="np-key" @click="coversInput = (coversInput + '0').slice(0,2)">0</button>
          <button class="np-key np-ok" @click="confirmCovers">✔ OK</button>
        </div>
        <div class="modal-actions">
          <button class="btn-ghost" @click="coversModal = null">Annuler</button>
          <button class="btn-primary" @click="confirmCovers">Ouvrir</button>
        </div>
      </div>
    </div>

    <!-- MODAL OPTIONS (cuisson / garniture) -->
    <div v-if="optionModal" class="modal-overlay" @click.self="optionModal = null">
      <div class="modal-card">
        <div class="modal-header">
          <span class="modal-title">{{ optionModal.name }}</span>
          <button class="modal-close" @click="optionModal = null">✕</button>
        </div>
        <div v-for="group in optionModal.groups" :key="group.key" class="opt-group">
          <div class="opt-group-title">{{ group.label }}</div>
          <div class="opt-list">
            <button
              v-for="opt in group.options"
              :key="opt"
              class="opt-btn"
              :class="{ active: selectedOptions[group.key] === opt }"
              @click="selectedOptions[group.key] = opt"
            >{{ opt }}</button>
          </div>
        </div>
        <div class="modal-actions">
          <span class="modal-price">{{ formatEur(optionModal.price) }}</span>
          <button class="btn-primary" @click="addWithOptions">+ Ajouter</button>
        </div>
      </div>
    </div>

    <!-- MODAL RÉCLAMER -->
    <div v-if="reclaimModal" class="modal-overlay" @click.self="reclaimModal = false">
      <div class="modal-card modal-sm">
        <div class="modal-title">🔔 Réclamer</div>
        <p class="modal-text">
          {{ reclaimModal.table ? `La table ${reclaimModal.table} réclame des articles déjà envoyés.` : 'Réclamer des articles déjà envoyés.' }}
        </p>
        <div class="modal-actions">
          <button class="btn-ghost" @click="reclaimModal = false">Fermer</button>
          <button class="btn-danger" @click="confirmReclaim">Réclamer à la cuisine</button>
        </div>
      </div>
    </div>

    <!-- MODAL ADDITION PROVISOIRE -->
    <div v-if="additionModal" class="modal-overlay" @click.self="additionModal = false">
      <div class="modal-card">
        <div class="modal-title">🧾 Addition provisoire</div>
        <div class="addition-lines">
          <div v-for="(item, i) in cart" :key="i" class="addition-line">
            <span>{{ item.name }} <em v-if="item.options">({{ item.options }})</em> × {{ item.qty }}</span>
            <span>{{ formatEur(item.qty * item.price) }}</span>
          </div>
        </div>
        <div class="addition-totals">
          <div class="addition-row"><span>Total HT</span><span>{{ formatEur(cartTotalHt) }}</span></div>
          <div class="addition-row"><span>TVA ({{ tvaRate }}%)</span><span>{{ formatEur(cartTotal - cartTotalHt) }}</span></div>
          <div class="addition-row addition-total"><span>Total TTC</span><span>{{ formatEur(cartTotal) }}</span></div>
        </div>
        <div class="modal-actions">
          <button class="btn-ghost" @click="additionModal = false">Fermer</button>
        </div>
      </div>
    </div>

    <!-- MODAL SOLDER (paiement) -->
    <div v-if="paymentModal" class="modal-overlay" @click.self="paymentModal = false">
      <div class="modal-card">
        <div class="modal-title">💶 Solder la table</div>
        <p v-if="selectedTable !== null" class="modal-text">Table {{ selectedTable }} · {{ cart.length }} article(s)</p>
        <div class="modal-total">{{ formatEur(cartTotal) }}</div>
        <div class="pay-methods">
          <button
            v-for="m in paymentMethods"
            :key="m.key"
            class="pay-btn"
            :class="'pay-' + m.key"
            @click="pay(m.key)"
            :disabled="paying"
          >
            <span class="pay-icon">{{ m.icon }}</span>
            <span class="pay-label">{{ m.label }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL PLAN DE SALLE -->
    <div v-if="floorModal" class="modal-overlay" @click.self="floorModal = false">
      <div class="modal-card floor-card">
        <div class="floor-header">
          <div class="floor-title">🪑 Tables
            <span class="floor-count" v-if="occupiedCount">({{ occupiedCount }})</span>
          </div>
          <div class="floor-header-actions">
            <button class="floor-view-toggle" @click="toggleFloorView">{{ floorView === 'plan' ? '📋' : '🗺' }}</button>
            <button class="modal-close" @click="floorModal = false">✕</button>
          </div>
        </div>

        <!-- Onglets espaces -->
        <div v-if="floorAreas.length > 1" class="floor-tabs">
          <button
            v-for="a in floorAreas"
            :key="a.id"
            class="floor-tab"
            :class="{ active: activeArea === a.id }"
            @click="activeArea = a.id"
          >{{ a.icon }} {{ a.name }}</button>
        </div>

        <!-- Vue plan -->
        <template v-if="floorView === 'plan'">
          <div class="floor-visual" v-if="activeAreaTables.length">
            <div class="floor-canvas">
              <div
                v-for="t in activeAreaTables"
                :key="t.number"
                class="floor-table-viz"
                :class="[t.shape || 'round', t.size || 'medium', 'state-' + (t.state || 'libre')]"
                :style="tablePosStyle(t)"
                @click="tapTableInFloor(t)"
              >
                <span class="ft-num">{{ t.number }}</span>
                <span v-if="t.state !== 'libre'" class="ft-total">{{ formatEur(t.total) }}</span>
              </div>
            </div>
          </div>
          <div v-else class="floor-empty">Aucune table — configurez le plan sur la caisse.</div>
          <div class="floor-legend">
            <span><span class="lgd lgd-libre"></span> Libre</span>
            <span><span class="lgd lgd-occupee"></span> En cours</span>
            <span><span class="lgd lgd-addition"></span> Addition</span>
          </div>
        </template>

        <!-- Vue liste -->
        <template v-else>
          <div class="floor-list" v-if="allOccupiedTables.length">
            <div
              v-for="t in allOccupiedTables"
              :key="t.number"
              class="floor-row"
              :class="'state-' + t.state"
              @click="tapTableInFloor(t)"
            >
              <span class="floor-row-num">Table {{ t.number }}</span>
              <span class="floor-row-covers" v-if="t.covers">👤{{ t.covers }}</span>
              <span class="floor-row-state">{{ t.state === 'occupée' ? 'En cours' : 'Addition' }}</span>
              <span class="floor-row-total">{{ formatEur(t.total) }}</span>
            </div>
          </div>
          <div v-else class="floor-empty">Aucune table occupée</div>
          <div class="floor-legend">
            <span><span class="lgd lgd-occupee"></span> En cours</span>
            <span><span class="lgd lgd-addition"></span> Addition</span>
          </div>
        </template>
      </div>
    </div>

    <!-- MODAL CONFIRMATION PAIEMENT -->
    <div v-if="paymentResult" class="modal-overlay" @click.self="finishPayment">
      <div class="modal-card modal-confirm">
        <div class="confirm-icon">{{ paymentResult.icon }}</div>
        <div class="confirm-title">{{ paymentResult.title }}</div>
        <p class="modal-text">{{ paymentResult.message }}</p>
        <div class="confirm-total">{{ formatEur(cartTotal) }}</div>
        <button class="btn-primary" @click="finishPayment">Nouvelle vente</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import api from '../../shared/api'
import { auth, getEstablishmentId } from '../../shared/auth'
import CaisseCart from './CaisseCart.vue'

/* ─── Defaults ─── */
const DEFAULT_COURSES = [
  { key: 'entree',  label: 'Entrée',  courseType: 'chaud', order: 0 },
  { key: 'plat',    label: 'Plat',    courseType: 'chaud', order: 1 },
  { key: 'dessert', label: 'Dessert', courseType: 'froid', order: 2 },
]

const DEFAULT_PAYMENT_METHODS = [
  { key: 'cash',         label: 'Espèces',      icon: '💶' },
  { key: 'card',         label: 'Carte bleue',  icon: '💳' },
  { key: 'ticket_resto', label: 'Ticket resto', icon: '🎟️' },
  { key: 'amex',         label: 'AMEX',         icon: '🅰️' },
]

/* Mapping icônes backend → emoji PWA (surcharge pour les codes connus) */
const PAYMENT_ICON_MAP = {
  cash: '💶',
  card: '💳',
  nfc: '📱',
  ticket_resto: '🎟️',
  amex: '🅰️',
  voucher: '🎁',
  online: '🌐',
}

const DEFAULT_CATEGORIES = [
  { id: 'entrees',     name: 'Entrées',     icon: '🥗', color: '#34d399' },
  { id: 'plats',       name: 'Plat',        icon: '🍽', color: '#fbbf24' },
  { id: 'suggestions', name: 'Suggestions', icon: '✨', color: '#fb7185' },
  { id: 'snack',       name: 'Snack',       icon: '🍔', color: '#fb923c' },
  { id: 'desserts',    name: 'Dessert',     icon: '🍰', color: '#f472b6' },
  { id: 'eaux',        name: 'Eaux',        icon: '💧', color: '#38bdf8' },
  { id: 'soft',        name: 'Soft',        icon: '🥤', color: '#22d3ee' },
  { id: 'bieres',      name: 'Bière',       icon: '🍺', color: '#facc15' },
  { id: 'brunch',      name: 'Brunch',      icon: '🥞', color: '#a78bfa' },
  { id: 'vins',        name: 'Vins',        icon: '🍷', color: '#f87171' },
  { id: 'champagnes',  name: 'Champagne',   icon: '🥂', color: '#fde68a' },
  { id: 'cocktails',   name: 'Cocktails',   icon: '🍸', color: '#2dd4bf' },
]

const DEFAULT_OPTION_GROUPS = {
  cuisson:   { key: 'cuisson',   label: 'Cuisson',    options: ['Saignant', 'À point', 'Bien cuit'] },
  garniture: { key: 'garniture', label: 'Garniture',  options: ['Frites', 'Riz', 'Légumes', 'Salade'] },
  taille:    { key: 'taille',    label: 'Taille',     options: ['Petit', 'Normal', 'Grand'] },
}

const DEFAULT_CATEGORY_OPTIONS = {
  plats:       ['cuisson', 'garniture'],
  suggestions: ['cuisson'],
  entrees:     ['garniture'],
  brunch:      ['cuisson', 'garniture'],
  desserts:    ['taille'],
  snack:       ['taille'],
}

/* ═══ State ═══ */

/* Config */
const courses = ref([...DEFAULT_COURSES])
const paymentMethods = ref([...DEFAULT_PAYMENT_METHODS])
const categories = ref([...DEFAULT_CATEGORIES])
const optionGroups = ref({ ...DEFAULT_OPTION_GROUPS })
const categoryOptions = ref({ ...DEFAULT_CATEGORY_OPTIONS })
const floorAreas = ref([
  { id: 'salle', name: 'SALLE', icon: '🪑',
    tables: [
      { number: 1, x: 20, y: 80 }, { number: 2, x: 40, y: 80 }, { number: 3, x: 60, y: 80 }, { number: 4, x: 80, y: 80 },
      { number: 5, x: 20, y: 55 }, { number: 6, x: 40, y: 55 }, { number: 7, x: 60, y: 55 }, { number: 8, x: 80, y: 55 },
      { number: 9, x: 30, y: 30 }, { number: 10, x: 60, y: 30 }, { number: 11, x: 10, y: 85 }, { number: 12, x: 90, y: 85 },
      { number: 13, x: 15, y: 5 }, { number: 14, x: 45, y: 5 }, { number: 15, x: 75, y: 5 },
    ]
  },
])
const tvaRate = ref(10)
const coversEnabled = ref(true)
const tableCovers = ref({})

/* Navigation */
const view = ref('home') // 'home' | 'catalog'
const products = ref([])
const activeCatId = ref(null)
const activeCat = computed(() => categories.value.find(c => c.id === activeCatId.value) || null)

/* Panier / Table */
const cart = ref([])
const selectedTable = ref(null)
const tableStates = ref({})
const tableTotals = ref({})
const tableServer = ref({})
const cartsByTable = ref({})
const ticketSent = ref(false)
const paying = ref(false)

/* Courses / Services */
const currentCourseIdx = ref(0)
const currentCourse = computed(() => courses.value[currentCourseIdx.value]?.key || 'entree')
const sealedCourses = ref(new Set())

/* Numpad */
const numpadNumber = ref('')

/* Modals */
const coversModal = ref(null)
const coversInput = ref('')
const optionModal = ref(null)
const selectedOptions = ref({})
const reclaimModal = ref(false)
const additionModal = ref(false)
const paymentModal = ref(false)
const paymentResult = ref(null)
const floorModal = ref(false)
const floorView = ref('plan')
const activeArea = ref(floorAreas.value[0].id)

/* ═══ Computed ═══ */

const cartTotal = computed(() => cart.value.reduce((s, i) => s + i.qty * i.price, 0))
const cartTotalHt = computed(() => cartTotal.value / (1 + tvaRate.value / 100))

const allOccupiedTables = computed(() => {
  const res = []
  for (const [num, state] of Object.entries(tableStates.value)) {
    if (state !== 'libre') {
      res.push({
        number: parseInt(num),
        state,
        covers: tableCovers.value[num] || 1,
        total: tableTotals.value[num] || 0,
      })
    }
  }
  res.sort((a, b) => a.number - b.number)
  return res
})

const occupiedCount = computed(() => allOccupiedTables.value.length)

const activeAreaTables = computed(() => {
  const area = floorAreas.value.find(a => a.id === activeArea.value)
  const tables = (area && Array.isArray(area.tables)) ? area.tables : []
  return tables.map(t => {
    const num = Number(t.number)
    return {
      number: num,
      x: t.x || 50,
      y: t.y || 50,
      shape: t.shape || 'round',
      size: t.size || 'medium',
      state: tableStates.value[num] || 'libre',
      total: tableTotals.value[num] || 0,
      covers: tableCovers.value[num] || 1,
    }
  })
})

const filteredProducts = computed(() => {
  if (!activeCatId.value) return products.value
  return products.value.filter(p =>
    (p.category_id === activeCatId.value) || (p.section === activeCatId.value) ||
    (p.cat_id === activeCatId.value)
  )
})

const displayName = computed(() =>
  auth.user?.first_name || auth.user?.name || auth.user?.username || auth.user?.email || 'Vendeur'
)

/* ═══ Horloge ═══ */
const clock = ref({ date: '', time: '' })
let clockTimer = null
function updateClock() {
  const now = new Date()
  const days = ['DIM','LUN','MAR','MER','JEU','VEN','SAM']
  const d = `${days[now.getDay()]} ${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`
  clock.value = { date: d, time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}` }
}

/* ═══ Chargement config Backend ═══ */
const POS_CONFIG_KEY = 'pos_config'

async function loadPosConfig() {
  try {
    const res = await api.get(`/general-settings/${POS_CONFIG_KEY}`)
    const raw = res?.data
    const val = typeof raw === 'string' ? raw : (raw?.data?.value ?? raw?.value ?? raw?.data)
    if (!val) return
    const cfg = typeof val === 'string' ? JSON.parse(val) : val
    if (Array.isArray(cfg.courses) && cfg.courses.length) courses.value = cfg.courses
    if (Array.isArray(cfg.paymentMethods) && cfg.paymentMethods.length) paymentMethods.value = cfg.paymentMethods
    if (Array.isArray(cfg.categories) && cfg.categories.length) categories.value = cfg.categories
    if (cfg.optionGroups) optionGroups.value = { ...DEFAULT_OPTION_GROUPS, ...cfg.optionGroups }
    if (cfg.categoryOptions) categoryOptions.value = { ...DEFAULT_CATEGORY_OPTIONS, ...cfg.categoryOptions }
    if (Array.isArray(cfg.floorAreas) && cfg.floorAreas.length) floorAreas.value = cfg.floorAreas
    if (typeof cfg.tvaRate === 'number') tvaRate.value = cfg.tvaRate
    if (typeof cfg.coversEnabled === 'boolean') coversEnabled.value = cfg.coversEnabled
  } catch (e) {
    // 404 → default config
  }
}

/* ═══ Chargement méthodes de paiement depuis le backend ═══ */
async function fetchPaymentMethods() {
  try {
    const estId = getEstablishmentId()
    if (!estId) return
    const res = await api.get(`/settings/payment-methods?establishment_id=${estId}`)
    const list = res?.data?.data ?? res?.data ?? []
    if (!Array.isArray(list) || !list.length) return
    const mapped = list
      .filter(m => m.is_active !== false)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(m => ({
        key: m.method_code,
        label: m.method_name || m.method_code,
        icon: PAYMENT_ICON_MAP[m.method_code] || m.icon || '💳',
        active: true,
      }))
    if (mapped.length) paymentMethods.value = mapped
  } catch (e) {
    // Backend indisponible → conserver la config locale (défauts ou pos_config)
  }
}

/* ═══ Chargement Menu ═══
   Le backend renvoie {success, data: {kitchen: [...], dining_room: [...]}}
   ou un tableau direct selon la route. On normalise les 3 formes. */
function normalizeSectionData(obj) {
  if (Array.isArray(obj)) return obj
  if (obj?.kitchen || obj?.dining_room || obj?.kitchen_dining_room) {
    return [...(obj.kitchen || []), ...(obj.dining_room || []), ...(obj.kitchen_dining_room || [])]
  }
  if (Array.isArray(obj?.data)) return obj.data
  return null
}

async function loadMenu() {
  try {
    const res = await api.get('/products/categories/tree')
    // res = {success, message, data} depuis _handleResponse
    const body = res?.data || res
    // body peut être : {kitchen:[], dining_room:[]} | tableau direct | {categories:[], products:[]}
    if (!Array.isArray(body) && body?.categories && body?.products) {
      const cats = normalizeSectionData(body.categories) || []
      const prods = normalizeSectionData(body.products) || []
      if (cats.length) categories.value = cats
      if (prods.length) products.value = prods
      return
    }
    // {kitchen:[], dining_room:[]} ou tableau direct — essayer de détecter un arbre
    // catégorie → produits (champ products sur chaque catégorie)
    const cats = normalizeSectionData(body)
    if (cats && cats.length) {
      const allProds = []
      for (const cat of cats) {
        if (Array.isArray(cat.products)) {
          cat.products.forEach(p => { allProds.push({ ...p, category_id: p.category_id || cat.id }) })
        }
      }
      if (allProds.length) products.value = allProds
      categories.value = cats.filter(c => c.active !== false)
      return
    }
    // Fallback: les vraies routes legacy (section_grouped inclus)
    const catRes = await api.get('/products/categories?per_page=50&is_active=true')
    const catBody = catRes?.data || catRes
    const catData = normalizeSectionData(catBody?.data ?? catBody)
    if (catData && catData.length) categories.value = catData
    const prodRes = await api.get('/products?per_page=200&is_active=true')
    const prodBody = prodRes?.data || prodRes
    const prodData = normalizeSectionData(prodBody?.data ?? prodBody)
    if (prodData && prodData.length) {
      products.value = [...new Map(prodData.map(p => [p.id, p])).values()]
    }
  } catch (e) {
    console.warn('[Caisse] Menu load error:', e.message)
    // Keep default categories, no products yet
  }
}

/* ═══ Catégories — style tuile ═══ */
function tileBg(cat) {
  const c = cat.color || '#475569'
  return { background: `linear-gradient(135deg, ${c}88, ${c}cc)` }
}

/* ═══ Produits ═══ */
function prodPrice(p) {
  return Number(p.price_ttc || p.unit_price_ttc || p.price || 0)
}

function hasOptions(prod) {
  const catId = prod.category_id || prod.section || prod.cat_id
  const keys = categoryOptions.value[catId] || []
  return keys.length > 0
}

/* ═══ Panier ═══ */
function addToCart(prod, optionsText) {
  const course = currentCourse.value
  const existing = cart.value.find(i =>
    i.id === prod.id && i.course === course && (i.options || null) === (optionsText || null)
  )
  if (existing) {
    existing.qty++
  } else {
    cart.value.push({
      id: prod.id,
      name: prod.name || prod.label,
      price: prodPrice(prod),
      qty: 1,
      options: optionsText || null,
      course,
    })
  }
  syncTableTotal()
}

function incrementQty(i) { cart.value[i].qty++; syncTableTotal() }
function decrementQty(i) { if (cart.value[i].qty > 1) cart.value[i].qty--; syncTableTotal() }
function removeItem(i) { cart.value.splice(i, 1); sealedCourses.value = new Set(); syncTableTotal() }

function syncTableTotal() {
  if (selectedTable.value !== null) {
    tableTotals.value[selectedTable.value] = cartTotal.value
  }
}

function pickProduct(prod) {
  if (!hasOptions(prod)) {
    addToCart(prod, null)
    return
  }
  const catId = prod.category_id || prod.section || prod.cat_id
  const keys = categoryOptions.value[catId] || []
  const groups = keys.map(k => optionGroups.value[k]).filter(Boolean)
  selectedOptions.value = {}
  optionModal.value = { ...prod, groups, price: prodPrice(prod) }
}

function addWithOptions() {
  const prod = optionModal.value
  const opts = Object.entries(selectedOptions.value)
    .filter(([, v]) => v)
    .map(([, v]) => v)
  addToCart(prod, opts.length ? opts.join(' + ') : null)
  optionModal.value = null
}

/* ═══ Navigation catégories ═══ */
function openCategory(cat) {
  activeCatId.value = cat.id
  view.value = 'catalog'
}

/* ═══ Plan de salle ═══ */
function openFloorPlan() {
  floorView.value = 'plan'
  floorModal.value = true
}

function toggleFloorView() {
  floorView.value = floorView.value === 'plan' ? 'liste' : 'plan'
}

function tablePosStyle(t) {
  return {
    left: `${Math.max(2, Math.min(95, t.x || 50))}%`,
    top: `${Math.max(2, Math.min(95, t.y || 50))}%`,
  }
}

function tapTableInFloor(table) {
  floorModal.value = false
  tapTable(table)
}

/* ═══ Ouverture / sélection table ═══ */
function tapTable(table) {
  if (table.state === 'libre') {
    if (coversEnabled.value) {
      coversModal.value = { table: table.number }
      coversInput.value = '1'
    } else {
      openTable(table.number, null)
    }
  } else {
    selectTable(table.number)
  }
}

function openTable(n, covers) {
  if (tableStates.value[n] && tableStates.value[n] !== 'libre') {
    selectTable(n)
    return
  }
  tableStates.value[n] = 'occupée'
  tableCovers.value[n] = covers || 1
  tableServer.value[n] = displayName.value
  selectedTable.value = n
  cart.value = []
  sealedCourses.value = new Set()
  currentCourseIdx.value = 0
  ticketSent.value = false
  numpadNumber.value = ''
  coversModal.value = null
  coversInput.value = ''
  view.value = 'home'
}

function selectTable(n) {
  selectedTable.value = n
  const saved = cartsByTable.value[n] || []
  cart.value = saved.map(i => ({ ...i }))
  sealedCourses.value = new Set(cart.value.filter(i => i.sent).map(i => i.course).filter(Boolean))
  ticketSent.value = cart.value.some(i => i.sent)
  const firstUnsaved = courses.value.findIndex(c => !sealedCourses.value.has(c.key))
  currentCourseIdx.value = firstUnsaved >= 0 ? firstUnsaved : Math.max(0, courses.value.length - 1)
  view.value = 'home'
}

/* ─── Numpad ─── */
function numpadPress(d) {
  if (numpadNumber.value.length < 3) numpadNumber.value += String(d)
}
function numpadClear() { numpadNumber.value = '' }
function numpadOpen() {
  const n = parseInt(numpadNumber.value, 10)
  if (!n || n <= 0) return
  if (coversEnabled.value) {
    coversModal.value = { table: n }
    coversInput.value = '1'
  } else {
    openTable(n, null)
  }
}
function confirmCovers() {
  const n = coversModal.value?.table
  if (!n) return
  const c = parseInt(coversInput.value, 10)
  openTable(n, (c && c > 0) ? c : 1)
}

/* ═══ Flux À SUIVRE ═══ */
function nextCourse() {
  const cur = courses.value[currentCourseIdx.value]
  if (cur) sealedCourses.value.add(cur.key)
  // Dispatch current course to kitchen
  dispatchCurrentCourse()
  if (currentCourseIdx.value < courses.value.length - 1) {
    currentCourseIdx.value++
  }
}

async function dispatchCurrentCourse() {
  const courseKey = currentCourse.value
  const items = cart.value.filter(i => i.course === courseKey && !i.sent)
  if (!items.length) return
  try {
    await api.post('/cash/dispatch', {
      establishment_id: getEstablishmentId(),
      table: selectedTable.value,
      courses: items.map(item => ({
        product_id: item.id,
        qty: item.qty,
        course_number: courseKey,
      })),
      routing: { [courseKey]: 'cuisine' },
      default_station: 'cuisine',
      notes: { [courseKey]: `Service ${courses.value.find(c => c.key === courseKey)?.label || courseKey}` },
    })
    items.forEach(item => { item.sent = true })
    ticketSent.value = true
    saveCartForTable()
  } catch (e) {
    console.warn('[Caisse] dispatch échoué:', e.message || e)
  }
}

/* ═══ Envoi final (ENVOI) ═══ */
async function sendToKitchen() {
  if (cart.value.length === 0) return
  paying.value = true
  try {
    // Envoi du dernier service
    const cur = courses.value[currentCourseIdx.value]
    if (cur && !sealedCourses.value.has(cur.key)) {
      sealedCourses.value.add(cur.key)
      const remaining = cart.value.filter(i => i.course === cur.key && !i.sent)
      if (remaining.length) {
        await api.post('/cash/dispatch', {
          establishment_id: getEstablishmentId(),
          table: selectedTable.value,
          courses: remaining.map(item => ({
            product_id: item.id,
            qty: item.qty,
            course_number: cur.key,
          })),
          routing: { [cur.key]: 'cuisine' },
          default_station: 'cuisine',
          notes: { [cur.key]: `Service ${cur.label}` },
        })
      }
    }
    // Marquer tous les articles comme envoyés
    cart.value.forEach(item => { item.sent = true })
    ticketSent.value = true
    saveCartForTable()
    view.value = 'home'
  } catch (e) {
    paymentResult.value = {
      icon: '❌',
      title: 'Erreur d’envoi',
      message: e.data?.message || e.message || "Impossible d'envoyer en cuisine",
    }
  } finally {
    paying.value = false
  }
}

/* ═══ Sauvegarde panier par table ═══ */
function saveCartForTable() {
  if (selectedTable.value === null) return
  cartsByTable.value[selectedTable.value] = cart.value.map(i => ({ ...i }))
  tableTotals.value[selectedTable.value] = cartTotal.value
}

/* ═══ Réclamer / Addition / Solder ═══ */
function openReclaim() { reclaimModal.value = { table: selectedTable.value } }
function confirmReclaim() {
  reclaimModal.value = false
  paymentResult.value = {
    icon: '🔔',
    title: 'Réclamation envoyée',
    message: selectedTable.value ? `La cuisine a reçu la demande pour la table ${selectedTable.value}.` : 'La cuisine a reçu la demande.',
  }
}

function openAddition() {
  additionModal.value = true
  if (selectedTable.value !== null) tableStates.value[selectedTable.value] = 'addition'
}

function openPayment() {
  paymentModal.value = true
  if (selectedTable.value !== null) tableStates.value[selectedTable.value] = 'addition'
}

async function pay(method) {
  if (cart.value.length === 0) return
  paying.value = true
  // Simulate payment — in real env this would call the API
  const meta = paymentMethods.value.find(m => m.key === method) || { label: method, icon: '💳' }
  paymentResult.value = {
    icon: method === 'cash' ? '💶' : meta.icon,
    title: `Paiement ${meta.label}`,
    message: method === 'cash'
      ? 'Rendu monnaie sur ' + formatEur(cartTotal.value)
      : 'Paiement accepté',
  }
  paymentModal.value = false
  if (selectedTable.value !== null) {
    tableStates.value[selectedTable.value] = 'libre'
    tableTotals.value[selectedTable.value] = 0
    cartsByTable.value[selectedTable.value] = []
  }
  paying.value = false
}

function finishPayment() {
  paymentResult.value = null
  cart.value = []
  sealedCourses.value = new Set()
  currentCourseIdx.value = 0
  ticketSent.value = false
  selectedTable.value = null
}

/* ═══ Utils ═══ */
function formatEur(v) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0)
}

/* ═══ Lifecycle ═══ */
onMounted(() => {
  loadPosConfig()
  loadMenu()
  fetchPaymentMethods()
  updateClock()
  clockTimer = setInterval(updateClock, 1000)
})
onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<style scoped>
/* ─── Shell ─── */
.caisse-shell {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--bg, #0d0d14);
  color: var(--text, #fff);
  padding-bottom: calc(140px + env(safe-area-inset-bottom));
  font-family: system-ui, -apple-system, sans-serif;
}

/* ─── Header ─── */
.caisse-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: var(--nav-bg, #15152a);
  border-bottom: 1px solid var(--card-border, #2a2a40);
  position: sticky;
  top: 0;
  z-index: 50;
}

.header-left { min-width: 0; }
.clock-date { font-size: 10px; color: var(--muted, #8a8aa0); }
.clock-time { font-size: 16px; font-weight: 800; letter-spacing: 0.5px; }

.header-center { text-align: center; }
.header-brand { font-size: 15px; font-weight: 800; }

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.header-user { font-size: 12px; font-weight: 700; color: var(--primary, #10b981); }

.table-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(16, 185, 129, 0.15);
  color: var(--success, #10b981);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.table-badge.none {
  background: rgba(250, 204, 21, 0.12);
  color: #facc15;
  border-color: rgba(250, 204, 21, 0.25);
}

/* ─── Home view ─── */
.home-view {
  flex: 1;
  padding: 10px 10px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

/* Catégories — grille 2 colonnes */
.cat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.cat-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  padding: 18px 8px;
  min-height: 88px;
  color: #fff;
  font-weight: 800;
  text-shadow: 0 1px 3px rgba(0,0,0,0.3);
  box-shadow: 0 3px 10px rgba(0,0,0,0.3);
  transition: transform 0.12s;
}

.cat-tile:active { transform: scale(0.95); }
.tile-icon { font-size: 28px; line-height: 1; }
.tile-name { font-size: 13px; text-align: center; line-height: 1.15; letter-spacing: 0.3px; }

/* Plan de salle + numpad */
.home-actions { margin-top: 4px; }

.floor-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 14px;
  background: var(--card-bg, #1a1a2e);
  border: 1px solid var(--card-border, #2a2a40);
  border-radius: 14px;
  cursor: pointer;
  color: var(--text, #fff);
  font-size: 14px;
  font-weight: 700;
  transition: transform 0.1s;
}

.floor-btn:active { transform: scale(0.97); }
.floor-label { flex: 1; text-align: left; }
.floor-badge {
  background: var(--primary, #10b981);
  color: #0d0d14;
  font-size: 12px;
  font-weight: 800;
  border-radius: 999px;
  padding: 2px 10px;
}

/* Numpad */
.numpad {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--card-bg, #1a1a2e);
  border: 1px solid var(--card-border, #2a2a40);
  border-radius: 14px;
  padding: 10px;
  margin-bottom: 8px;
}

.numpad-display {
  text-align: center;
  font-size: 18px;
  font-weight: 800;
  padding: 6px;
  border-radius: 10px;
  background: #0a0a12;
  color: var(--muted, #6a6a80);
}

.numpad-display.active { color: var(--text, #fff); border: 1px solid var(--primary, #10b981); }

.numpad-keys {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
}

.np-key {
  padding: 12px 4px;
  border-radius: 10px;
  border: 1px solid var(--card-border, #2a2a40);
  background: var(--card-bg, #1a1a2e);
  color: var(--text, #fff);
  font-size: 20px;
  font-weight: 700;
  cursor: pointer;
  text-align: center;
  line-height: 1;
}

.np-key:active { background: #2a2a40; }
.np-ok { background: var(--primary, #10b981); color: #0d0d14; border-color: var(--primary, #10b981); }

/* ─── Catalogue ─── */
.catalog-view {
  flex: 1;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.catalog-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.back-btn {
  background: var(--card-bg, #1a1a2e);
  border: 1px solid var(--card-border, #2a2a40);
  color: var(--text, #fff);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.catalog-title {
  font-size: 16px;
  font-weight: 800;
  flex: 1;
  text-align: center;
}

.catalog-spacer { width: 50px;
}

.prod-grid {
  display: grid;
grid-template-columns: 1fr 1fr;
gap: 8px;
}

.prod-btn {
display: flex;
flex-direction: column;
align-items: center;
gap: 6px;
padding: 16px 10px;
background: var(--card-bg, #1a1a2e);
border: 1px solid var(--card-border, #2a2a40);
border-radius: 14px;
color: var(--text, #fff);
cursor: pointer;
transition: border-color 0.15s, transform 0.1s;
}

.prod-btn:active { border-color: var(--primary, #10b981); transform: scale(0.95); }
.prod-name { font-size: 13px; font-weight: 700; text-align: center; }
.prod-price { font-size: 16px; font-weight: 800; color: var(--success, #10b981); }
.prod-opt-hint { font-size: 10px; background: rgba(16,185,129,0.15); color: var(--success, #10b981); padding: 2px 8px; border-radius: 6px; }
.empty-state { grid-column: 1 / -1; text-align: center; padding: 30px; color: var(--muted, #8a8aa0); font-size: 14px; }

/* ─── Modals ─── */
.modal-overlay {
position: fixed;
inset: 0;
background: rgba(0,0,0,0.6);
backdrop-filter: blur(3px);
display: flex;
align-items: center;
justify-content: center;
z-index: 300;
}

.modal-card {
background: var(--card-bg, #1a1a2e);
border: 1px solid var(--card-border, #2a2a40);
border-radius: 18px;
padding: 20px;
max-width: 400px;
width: 92%;
box-shadow: 0 8px 40px rgba(0,0,0,0.6);
display: flex;
flex-direction: column;
gap: 10px;
}

.modal-card.modal-sm { max-width: 300px; }
.modal-header { display: flex; align-items: center; justify-content: space-between; }
.modal-title { font-size: 17px; font-weight: 800; }
.modal-close { background: none; border: none; color: var(--muted, #8a8aa0); font-size: 18px; cursor: pointer; padding: 4px; }
.modal-text { font-size: 13px; color: var(--muted, #8a8aa0); margin: 0; }
.modal-total { font-size: 28px; font-weight: 800; color: var(--success, #10b981); text-align: center; }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }
.modal-price { font-size: 17px; font-weight: 800; color: var(--success, #10b981); flex: 1; }

.modal-confirm { align-items: center; text-align: center; }

.confirm-icon { font-size: 48px; }
.confirm-title { font-size: 18px; font-weight: 800; }
.confirm-total { font-size: 26px; font-weight: 800; color: var(--success, #10b981); }

.btn-primary {
padding: 12px 20px;
border: none;
border-radius: 10px;
background: var(--primary, #10b981);
color: #0d0d14;
font-size: 14px;
font-weight: 800;
cursor: pointer;
}

.btn-ghost {
padding: 12px 20px;
border: 1px solid var(--card-border, #2a2a40);
border-radius: 10px;
background: var(--bg, #0d0d14);
color: var(--text, #fff);
font-size: 14px;
font-weight: 700;
cursor: pointer;
}

.btn-danger {
padding: 12px 20px;
border: none;
border-radius: 10px;
background: rgba(239,68,68,0.15);
color: var(--danger, #ef4444);
font-size: 14px;
font-weight: 800;
cursor: pointer;
}

/* ─── Covers ─── */
.covers-display {
text-align: center; font-size: 32px; font-weight: 800; padding: 14px;
margin: 6px 0; border-radius: 12px;
background: #0a0a12; border: 1px solid var(--card-border, #2a2a40); color: var(--text, #fff);
}
.covers-keys {
display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px;
}

/* ─── Options ─── */
.opt-group { display: flex; flex-direction: column; gap: 6px; }
.opt-group-title { font-size: 12px; font-weight: 700; color: var(--muted, #8a8aa0); text-transform: uppercase; letter-spacing: 0.5px; }
.opt-list { display: flex; flex-wrap: wrap; gap: 6px; }
.opt-btn {
padding: 10px 14px; border-radius: 10px; border: 1px solid var(--card-border, #2a2a40);
background: var(--bg, #0d0d14); color: var(--text, #fff); font-size: 13px; font-weight: 600; cursor: pointer;
}
.opt-btn.active { background: var(--primary, #10b981); color: #0d0d14; border-color: var(--primary, #10b981); }

/* ─── Addition ─── */
.addition-lines { display: flex; flex-direction: column; gap: 5px; max-height: 200px; overflow-y: auto; }
.addition-line { display: flex; justify-content: space-between; font-size: 12px; padding: 5px 0; border-bottom: 1px dashed var(--card-border, #2a2a40); }
.addition-line em { color: var(--muted, #8a8aa0); font-style: normal; }
.addition-totals { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.addition-row { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted, #8a8aa0); }
.addition-total { font-size: 15px; font-weight: 800; color: var(--text, #fff); }

/* ─── Payment methods ─── */
.pay-methods { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pay-btn { display: flex; align-items: center; gap: 8px; padding: 14px 10px; border: none; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; color: #0d0d14; }
.pay-btn:active { transform: scale(0.95); }
.pay-btn:disabled { opacity: 0.4; }
.pay-icon { font-size: 24px; }
.pay-cash { background: linear-gradient(135deg, #34d399, #059669); }
.pay-card { background: linear-gradient(135deg, #60a5fa, #2563eb); color: #fff; }
.pay-ticket_resto { background: linear-gradient(135deg, #fbbf24, #d97706); }
.pay-amex { background: linear-gradient(135deg, #a78bfa, #6d28d9); color: #fff; }

/* ─── Floor Plan Modal ─── */
.floor-card {
  width: 100vw;
  max-width: none;
  height: 92dvh;
  border-radius: 18px;
  border: 1px solid var(--card-border, #2a2a40);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.floor-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.floor-title { font-size: 17px; font-weight: 800; display: flex; align-items: center; gap: 6px; }
.floor-count { font-size: 12px; font-weight: 700; color: var(--amber, #f59e0b); }
.floor-header-actions { display: flex; gap: 6px; }
.floor-view-toggle { width: 36px; height: 36px; border-radius: 10px; font-size: 16px; border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e); cursor: pointer; }

.floor-tabs {
  display: flex; gap: 5px; flex-wrap: wrap;
}

.floor-tab {
  padding: 7px 12px; border-radius: 10px; border: 1px solid var(--card-border, #2a2a40);
  background: var(--card-bg, #1a1a2e); color: var(--muted, #8a8aa0);
  font-size: 12px; font-weight: 700; cursor: pointer;
}

.floor-tab.active { background: var(--primary, #10b981); color: #0d0d14; border-color: var(--primary, #10b981); }

.floor-visual { flex: 1; min-height: 0; }
.floor-canvas {
  position: relative; width: 100%; height: 100%;
  border-radius: 14px; border: 1px solid var(--card-border, #2a2a40);
  background:
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px),
    var(--bg, #0e0e16);
  background-size: 20px 20px;
  overflow: hidden;
  min-height: 180px;
}

.floor-table-viz {
  position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center;
  transform: translate(-50%, -50%);
  font-weight: 800; cursor: pointer; user-select: none;
  transition: transform 0.1s;
  border-width: 3px; border-style: solid;
  box-shadow: 0 3px 8px rgba(0,0,0,0.4);
}

.floor-table-viz:active { transform: translate(-50%, -50%) scale(0.93); }
.floor-table-viz.round { border-radius: 50%; }
.floor-table-viz.square { border-radius: 12px; }
.floor-table-viz.small { width: 56px; height: 56px; }
.floor-table-viz.medium { width: 72px; height: 56px; }
.floor-table-viz.state-libre { background: rgba(16, 185, 129, 0.15); border-color: var(--success, #10b981); color: var(--success, #10b981); }
.floor-table-viz.state-occupée { background: rgba(245, 158, 11, 0.18); border-color: var(--amber, #f59e0b); color: var(--amber, #f59e0b); }
.floor-table-viz.state-addition { background: rgba(239, 68, 68, 0.18); border-color: var(--danger, #ef4444); color: #ef4444; }
.ft-num { font-size: 18px; line-height: 1; }
.ft-total { font-size: 11px; padding: 2px 6px; border-radius: 999px; background: rgba(0,0,0,0.5); color: #fff; margin-top: 2px; }
.floor-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--muted, #aaa); }

.floor-list { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; }

.floor-row {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 10px; border-radius: 12px; cursor: pointer;
  background: var(--card-bg, #1a1a2e); border: 1px solid var(--card-border, #2a2a40);
}

.floor-row:active { transform: scale(0.98); }
.floor-row.state-occupée { border-color: var(--amber, #f59e0b); background: rgba(245, 158, 11, 0.12); }
.floor-row.state-addition { border-color: var(--danger, #ef4444); }
.floor-row-num { font-size: 14px; font-weight: 800; flex: 1; }
.floor-row-covers { font-size: 11px; color: var(--muted, #888); }
.floor-row-state { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #888); }
.floor-row-total { font-size: 14px; font-weight: 800; color: var(--success, #10b981); min-width: 60px; text-align: right; }

.floor-legend { display: flex; gap: 12px; align-items: center; justify-content: center; font-size: 11px; color: var(--muted, #888); }
.lgd { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
.lgd-libre { background: var(--success, #10b981); }
.lgd-occupee { background: var(--amber, #f59e0b); }
.lgd-addition { background: var(--danger, #ef4444); }
</style>