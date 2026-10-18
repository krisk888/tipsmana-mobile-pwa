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

      <!-- Quick-login par rôles — un clic = connexion directe -->
      <div class="demo-section">
        <p class="demo-title">Connexion rapide — choisir un rôle</p>
        <div class="demo-grid">
          <button
            v-for="r in roles"
            :key="r.label"
            class="demo-btn"
            :class="{ loading: authStore.loading && loadingRole === r.role }"
            :disabled="authStore.loading"
            @click="quickLoginAs(r)"
          >
            <span class="demo-emoji">{{ r.emoji }}</span>
            <span class="demo-label">{{ r.label }}</span>
            <span v-if="r.role === 'OWNER'" class="demo-role-badge">Démo</span>
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'

const router = useRouter()
const authStore = useAuthStore()
const email = ref('boss@restoducoin.fr')
const password = ref('Boss2026!X')
const loadingRole = ref(null)

// Rôles avec leur route de redirection dédiée
const roles = [
  { emoji: '👑', label: 'Boss',        role: 'OWNER',     route: '/pilot' },
  { emoji: '📊', label: 'Manager',     role: 'MANAGER',   route: '/pilot' },
  { emoji: '🍳', label: 'Chef cuisine',role: 'CUISINE',   route: '/cuisine' },
  { emoji: '🧾', label: 'Inventaire',  role: 'INVENTAIRE',route: '/stock' },
  { emoji: '📦', label: 'Ventes',      role: 'VENTES',    route: '/caisse' },
  { emoji: '📊', label: 'Achats',      role: 'ACHATS',    route: '/stock/receptions' },
  { emoji: '🍽', label: 'Serveur',     role: 'SERVEUR',   route: '/caisse' },
]

async function quickLoginAs(r) {
  loadingRole.value = r.role
  authStore.error = null
  try {
    const ok = await authStore.quickLogin(r.role)
    if (ok) router.push(r.route)
  } finally {
    loadingRole.value = null
  }
}

async function handleLogin() {
  authStore.error = null
  try {
    const ok = await authStore.login(email.value, password.value, 'OWNER')
    if (ok) router.push('/pilot')
  } catch (e) { /* erreur dans le store */ }
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
.demo-role-badge {
  font-size: 9px; background: #059669; color: #fff;
  padding: 1px 5px; border-radius: 6px; font-weight: 600;
}
</style>