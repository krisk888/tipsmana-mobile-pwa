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
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { login } from '../shared/auth'

const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

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
</style>