<template>
  <div class="stock-view">
    <header class="page-header">
      <h2>📦 Stock</h2>
    </header>

    <div class="scan-card" @click="$router.push('/scan')">
      <span class="scan-icon">📷</span>
      <div>
        <strong>Scanner un produit</strong>
        <p>QR code ou code-barres</p>
      </div>
    </div>

    <div class="quick-links">
      <router-link to="/stock/sessions" class="link-card">
        <strong>Sessions en cours</strong>
        <p>0 session active</p>
      </router-link>
      <router-link to="/stock/receptions" class="link-card">
        <strong>Réceptions</strong>
        <p>Livraisons en attente</p>
      </router-link>
    </div>
  </div>
</template>