<template>
  <div class="login-screen">
    <div class="login-card">
      <div class="login-logo">
        <img src="/images/logo_horizontal.jpg" class="login-logo-img" alt="Tipsmana" />
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

      <!-- Quick-login par rôles -->
      <div class="demo-section">
        <p class="demo-title">Connexion rapide — choisir un rôle</p>
        <div class="demo-grid">
          <button
            v-for="r in roles"
            :key="r.label"
            class="demo-btn"
            @click="fillRole(r)"
          >
            <span class="demo-emoji">{{ r.emoji }}</span>
            <span class="demo-label">{{ r.label }}</span>
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { login } from '../shared/auth'

const router = useRouter()
const email = ref('boss@restoducoin.fr')
const password = ref('RestoDuCoin2026!')
const loading = ref(false)
const error = ref('')

// Comptes de démonstration par rôle
const roles = [
  { emoji: '👑', label: 'Boss', email: 'boss@restoducoin.fr', password: 'RestoDuCoin2026!' },
  { emoji: '📊', label: 'Manager', email: 'manager@restoducoin.fr', password: 'RestoDuCoin2026!' },
  { emoji: '🍳', label: 'Chef cuisine', email: 'cuisinier@restoducoin.fr', password: 'RestoDuCoin2026!' },
  { emoji: '🧾', label: 'Inventaire', email: 'admin@restoducoin.fr', password: 'RestoDuCoin2026!' },
  { emoji: '📦', label: 'Ventes', email: 'admin@restoducoin.fr', password: 'RestoDuCoin2026!' },
  { emoji: '📊', label: 'Achats', email: 'admin@restoducoin.fr', password: 'RestoDuCoin2026!' },
  { emoji: '🍽', label: 'Serveur', email: 'serveur1@restoducoin.fr', password: 'RestoDuCoin2026!' },
]

function fillRole(r) {
  email.value = r.email
  password.value = r.password
  error.value = ''
}

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
.login-logo-img { max-width: 280px; height: auto; display: block; margin: 0 auto; }
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
.demo-section { margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--nav-border,#2a2a40); }
.demo-title { font-size: 12px; color: var(--nav-inactive,#6b6b7b); text-align: center; margin-bottom: 10px; }
.demo-grid { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.demo-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; background: var(--bg,#0f0f1a);
  border: 1px solid var(--nav-border,#2a2a40); border-radius: 10px;
  color: var(--text,#fff); font-size: 13px; cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}
.demo-btn:hover { border-color: #059669; background: #1a2a1e; }
.demo-emoji { font-size: 16px; }
.demo-label { font-weight: 500; }
</style>