<template>
  <div class="login-screen">
    <div class="login-card">
      <div class="login-logo">
        <BrandLogo :size="96" :dark="true" />
        <p class="subtitle">L'App du Boss</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="field">
          <label>Email</label>
          <input
            v-model="email"
            type="email"
            placeholder="email@exemple.fr"
            required
            autocomplete="email"
          />
        </div>

        <div class="field">
          <label>Mot de passe</label>
          <input
            v-model="password"
            type="password"
            placeholder="••••••••"
            required
            autocomplete="current-password"
          />
        </div>

        <p v-if="error" class="error">{{ error }}</p>

        <button type="submit" class="btn-primary" :disabled="loading">
          {{ loading ? 'Connexion...' : 'Se connecter' }}
        </button>
      </form>

      <!-- ═══ Connexion rapide (DEV) ═══ -->
      <div class="quick-login" v-if="!loading">
        <div class="quick-divider">
          <span>⏺ Test rapide</span>
        </div>
        <div class="quick-grid">
          <button
            v-for="r in roles"
            :key="r.label"
            class="quick-btn"
            :class="r.role"
            @click="fillLogin(r)"
          >
            <span class="quick-label">{{ r.label }}</span>
            <span class="quick-email">{{ r.email }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { login } from '../shared/auth'
import BrandLogo from '../components/BrandLogo.vue'

const router = useRouter()
const route = useRoute()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

const roles = [
  { label: 'Admin',   role: 'admin',   email: 'admin@tipsmana.com',     password: 'test1234',        route: '/pilot' },
  { label: 'Pilote',  role: 'pilot',   email: 'associe@tipsmana.com',   password: 'test1234',        route: '/pilot' },
  { label: 'Cuisine', role: 'cuisine', email: 'pierre.dubois@legrandcomptoir.fr', password: 'test1234', route: '/cuisine' },
  { label: 'Caisse',  role: 'caisse',  email: 'boss@restoducoin.fr',    password: 'RestoDuCoin2026!', route: '/caisse' },
]

async function handleLogin() {
  loading.value = true
  error.value = ''
  try {
    await login(email.value, password.value)
    const m = roles.find(r => r.email === email.value)
    router.push(m ? m.route : '/pilot')
  } catch (e) {
    error.value = e.data?.message || e.message || 'Email ou mot de passe incorrect'
  } finally {
    loading.value = false
  }
}

async function fillLogin(r) {
  email.value = r.email
  password.value = r.password
  error.value = ''
  // focus sur le bouton Se connecter pour valider direct
  document.querySelector('.btn-primary')?.focus()
}

// Lien direct ?role=admin|pilot|cuisine|caisse → identifiants pré-remplis
onMounted(async () => {
  const r = roles.find(x => x.role === route.query.role)
  if (r) {
    email.value = r.email
    password.value = r.password
    error.value = ''
  }
})
</script>

<style scoped>
.login-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: 24px;
  background: var(--bg, #0f0f1a);
}
.login-card {
  width: 100%;
  max-width: 400px;
  padding: 32px 24px;
  background: var(--nav-bg, #1a1a2e);
  border: 1px solid var(--nav-border, #2a2a40);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.login-logo { text-align: center; margin-bottom: 32px; }
.subtitle { font-size: 14px; color: var(--nav-inactive, #6b6b7b); margin: 8px 0 0; }
.field { margin-bottom: 16px; }
label { display: block; font-size: 13px; color: var(--nav-inactive, #6b6b7b); margin-bottom: 6px; }
input {
  width: 100%; padding: 12px 14px;
  background: var(--bg, #0f0f1a); border: 1px solid var(--nav-border, #2a2a40);
  border-radius: 10px; color: var(--text, #fff); font-size: 15px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
input:focus { outline: none; border-color: #059669; }
.error { color: var(--logout-hover, #ff6b6b); font-size: 13px; text-align: center; margin: 8px 0; }
.btn-primary {
  width: 100%; padding: 14px;
  background: #00d2a0;
  border: none; border-radius: 10px;
  color: #0f0f1a; font-size: 16px; font-weight: 700;
  cursor: pointer; transition: opacity 0.2s, background 0.2s;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary:not(:disabled):hover { opacity: 0.9; }
/* ═══ Quick login — DEV ═══ */
.quick-divider {
  display: flex; align-items: center; gap: 12px;
  margin: 20px 0 12px; font-size: 12px; color: #555;
}
.quick-divider::after { content: ''; flex: 1; height: 1px; background: #333; }
.quick-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.quick-btn {
  display: flex; flex-direction: column; gap: 2px;
  padding: 10px 8px; border: 1px solid var(--nav-border, #2a2a40); border-radius: 10px;
  background: var(--bg, #0f0f1a); cursor: pointer; text-align: left;
  transition: border-color 0.2s, background 0.2s;
}
.quick-btn:hover { border-color: #059669; }
.quick-btn:active { transform: scale(0.97); }
.quick-btn.admin { border-color: #00d2a0; }
.quick-btn.pilot { border-color: #059669; }
.quick-btn.cuisine { border-color: #ff6b6b; }
.quick-btn.caisse { border-color: #fbbf24; }
.quick-label { font-size: 13px; font-weight: 700; color: var(--text, #fff); }
.quick-email { font-size: 10px; color: var(--nav-inactive, #6b6b7b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.quick-hint { font-size: 11px; color: #444; text-align: center; margin-top: 8px; }
.quick-hint code { color: #888; }
</style>