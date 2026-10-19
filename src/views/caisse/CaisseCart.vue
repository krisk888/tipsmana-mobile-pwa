<template>
  <div class="caisse-cart" :class="{ open: expanded }">
    <!-- ═══ En-tête du panier (tap pour déplier/replier) ═══ -->
    <div class="cart-header" @click="expanded = !expanded">
      <span class="cart-title">
        🧾 Commandes
        <span v-if="table !== null" class="cart-table-badge">Table {{ table }}</span>
        <span v-else class="cart-table-badge none">Aucune table</span>
      </span>
      <span class="cart-header-right">
        <span class="cart-total">{{ formatEur(cartTotal) }}</span>
        <span class="cart-chevron" :class="{ open: expanded }">▾</span>
      </span>
    </div>

    <!-- ═══ Corps du panier ═══ -->
    <div v-if="expanded" class="cart-body">
      <div v-if="cart.length === 0" class="cart-empty">Panier vide — tapez un article</div>

      <div v-else class="cart-items">
        <div v-for="(item, i) in cart" :key="i" class="cart-item" :class="{ sent: item.sent }">
          <div class="cart-item-info">
            <span class="cart-item-name">
              {{ item.name }}
              <span v-if="item.sent" class="sent-badge">✓ Envoyé</span>
            </span>
            <span v-if="item.options" class="cart-item-options">⚙️ {{ item.options }}</span>
            <span class="course-badge" :class="'course-' + (item.course || 'entree')">
              {{ courseLabel(item.course || 'entree') }}
            </span>
          </div>
          <div class="cart-item-right">
            <div class="qty-ctrl">
              <button class="qty-btn" :disabled="item.qty <= 1" @click="$emit('decrement', i)">−</button>
              <span class="qty-val">{{ item.qty }}</span>
              <button class="qty-btn" @click="$emit('increment', i)">+</button>
            </div>
            <span class="line-price">{{ formatEur(item.qty * item.price) }}</span>
            <button class="remove-btn" @click="$emit('remove', i)">✕</button>
          </div>
        </div>
      </div>

      <!-- ═══ Flux service : À SUIVRE (visible pendant la saisie) ═══ -->
      <div v-if="courseMode && cart.length > 0 && !ticketSent" class="course-zone">
        <div class="course-progress">
          <span
            v-for="c in courses"
            :key="c.key"
            class="course-dot"
            :class="{ active: c.key === currentCourse, done: courseSealed(c.key) }"
          >
            {{ courseSealed(c.key) ? '✓' : (c.key === currentCourse ? '◉' : '○') }}
            <em>{{ c.label }}</em>
          </span>
        </div>
        <button class="asuivre-btn" @click="$emit('à-suivre')">À SUIVRE ➜</button>
      </div>

      <!-- ═══ Bandeau actions table : Réclamer / Addition / Solder ═══ -->
      <div v-if="cart.length > 0 && table !== null && ticketSent" class="table-actions">
        <button class="action-btn action-reclaim" @click="$emit('réclamer')">🔔 Réclamer</button>
        <button class="action-btn action-addition" @click="$emit('addition')">🧾 Addition</button>
        <button class="action-btn action-solder" @click="$emit('solder')">💶 Solder</button>
      </div>

      <!-- ═══ Total + ENVOI ═══ -->
      <div class="cart-footer">
        <div class="total-line">
          <span class="total-label">Total TTC</span>
          <span class="total-value">{{ formatEur(cartTotal) }}</span>
        </div>
        <button
          class="envoi-btn"
          :class="{ sent: ticketSent }"
          :disabled="cart.length === 0 || paying || ticketSent"
          @click="$emit('envoi')"
        >
          {{ ticketSent ? '✓ Envoyé en cuisine' : '📤 ENVOI' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  cart: { type: Array, default: () => [] },
  cartTotal: { type: Number, default: 0 },
  courseMode: { type: Boolean, default: true },
  currentCourse: { type: String, default: 'entree' },
  sealedCourses: { type: [Set, Object], default: () => new Set() },
  courses: { type: Array, default: () => [] },
  table: { type: [Number, String], default: null },
  paying: { type: Boolean, default: false },
  ticketSent: { type: Boolean, default: false },
})

defineEmits(['à-suivre', 'envoi', 'réclamer', 'addition', 'solder', 'increment', 'decrement', 'remove'])

const expanded = ref(true)

function formatEur(v) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0)
}

function courseLabel(key) {
  return props.courses.find(c => c.key === key)?.label || 'Service'
}

function courseSealed(key) {
  if (props.sealedCourses instanceof Set) return props.sealedCourses.has(key)
  return !!props.sealedCourses[key]
}
</script>

<style scoped>
.caisse-cart {
  position: fixed;
  left: 8px;
  right: 8px;
  bottom: calc(64px + env(safe-area-inset-bottom));
  z-index: 90;
  background: var(--card-bg, #1a1a2e);
  border: 1px solid var(--card-border, #2a2a40);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.45);
  max-height: 46dvh;
  display: flex;
  flex-direction: column;
}

.cart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  background: var(--nav-bg, #15152a);
}

.cart-title {
  font-size: 14px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 8px;
}

.cart-table-badge {
  font-size: 10px;
  font-weight: 800;
  background: rgba(16, 185, 129, 0.2);
  color: var(--success, #10b981);
  padding: 2px 8px;
  border-radius: 8px;
}

.cart-table-badge.none {
  background: rgba(250, 204, 21, 0.15);
  color: var(--amber, #facc15);
}

.cart-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cart-total {
  font-size: 16px;
  font-weight: 800;
  color: var(--success, #10b981);
}

.cart-chevron {
  color: var(--muted, #8a8aa0);
  font-size: 12px;
  transition: transform 0.2s;
}

.cart-chevron.open { transform: rotate(180deg); }

.cart-body {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  padding: 8px 12px;
}

.cart-empty {
  padding: 18px 8px;
  text-align: center;
  color: var(--muted, #8a8aa0);
  font-size: 13px;
}

.cart-items { display: flex; flex-direction: column; }

.cart-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--card-border, #2a2a40);
}

.cart-item.sent { opacity: 0.75; }
.cart-item:last-child { border-bottom: none; }

.cart-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.cart-item-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text, #fff);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.sent-badge {
  font-size: 9px;
  font-weight: 800;
  color: var(--success, #10b981);
  background: rgba(16, 185, 129, 0.15);
  padding: 1px 6px;
  border-radius: 6px;
}

.cart-item-options { font-size: 11px; color: var(--muted, #8a8aa0); }

.course-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  align-self: flex-start;
}

.course-entree  { background: rgba(59, 130, 246, 0.2);   color: #60a5fa; }
.course-plat    { background: rgba(251, 191, 36, 0.2);   color: #fbbf24; }
.course-dessert { background: rgba(236, 72, 153, 0.2);   color: #f472b6; }

.cart-item-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.qty-ctrl { display: flex; align-items: center; gap: 3px; }

.qty-btn {
  width: 26px;
  height: 26px;
  background: var(--hover-bg, #2a2a40);
  color: var(--text, #fff);
  border: 1px solid var(--card-border, #2a2a40);
  border-radius: 6px;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.qty-btn:disabled { opacity: 0.35; }

.qty-val {
  min-width: 20px;
  text-align: center;
  font-weight: 800;
  font-size: 14px;
  color: var(--text, #fff);
}

.line-price {
  font-weight: 800;
  color: var(--success, #10b981);
  font-size: 13px;
  min-width: 58px;
  text-align: right;
}

.remove-btn {
  width: 22px;
  height: 22px;
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger, #ef4444);
  border: none;
  border-radius: 6px;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
}

/* Zone service : À SUIVRE */
.course-zone {
  padding: 10px 4px 6px;
  border-top: 1px solid var(--card-border, #2a2a40);
  margin-top: 6px;
}

.course-progress {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.course-dot {
  font-size: 13px;
  color: var(--muted, #8a8aa0);
  display: flex;
  align-items: center;
  gap: 3px;
}

.course-dot em {
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
}

.course-dot.active { color: var(--primary, #10b981); }
.course-dot.done { color: var(--success, #10b981); }

.asuivre-btn {
  width: 100%;
  background: var(--primary, #10b981);
  color: #0d0d14;
  border: none;
  border-radius: 12px;
  padding: 13px;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.5px;
  cursor: pointer;
}

/* Actions table */
.table-actions {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
  padding: 10px 0 6px;
  border-top: 1px solid var(--card-border, #2a2a40);
  margin-top: 6px;
}

.action-btn {
  padding: 10px 4px;
  border: none;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  color: var(--text, #fff);
}

.action-reclaim  { background: rgba(245, 158, 11, 0.18); color: var(--amber, #f59e0b); }
.action-addition { background: rgba(59, 130, 246, 0.18);  color: #60a5fa; }
.action-solder   { background: var(--primary, #10b981);   color: #0d0d14; }

/* Footer : total + ENVOI */
.cart-footer {
  padding: 10px 4px 6px;
  border-top: 1px solid var(--card-border, #2a2a40);
  margin-top: 6px;
}

.total-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.total-label {
  font-size: 11px;
  color: var(--muted, #8a8aa0);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.total-value {
  font-size: 22px;
  font-weight: 800;
  color: var(--text, #fff);
}

.envoi-btn {
  width: 100%;
  padding: 13px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #34d399, #059669);
  color: #0d0d14;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 1px;
  cursor: pointer;
}

.envoi-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.envoi-btn.sent { background: rgba(16, 185, 129, 0.15); color: var(--success, #10b981); }
</style>
