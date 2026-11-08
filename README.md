# 🧾 Tipsmana Mobile PWA

Application mobile de gestion restaurant — **Vue 3 + Vite + PWA**.

Dédiée aux équipes en salle, cuisine, stock et pilotage. Interface mobile-first avec navigation par rôle, mode hors-ligne et notifications temps réel.

---

## 📦 Stack

| Couche | Technologie |
|--------|-------------|
| **Framework** | Vue 3 (`<script setup>` SFCs, Composition API) |
| **Build** | Vite 8 |
| **State** | Pinia (stores) |
| **Router** | vue-router 4 (`/mobile/` base path) |
| **PWA** | vite-plugin-pwa 2 (Workbox, SW auto-update) |
| **Styling** | Scoped CSS, dark/light theme via custom properties |
| **Tests** | Vitest 3 + @vue/test-utils + happy-dom |
| **HTTP** | `fetch()` wrapper avec JWT Bearer, auto-refresh 401, file d'attente offline |

---

## 🧭 Pages / Routes

| Route | Page | Rôle requis |
|-------|------|-------------|
| `/login` | Login | — |
| `/pilot` | Dashboard pilotage | OWNER, MANAGER |
| `/caisse` | Caisse / Tickets | OWNER, MANAGER, VENTES, SERVEUR |
| `/cuisine` | Écran cuisine (KDS) | OWNER, MANAGER, CUISINE |
| `/cuisine/board` | **KDS en colonnes** (glisser-déposer, minuteur) | OWNER, MANAGER, CUISINE |
| `/stock` | Scan inventaire | OWNER, MANAGER, INVENTAIRE |
| `/stock/receptions` | Réceptions | OWNER, MANAGER, ACHATS |
| `/stock/express` | Inventaire express | Tous (authed) |
| `/stock/:id` | Détail session stock | Tous (authed) |
| `/scan` | **Scan QR / code-barres** | Tous (authed) |
| `/notifications` | **Notifications** | Tous (authed) |
| `/profile` | **Profil** | Tous (authed) |
| `/validations` | Validations pilotage | Tous (authed) |
| `/service` | Tables (sélection, **fusion**) | OWNER, MANAGER, VENTES, SERVEUR |
| `/service/report` | **Rapport de fin de service** (export PDF / partage) | OWNER, MANAGER, VENTES, SERVEUR |
| `/service/table/:n` | Prise de commande (édition panier, **séparation**, QR note client) | OWNER, MANAGER, VENTES, SERVEUR |
| `/note/:ticketId` | **Écran client** (lecture seule, sans connexion) | Public |

---

## ✅ Pages vérifiées

### 🔔 Notifications

- **Chargement** : squelettes animés pendant le fetch
- **Liste paginée** : 20 par page, bouton « Voir plus »
- **Read/Unread** : barre gauche violette + pastille de non-lue
- **Marquage individuel** : `PUT /notifications/{id}/read` au clic
- **Marquage tout lu** : `PUT /notifications/mark-all-read`
- **Polling 30s** : vérification légère du compteur de non-lues
- **Pull-to-refresh** : tactile (touchstart/touchmove/touchend)
- **Compteur en temps réel** : badge rouge dans la nav bottom
- **Priorité** : pastille colorée (urgent/high/medium/low)
- **TimeAgo** : affichage relatif (à l'instant, X min, Xh, Xj…)

### 👤 Profil

- **Carte identité** : avatar + nom/email + badge rôle
- **Édition prénom/nom/téléphone** : `PUT /auth/profile`
- **Changement mot de passe** : `POST /auth/password/change`
- **Préférences notifications** : toggles push/email, auto-save via `PUT /notifications/preferences`
- **Infos établissement** : nom, rôle, type (lecture seule)
- **Déconnexion** : nettoie le store + localStorage

### 📷 Scan QR

- **Bouton caméra** : `input[type=file][capture=environment]` → détection via `BarcodeDetector` (navigateur)
- **Saisie manuelle** : champ numérique + bouton OK
- **Lookup backend** : `GET /inventory/barcode/lookup?code=...`
- **Détection QR table** : pattern `table:N` → redirige vers `/caisse?table=N` (zéro API)
- **Gestion d'erreurs** :
  - 404 → message « Aucun produit pour le code X »
  - Échec réseau → message générique
  - Code-barres non détecté → invite à saisir manuellement
- **Résultat** : affiche code, nom produit, stock théorique

---

## 🔌 API Endpoints utilisés

### Auth
| Méthode | Path | Usage |
|---------|------|-------|
| POST | `/auth/login` | Connexion |
| POST | `/auth/refresh` | Refresh JWT |
| GET | `/auth/me` | Charger le profil |
| PUT | `/auth/profile` | Modifier le profil |
| POST | `/auth/password/change` | Changer mot de passe |

### Notifications
| Méthode | Path | Usage |
|---------|------|-------|
| GET | `/notifications?page=&per_page=` | Liste paginée |
| GET | `/notifications/unread-count` | Compteur nav |
| PUT | `/notifications/{id}/read` | Marquer lue |
| PUT | `/notifications/mark-all-read` | Tout marquer lu |
| GET | `/notifications/preferences` | Préférences |
| PUT | `/notifications/preferences` | Sauvegarder préférences |

### Scan / Inventaire
| Méthode | Path | Usage |
|---------|------|-------|
| GET | `/inventory/barcode/lookup?code=` | Lookup code-barres |
| GET | `/inventory/products/lookup/barcode/{code}` | ❌ N'existe pas dans le backend (utiliser le query-param ci-dessus) |

### Génériques
| Méthode | Path | Usage |
|---------|------|-------|
| GET | `/settings/general-settings/{key}` | Settings |
| GET | `/settings/payment-methods` | Méthodes de paiement |
| GET | `/products/categories/tree` | Arborescence catégories |
| GET | `/products` | Liste produits |
| POST | `/inventory/sessions` | Créer session inventaire |
| GET | `/inventory/sessions` | Lister sessions |
| POST | `/cash/dispatch` | Dispatch sans ticket |
| POST | `/sales/entries` | Créer entrée vente |

### Service en salle — fusion / séparation / écran client
| Méthode | Path | Usage |
|---------|------|-------|
| POST | `/table-tickets/merge` | ⏳ À implémenter backend — `{ table_numbers: [4,5], target_table: 4 }` → note fusionnée (`merged_tables` optionnel dans la réponse) |
| POST | `/table-tickets/split` | ⏳ À implémenter backend — `{ table_number: 4, splits: [{ table_number: 5, item_ids: [...] }] }` → `{ tickets: [...] }` |
| GET | `/public/table-tickets/{ticket_id}` | ⏳ À implémenter backend — lecture seule **sans jeton** (même forme que `GET /table-tickets/{n}`), pour le client qui scanne le QR |

> Écran client : le QR encode `/mobile/note/{ticketId}?t={table}#s={instantané}`. L'instantané (base64url, dans le fragment, jamais envoyé au serveur) s'affiche immédiatement et sert de repli tant que l'endpoint public n'existe pas ; sur un appareil connecté, la note est relue via `GET /table-tickets/{n}`. Rafraîchissement toutes les 10 s.

### Statut commande, KDS en colonnes, rapport de service
| Méthode | Path | Usage |
|---------|------|-------|
| GET | `/mobile/orders/{ticket_id}/status` | ⏳ À implémenter backend — `{ status: pending\|preparing\|ready\|served }`. Repli automatique (après un 404 « Not Found ») sur `GET /cash/tickets/{ref}/kitchen-status` |
| PATCH | `/kds/orders/{id}/status` | ⏳ À implémenter backend — `{ status }`. Repli sur `POST /cash/kds/cuisine/orders/{id}/validate` (un appel par cran, **avant uniquement** : pas de retour arrière) |
| GET | `/mobile/service-report?date=YYYY-MM-DD` | ⏳ À implémenter backend — `{ total_revenue, covers, tickets_count, tables_count, payments: [{ method, amount }], top_items: [{ name, quantity, amount }] }` (variantes de noms acceptées, voir `src/shared/serviceReport.js`) |

> Notifications de statut : relevé toutes les 15 s des notes envoyées depuis le téléphone ; dès qu'un push `order_status` arrive via le service worker, le relevé passe à 60 s. Chaque alerte (prête / servie) : toast + vibration, notification système si l'app est en arrière-plan, +1 sur le badge de l'icône (remis à zéro à l'ouverture de « Commandes en cours »).

> L'API est préfixée par `/api/v1` en production (configurable via `VITE_API_URL`).

---

## 🏗️ Architecture

```
── src/
   ├── App.vue              # Layout, bottom-nav, polling notif
   ├── main.js              # Entry point, Pinia + router init
   ├── router.js            # Routes + guard auth/rôle
   ├── style.css            # Global styles
   ├── i18n/                # Multi-langue maison (fr par défaut, en, es)
   │   ├── index.js         # t(), setLocale(), useI18n(), plugin $t
   │   └── locales/
   │       ├── fr/*.json    # Un fichier par namespace ({ "<ns>": { … } })
   │       ├── fr.core.js   # Chunk chargé avant le mount (common, ui, login)
   │       └── fr.full.js   # Chunk des écrans, chargé en arrière-plan
   ├── components/          # Composants réutilisables
   │   ├── LanguageSwitcher.vue  # Sélecteur de langue (profils)
   │   ├── TipsIcon.vue     # Icônes SVG dynamiques
   │   └── HelloWorld.vue   # (demo)
   ├── shared/              # Couches partagées
   │   ├── api.js           # ApiClient (JWT, refresh, offline queue)
   │   ├── auth.js          # Auth reactive + localStorage
   │   ├── offlineStore.js  # File d'attente offline (inventaire)
   │   ├── useTheme.js      # Thème dark/light
   │   └── ThemeToggle.vue
   ├── stores/
   │   └── authStore.js     # Pinia store auth
   └── views/
       ├── Login.vue        # Connexion + quick-login rôles
       ├── Notifications.vue
       ├── Profile.vue
       ├── Cuisine.vue
       ├── caisse/          # Tickets, CaisseCart
       ├── cuisine/         # Orders
       ├── pilot/           # Dashboard, Validations
       └── stock/           # ScanQR, InventoryScan, ExpressScan,
                            # Receptions, StockDetail
```

### Multi-langue (i18n)

- `const { t } = useI18n()` dans les composants, `import { t } from '../i18n'` dans les modules JS (appel au moment de l'affichage, jamais au chargement du module).
- Interpolation `t('common.table', { number: 4 })`, pluriel `"{count} article | {count} articles"` choisi par `count` (en français, le singulier couvre 0 et 1).
- Choix mémorisé en `localStorage` (`tipsmana_locale`), sélecteur dans *Mon profil* (service) et *Profil*.
- Les données envoyées au backend (notes cuisine, valeurs d'options, note comptable) restent en français ; seul l'affichage est traduit.
- Ajouter une langue : dossier `locales/<code>/` (mêmes fichiers et clés que `fr/`, vérifié par les tests), `locales/<code>.core.js` + `.full.js`, entrée dans `LOCALES`.

### Statut des tables (Service)

🟢 libre · 🔴 occupée · 🟡 réservée · ⚪ en attente (addition demandée — statut backend `addition`). Badge + couleur de fond par table, légende avec compteurs, filtre « Masquer les tables libres » mémorisé sur l'appareil, rafraîchissement toutes les 30 s (suspendu quand l'onglet est masqué, relancé au retour).

### Flux de données

```
Browser / PWA
  │
  ├── api.js (fetch + JWT) ── HTTPS ──▶ Backend FastAPI (:8000)
  │                                      ( /api/v1/* )
  │
  ├── localStorage
  │   ├── tipsmana_token        # JWT + refresh
  │   └── tipsmana_offline_*    # Queue offline
  │
  └── PWA Service Worker (Workbox)
      ├── Cache API (NetworkFirst)
      ├── Manifest (standalone, portrait)
      └── Offline fallback
```

### Dépendances principales

| Package | Rôle |
|---------|------|
| `vue@^3.5` | Framework |
| `vue-router@^4.6` | Routing |
| `pinia@^4.1` | State management |
| `vite-plugin-pwa@^2` | Manifest + Service Worker |
| `qrcode@^1.5` | QR code de la note client |
| `vitest@^3 + @vue/test-utils` | Tests unitaires |

---

## 🚧 Développement

```bash
# Installer les dépendances
npm install

# Serveur de dev (Vite, hot-reload)
npm run dev
# → http://localhost:5199/mobile/
# L'API est proxifiée vers http://127.0.0.1:8000

# Tests unitaires
npm run test:unit          # Vitest (23 tests, 2 suites)
npm run test               # Vérification endpoints API

# Preview production
npm run build && npm run preview
```

---

## 📦 Build & Déploiement

```bash
npm run build
```

Généré dans `dist/` :
```
dist/
├── assets/                 # JS/CSS chunkés
├── icons/                  # PWA icons
├── favicon.png
├── manifest.webmanifest
├── sw.js                   # Service Worker (Workbox)
├── workbox-*.js
└── index.html
```

Le build copie aussi `public/registerSW.js` dans `dist/registerSW.js`.

### Déploiement nginx

La PWA est servie sous le chemin `/mobile/` :

```nginx
location /mobile/ {
    alias /chemin/vers/tipsmana-mobile-pwa/dist/;
    try_files $uri $uri/ /mobile/index.html;
    expires 1y;
    add_header Cache-Control "public, immutable";

    # API proxy (optionnel — le backend peut être ailleurs)
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
    }
}
```

### Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `VITE_API_URL` | `/api/v1` | Base URL de l'API backend |

---

## 🧪 Tests

```bash
# Tests unitaires Vue (Vitest)
npm run test:unit
# → 12 suites, 177 tests

# Vérification endpoints API (statique)
npm run test
# → Scanne les appels api.*() dans les vues et les confronte
#   à la liste des endpoints backend connus
```

Les tests unitaires couvrent :
- **Notifications.vue** (14 tests) : rendu, skeleton, liste, marquage lu/tout lu, pagination, timeAgo, erreur
- **ScanQR.vue** (9 tests) : rendu, lookup manuel, détection QR table, gestion d'erreurs 404/réseau

---

## 🗺️ Documentation complémentaire

- `ARCHITECTURE-POS-MOBILE.md` — Architecture POS mobile, paiement NFC, Capacitor, SumUp, KDS WebSocket, impression WiFi Epson.