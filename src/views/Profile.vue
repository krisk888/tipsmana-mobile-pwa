<template>
  <div class="profile-view">
    <header class="page-header">
      <h2>👤 Profil</h2>
      <p class="subtitle">Gérez votre compte et vos préférences</p>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Chargement...</p>
    </div>

    <template v-else>
      <!-- Carte identité -->
      <section class="profile-card">
        <div class="avatar">
          <span class="avatar-letter">{{ (user?.first_name || '?')[0] }}{{ (user?.last_name || '?')[0] }}</span>
        </div>
        <div class="profile-info">
          <h3>{{ user?.first_name }} {{ user?.last_name }}</h3>
          <p class="profile-email">{{ user?.email }}</p>
          <span class="role-badge">{{ roleCode }}</span>
        </div>
      </section>

      <!-- Éditer le profil -->
      <section class="form-section">
        <h4>Informations personnelles</h4>
        <div class="field">
          <label>Prénom</label>
          <input v-model="editForm.first_name" type="text" placeholder="Prénom" />
        </div>
        <div class="field">
          <label>Nom</label>
          <input v-model="editForm.last_name" type="text" placeholder="Nom" />
        </div>
        <div class="field">
          <label>Téléphone</label>
          <input v-model="editForm.phone" type="tel" placeholder="+336****5678" />
        </div>
        <div class="field">
          <label>Email</label>
          <input v-model="editForm.email" type="email" placeholder="email@exemple.fr" />
        </div>
        <p v-if="profileError" class="field-error">{{ profileError }}</p>
        <p v-if="profileSuccess" class="field-success">{{ profileSuccess }}</p>
        <button class="btn-save" :disabled="saving" @click="saveProfile">
          {{ saving ? 'Enregistrement...' : 'Enregistrer' }}
        </button>
      </section>

      <!-- Établissement -->
      <section class="info-section">
        <h4>Établissement</h4>
        <div class="info-row">
          <span class="info-label">Nom</span>
          <span class="info-value">{{ establishment?.name || '—' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Rôle</span>
          <span class="info-value">{{ roleLabel }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Type</span>
          <span class="info-value">{{ establishment?.business_type || '—' }}</span>
        </div>
      </section>

      <!-- Préférences notifications -->
      <section class="form-section">
        <h4>Notifications</h4>
        <div class="toggle-row">
          <span>Notifications push</span>
          <label class="toggle">
            <input v-model="notifPrefs.push" type="checkbox" @change="saveNotifPrefs" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="toggle-row">
          <span>Notifications email</span>
          <label class="toggle">
            <input v-model="notifPrefs.email" type="checkbox" @change="saveNotifPrefs" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <p class="toggle-hint">Les préférences sont sauvegardées automatiquement</p>
      </section>

      <!-- Changer mot de passe -->
      <section class="form-section">
        <h4>Changer le mot de passe</h4>
        <div class="field">
          <label>Mot de passe actuel</label>
          <input v-model="passwordForm.current" type="password" placeholder="••••••••" />
        </div>
        <div class="field">
          <label>Nouveau mot de passe</label>
          <input v-model="passwordForm.newPass" type="password" placeholder="••••••••" />
        </div>
        <div class="field">
          <label>Confirmer</label>
          <input v-model="passwordForm.confirm" type="password" placeholder="••••••••" />
        </div>
        <p v-if="passwordError" class="field-error">{{ passwordError }}</p>
        <p v-if="passwordSuccess" class="field-success">{{ passwordSuccess }}</p>
        <button class="btn-save" :disabled="changingPassword" @click="changePassword">
          {{ changingPassword ? 'Mise à jour...' : 'Changer le mot de passe' }}
        </button>
      </section>

      <!-- ═══ Paiement ═══ -->
      <section class="form-section">
        <h4>💳 Paiement</h4>
        <div v-if="paymentLoading" class="loading-state">Chargement…</div>
        <template v-else>
          <p v-if="paymentErrorMsg" class="field-error">{{ paymentErrorMsg }}</p>
          <div
            v-for="m in paymentMethods"
            :key="m.method_code"
            class="payment-method-row"
          >
            <label class="payment-toggle-label">
              <span class="payment-method-name">
                <span class="method-icon">{{ methodIcon(m.method_code) }}</span>
                {{ m.method_name }}
              </span>
              <label class="toggle-switch">
                <input type="checkbox" v-model="m.is_active" />
                <span class="toggle-slider-sm"></span>
              </label>
            </label>
            <!-- Bank details for bank_transfer -->
            <div v-if="m.method_code === 'bank_transfer' && m.is_active" class="bank-fields">
              <div class="bank-field-row">
                <label class="bank-field-label">IBAN</label>
                <input v-model="m._config.iban" class="bank-input" placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" />
              </div>
              <div class="bank-field-row">
                <label class="bank-field-label">BIC</label>
                <input v-model="m._config.bic" class="bank-input" placeholder="ABCDEFGH" />
              </div>
              <div class="bank-field-row">
                <label class="bank-field-label">Titulaire</label>
                <input v-model="m._config.bank_holder" class="bank-input" placeholder="Nom du titulaire" />
              </div>
              <div class="bank-field-row">
                <label class="bank-field-label">Banque</label>
                <input v-model="m._config.bank_name" class="bank-input" placeholder="Nom de la banque" />
              </div>
            </div>
            <!-- SumUp config -->
            <div v-if="m.method_code === 'sumup' && m.is_active" class="bank-fields">
              <div class="bank-field-row">
                <label class="bank-field-label">API Key</label>
                <input v-model="m._config.api_key" class="bank-input" placeholder="Clé API SumUp" type="password" />
              </div>
              <div class="bank-field-row">
                <label class="bank-field-label">Merchant ID</label>
                <input v-model="m._config.merchant_id" class="bank-input" placeholder="ID commerçant SumUp" />
              </div>
            </div>
          </div>
          <p v-if="paymentSaveMsg" class="payment-msg" :class="paymentSaveMsgClass">{{ paymentSaveMsg }}</p>
          <button class="btn-save" :disabled="paymentSaving" @click="savePaymentMethods">
            {{ paymentSaving ? 'Sauvegarde…' : '💾 Sauvegarder' }}
          </button>
        </template>
      </section>

      <!-- Déconnexion -->
      <section class="danger-section">
        <button class="btn-logout" @click="handleLogout">
          🚪 Se déconnecter
        </button>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import api from '../shared/api'

const router = useRouter()
const authStore = useAuthStore()

const user = computed(() => authStore.user)
const roleCode = computed(() => authStore.roleCode)
const roleLabel = computed(() => authStore.roleLabel)
const establishment = computed(() => authStore.establishment)

const loading = ref(false)
const saving = ref(false)
const profileError = ref('')
const profileSuccess = ref('')

const editForm = reactive({
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
})

const notifPrefs = reactive({
  push: true,
  email: false,
})

const passwordForm = reactive({
  current: '',
  newPass: '',
  confirm: '',
})
const changingPassword = ref(false)
const passwordError = ref('')
const passwordSuccess = ref('')

// Payment methods
const paymentMethods = ref([])
const paymentLoading = ref(false)
const paymentSaving = ref(false)
const paymentSaveMsg = ref('')
const paymentSaveMsgClass = ref('')
const paymentErrorMsg = ref('')

function methodIcon(code) {
  const icons = { cash: '💵', card: '💳', sumup: '📱', bank_transfer: '🏦', ticket_resto: '🍽️', amex: '🔷', nfc: '📲', voucher: '🎁', online: '🌐' }
  return icons[code] || '💳'
}

async function loadProfile() {
  loading.value = true
  try {
    const res = await api.get('/auth/me')
    const data = res.data || {}
    const u = data.user || {}
    editForm.first_name = u.first_name || ''
    editForm.last_name = u.last_name || ''
    editForm.phone = u.phone || ''
    editForm.email = u.email || ''
    
    // Store full user data
    authStore.user = u
    authStore.establishment = data.establishment || null
  } catch {
    // Use existing store data
    if (authStore.user) {
      editForm.first_name = authStore.user.first_name || ''
      editForm.last_name = authStore.user.last_name || ''
      editForm.phone = authStore.user.phone || ''
      editForm.email = authStore.user.email || ''
    }
  } finally {
    loading.value = false
  }

  // Load notification preferences
  try {
    const prefRes = await api.get('/notifications/preferences')
    const prefData = prefRes.data || {}
    notifPrefs.push = prefData.preferences_by_module?.cost_control?.[0]?.channels?.push !== false
    notifPrefs.email = prefData.preferences_by_module?.cost_control?.[0]?.channels?.email === true
  } catch {
    // Defaults
  }
}

async function saveProfile() {
  saving.value = true
  profileError.value = ''
  profileSuccess.value = ''
  try {
    const body = {}
    if (editForm.first_name !== (user.value?.first_name || '')) body.first_name = editForm.first_name
    if (editForm.last_name !== (user.value?.last_name || '')) body.last_name = editForm.last_name
    if (editForm.phone !== (user.value?.phone || '')) body.phone = editForm.phone || null
    if (editForm.email !== (user.value?.email || '')) body.email = editForm.email || null

    if (Object.keys(body).length === 0) {
      profileSuccess.value = 'Aucune modification'
      saving.value = false
      setTimeout(() => { profileSuccess.value = '' }, 3000)
      return
    }

    const res = await api.put('/auth/profile', body)
    // Handle both { user: {...} } and { data: { user: {...} } } response formats
    const payload = res.data ? res.data : res
    const updatedUser = payload.user || payload

    // Merge to preserve fields not returned by API (e.g. email, role)
    const merged = { ...(user.value || {}), ...updatedUser }
    authStore.user = merged

    // Re-sync editForm with merged data so next diff is clean
    editForm.first_name = merged.first_name || ''
    editForm.last_name = merged.last_name || ''
    editForm.phone = merged.phone || ''
    editForm.email = merged.email || ''

    profileSuccess.value = 'Profil mis à jour ✓'
  } catch (e) {
    profileError.value = e.message || e.data?.message || 'Erreur de mise à jour'
  } finally {
    saving.value = false
    setTimeout(() => { profileSuccess.value = ''; profileError.value = '' }, 3000)
  }
}

async function changePassword() {
  passwordError.value = ''
  passwordSuccess.value = ''

  if (!passwordForm.current) { passwordError.value = 'Mot de passe actuel requis'; return }
  if (passwordForm.newPass.length < 8) { passwordError.value = 'Minimum 8 caractères'; return }
  if (passwordForm.newPass !== passwordForm.confirm) { passwordError.value = 'Les mots de passe ne correspondent pas'; return }

  changingPassword.value = true
  try {
    await api.post('/auth/password/change', {
      current_password: passwordForm.current,
      new_password: passwordForm.newPass,
    })
    passwordSuccess.value = 'Mot de passe changé ✓'
    passwordForm.current = ''
    passwordForm.newPass = ''
    passwordForm.confirm = ''
  } catch (e) {
    passwordError.value = e.message || 'Erreur de changement de mot de passe'
  } finally {
    changingPassword.value = false
    setTimeout(() => { passwordSuccess.value = ''; passwordError.value = '' }, 3000)
  }
}

async function loadPaymentMethods() {
  paymentLoading.value = true
  paymentErrorMsg.value = ''
  try {
    const res = await api.get('/settings/payment-methods')
    const data = res.data || res
    const list = data.data || data
    paymentMethods.value = (Array.isArray(list) ? list : []).map(m => ({
      ...m,
      _config: m.config ? { ...m.config } : {}
    }))
  } catch {
    paymentErrorMsg.value = '❌ Impossible de charger les méthodes de paiement'
    paymentMethods.value = []
  } finally {
    paymentLoading.value = false
  }
}

async function savePaymentMethods() {
  paymentSaving.value = true
  paymentSaveMsg.value = ''
  paymentSaveMsgClass.value = ''
  try {
    const methods = paymentMethods.value.map(m => ({
      method_code: m.method_code,
      method_name: m.method_name,
      icon: m.icon,
      is_active: m.is_active,
      sort_order: m.sort_order,
      config: m._config
    }))
    await api.put('/settings/payment-methods/bulk', { methods })
    paymentSaveMsg.value = '✅ Configuration sauvegardée'
    paymentSaveMsgClass.value = 'payment-success'
    await loadPaymentMethods()
  } catch (e) {
    paymentSaveMsg.value = e.message || '❌ Erreur de sauvegarde'
    paymentSaveMsgClass.value = 'payment-error'
  } finally {
    paymentSaving.value = false
    setTimeout(() => { paymentSaveMsg.value = ''; paymentSaveMsgClass.value = '' }, 3000)
  }
}

async function saveNotifPrefs() {
  try {
    await api.put('/notifications/preferences', {
      preferences: [{
        notification_type_code: 'all',
        is_enabled: true,
        in_app: true,
        email: notifPrefs.email,
        push: notifPrefs.push,
        sms: false,
        frequency: 'realtime',
      }]
    })
  } catch {
    // Silently fail
  }
}

function handleLogout() {
  authStore.logout()
  router.push('/login')
}

onMounted(() => {
  loadProfile()
})
</script>

<style scoped>
.profile-view { padding: 16px; padding-bottom: 80px; }
.page-header { margin-bottom: 16px; }
.page-header h2 { font-size: 22px; color: #fff; margin: 0; }
.subtitle { font-size: 13px; color: #888; margin-top: 4px; }

.loading-state { text-align: center; padding: 48px; color: #888; }
.spinner {
  width: 32px; height: 32px; border: 3px solid #2a2a40; border-top-color: #6c5ce7;
  border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Carte identité */
.profile-card {
  display: flex; align-items: center; gap: 16px;
  background: #1e1e32; border-radius: 16px; padding: 20px; margin-bottom: 16px;
}
.avatar {
  width: 60px; height: 60px; border-radius: 50%;
  background: linear-gradient(135deg, #6c5ce7, #a29bfe);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.avatar-letter { font-size: 22px; font-weight: 700; color: #fff; }
.profile-info h3 { font-size: 18px; color: #fff; margin: 0; }
.profile-email { font-size: 13px; color: #888; margin: 2px 0 6px; }
.role-badge {
  font-size: 10px; background: #2a2a40; color: #aaa;
  padding: 2px 8px; border-radius: 6px; text-transform: uppercase;
}

/* Sections */
.form-section, .info-section, .danger-section {
  background: #1e1e32; border-radius: 12px; padding: 16px; margin-bottom: 12px;
}
.form-section h4, .info-section h4 {
  font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;
}

.field { margin-bottom: 12px; }
label { display: block; font-size: 12px; color: #888; margin-bottom: 4px; }
.field input {
  width: 100%; padding: 10px 12px;
  background: #0f0f1a; border: 1px solid #2a2a40; border-radius: 8px;
  color: #fff; font-size: 14px; box-sizing: border-box;
}
.field input:focus { outline: none; border-color: #6c5ce7; }

.field-error { color: #ff6b6b; font-size: 12px; text-align: center; margin: 8px 0; }
.field-success { color: #00d2a0; font-size: 12px; text-align: center; margin: 8px 0; }

.btn-save {
  width: 100%; padding: 12px;
  background: #6c5ce7; border: none; border-radius: 10px;
  color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
  transition: opacity 0.2s;
}
.btn-save:disabled { opacity: 0.5; }

/* Info rows */
.info-row {
  display: flex; justify-content: space-between; padding: 10px 0;
  border-bottom: 1px solid #2a2a40;
}
.info-row:last-child { border-bottom: none; }
.info-label { font-size: 13px; color: #888; }
.info-value { font-size: 13px; color: #ddd; font-weight: 500; }

/* Toggle switches */
.toggle-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 0; font-size: 14px; color: #ddd;
}
.toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
  background: #2a2a40; border-radius: 24px; transition: 0.3s;
}
.toggle-slider:before {
  content: ''; position: absolute; height: 18px; width: 18px;
  left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: 0.3s;
}
.toggle input:checked + .toggle-slider { background: #6c5ce7; }
.toggle input:checked + .toggle-slider:before { transform: translateX(20px); }
.toggle-hint { font-size: 11px; color: #666; margin-top: 8px; text-align: center; }

/* Danger zone */
.danger-section { text-align: center; }
.btn-logout {
  width: 100%; padding: 14px;
  background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.3);
  border-radius: 10px; color: #ff6b6b; font-size: 15px; font-weight: 600;
  cursor: pointer; transition: background 0.2s;
}
.btn-logout:active { background: rgba(255,107,107,0.2); }
</style>
