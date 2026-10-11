<template>
  <div class="login-screen">
    <div class="login-card">
      <div class="login-logo">
        <div class="logo-icon">T</div>
        <h1>Tipsmana</h1>
        <p class="subtitle">L'App du Boss</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="field">
          <label>Email</label>
          <input
            v-model="email"
            type="email"
            placeholder="boss@restaurant.fr"
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
            @click="quickLogin(r)"
          >
            <span class="quick-label">{{ r.label }}</span>
            <span class="quick-email">{{ r.email }}</span>
          </button>
        </div>
        <p class="quick-hint">mdp : <code>test1234</code></p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { login } from '../shared/auth'

const router = useRouter()
const email = ref('')
const password = ref('test1234')
const loading = ref(false)
const error = ref('')

const roles = [
  { label: 'Admin',   role: 'admin',   email: 'admin@tipsmana.com',     route: '/pilot' },
  { label: 'Pilote',  role: 'pilot',   email: 'associe@tipsmana.com',   route: '/pilot' },
  { label: 'Cuisine', role: 'cuisine', email: 'pierre.dubois@legrandcomptoir.fr', route: '/cuisine' },
  { label: 'Caisse',  role: 'caisse',  email: 'boss@restoducoin.fr',    route: '/caisse' },
]

async function handleLogin() {
  loading.value = true
  error.value = ''
  try {
    await login(email.value, password.value)
    router.push('/pilot')
  } catch (e) {
    error.value = e.data?.message || e.message || 'Email ou mot de passe incorrect'
  } finally {
    loading.value = false
  }
}

async function quickLogin(r) {
  loading.value = true
  error.value = ''
  try {
    await login(r.email, 'test1234')
    router.push(r.route)
  } catch (e) {
    error.value = 'Quick login échoué pour ' + r.label
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: 24px;
  background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);
}
.login-card {
  width: 100%;
  max-width: 400px;
  padding: 32px 24px;
  background: #1e1e32;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.login-logo { text-align: center; margin-bottom: 32px; }
.logo-icon {
  width: 64px; height: 64px; margin: 0 auto 12px;
  background: linear-gradient(135deg, #6c5ce7, #a29bfe);
  border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
  font-size: 28px; font-weight: 800; color: white;
}
h1 { font-size: 24px; font-weight: 700; color: #fff; margin: 0; }
.subtitle { font-size: 14px; color: #888; margin: 4px 0 0; }
.field { margin-bottom: 16px; }
label { display: block; font-size: 13px; color: #aaa; margin-bottom: 6px; }
input {
  width: 100%; padding: 12px 14px;
  background: #2a2a40; border: 1px solid #3a3a50;
  border-radius: 10px; color: #fff; font-size: 15px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
input:focus { outline: none; border-color: #6c5ce7; }
.error { color: #ff6b6b; font-size: 13px; text-align: center; margin: 8px 0; }
.btn-primary {
  width: 100%; padding: 14px;
  background: linear-gradient(135deg, #6c5ce7, #a29bfe);
  border: none; border-radius: 10px;
  color: white; font-size: 16px; font-weight: 600;
  cursor: pointer; transition: opacity 0.2s;
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
  padding: 10px 8px; border: 1px solid #333; border-radius: 10px;
  background: #2a2a40; cursor: pointer; text-align: left;
  transition: border-color 0.2s, background 0.2s;
}
.quick-btn:active { transform: scale(0.97); }
.quick-btn.admin { border-color: #6c5ce7; }
.quick-btn.pilot { border-color: #a29bfe; }
.quick-btn.cuisine { border-color: #00d2a0; }
.quick-btn.caisse { border-color: #ff6b6b; }
.quick-label { font-size: 13px; font-weight: 700; color: #fff; }
.quick-email { font-size: 10px; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.quick-hint { font-size: 11px; color: #444; text-align: center; margin-top: 8px; }
.quick-hint code { color: #888; }
</style>