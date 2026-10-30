<template>
  <div class="layout cuisine-layout">
    <header class="cuisine-header">
      <div class="header-left">
        <button class="back-btn" @click="$router.push('/pilot')">←</button>
        <h1>🍳 Cuisine</h1>
      </div>
      <div class="header-right">
        <span class="badge urgent">3 urgent</span>
      </div>
    </header>
    <main class="cuisine-main">
      <div class="order-grid">
        <div class="order-card" v-for="n in 4" :key="n">
          <div class="order-header">
            <span class="table-tag">Table 4{{ n }}</span>
            <span class="time">12:3{{ n }}</span>
          </div>
          <div class="order-items">
            <span class="item">Bourguignon ×2</span>
            <span class="item">Salade verte ×1</span>
            <span class="item tag">Sans oignon</span>
          </div>
          <button class="ready-btn">✅ Prêt</button>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.cuisine-layout { min-height: 100vh; background: #1a1a2e; color: #e0e0e0; font-family: inherit; }
.cuisine-header { background: #16213e; padding: 1rem; display: flex; justify-content: space-between; align-items: center; }
.back-btn { background: none; border: none; color: #4af; font-size: 1.2rem; cursor: pointer; }
.badge { background: #e74c3c; color: #fff; padding: 0.3rem 0.8rem; border-radius: 12px; font-size: 0.85rem; }
.order-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; padding: 1rem; }
.order-card { background: #1e2a3a; border-radius: 12px; padding: 1rem; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
.order-header { display: flex; justify-content: space-between; margin-bottom: 0.5rem; }
.table-tag { background: #3498db; color: #fff; padding: 0.2rem 0.6rem; border-radius: 6px; }
.time { color: #7f8c8d; font-size: 0.85rem; }
.order-items { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.item { background: #2c3e50; padding: 0.3rem 0.8rem; border-radius: 8px; }
.tag { background: #f39c12; color: #222; font-size: 0.8rem; }
.ready-btn { width: 100%; padding: 0.8rem; margin-top: 0.5rem; background: #27ae60; color: #fff; border: none; border-radius: 8px; font-size: 1.1rem; cursor: pointer; }
</style>