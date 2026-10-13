# Architecture POS Mobile — Tipsmana

> **Problème** : Les serveurs prennent déjà les commandes sur leur téléphone via la PWA existante. Comment accepter les paiements par carte bancaire directement sur le téléphone du serveur grâce au NFC ?

---

## 1. Téléphone comme terminal de paiement

### 1.1 SumUp Android Tap-to-Pay SDK — la cible prioritaire

SumUp propose un **SDK Android dédié au Tap-to-Pay** qui utilise le NFC intégré du téléphone — **zéro matériel supplémentaire**.

| Propriété | Valeur |
|---|---|
| Appairage | NFC du téléphone (pas de lecteur Bluetooth) |
| OS | Android 11+ |
| Langage | Kotlin 2.0+ (SDK 1.1.6+) |
| Authentification | OAuth 2.0 ou Secret API key |
| PIN | Supporté pour les montants > sans-contact |
| PCI | Oui — les données de carte ne passent jamais par le téléphone |
| Mode offline | Store-and-forward supporté |
| Test | Credentials développeur sans frais réels |

⚠️ **Le SDK SumUp Android Tap-to-Pay est un SDK natif (Java/Kotlin). Il ne peut PAS être appelé depuis un navigateur ou une PWA.** Il nécessite un module Android natif (ou un plugin Capacitor).

### 1.2 SumUp iOS SDK — lecteur Bluetooth uniquement

Sur iOS, **Apple ne donne pas accès NFC aux applications tierces** (pas de « Tap to Pay on iPhone » en dehors de Stripe/Apple). SumUp iOS SDK se connecte à un lecteur Bluetooth SumUp (Solo Lite, Solo, Air, 3G, PIN+).

| Propriété | Valeur |
|---|---|
| Appairage | Lecteur Bluetooth SumUp (pas de NFC téléphone) |
| OS | iOS 15+ |
| Authentification | OAuth 2.0 |
| PCI | Oui |
| Installation | SDK iOS natif (Swift/ObjC) |

### 1.3 Stripe Terminal — alternative

Stripe Terminal propose aussi :
- **Android** : Tap to Pay on Android (version 4.3.0+, Android 13+)
- **iPhone** : Tap to Pay on iPhone (iPhone XS+, iOS 16+, nécessite une entitlement Apple Developer)
- Lecteurs physiques : Stripe S700/S710/V660p/contactless

Mais **Stripe Terminal n'est pas activé en France pour les petits commerces** en pratique (réservé aux comptes Stripe éligibles). **SumUp est le choix réaliste** pour un restaurant français.

### 1.4 À retenir

| Plateforme | Paiement NFC sur le téléphone | Lecteur Bluetooth externe |
|---|---|---|
| Android | ✅ SumUp Tap-to-Pay SDK (NFC natif) | ✅ SumUp Android SDK (BLE) |
| iOS | ❌ (pas de NFC tierce) | ✅ SumUp iOS SDK (lecteur BLE) |

---

## 2. Flow complet — de la commande au ticket

```
┌──────────────────────────────────────────────────────────────────┐
│                        SERVEUR EN SALLE                           │
│  ┌───────────────────┐     ┌──────────────────┐                  │
│  │  1. Badge NFC /   │     │   2. Prend la     │                  │
│  │    PIN serveur    │────▶│   commande (PWA)  │                  │
│  └───────────────────┘     └────────┬─────────┘                  │
│                                     │                            │
│                                     ▼                            │
│                          ┌─────────────────────┐                 │
│                          │  3. Envoie au KDS    │                 │
│                          │  (WebSocket → cuisine)│                │
│                          └──────────┬──────────┘                 │
│                                     │                            │
│                                     ▼                            │
│                          ┌─────────────────────┐                 │
│                          │  4. Client paie CB    │                 │
│                          │  sur le tel du serveur │               │
│                          │  (NFC Android /       │               │
│                          │   Lecteur iOS /        │               │
│                          │   Lien de paiement )   │               │
│                          └──────────┬──────────┘                 │
│                                     │                            │
│                                     ▼                            │
│                          ┌─────────────────────┐                 │
│                          │  5. Ticket imprimé   │                 │
│                          │  (Imprimante WiFi     │                 │
│                          │   Epson via ePOS-Print│                │
│                          │   API HTTP)            │               │
│                          └─────────────────────┘                 │
└──────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                     CUISINE (KDS)                                 │
│  ┌──────────────────────────────────────────┐                    │
│  │  Écran mural (tablette/Android/PC)        │                    │
│  │  WebSocket temps réel :                   │                    │
│  │  • Nouvelle commande → apparaît en vert    │                    │
│  │  • En préparation → jaune                  │                    │
│  │  • Prêt → rouge / retiré → gris            │                    │
│  │  • Timer ticking sur chaque commande        │                    │
│  └──────────────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────────┘
```

### Détail du flow

```
[SERVEUR]                    [BACKEND FastAPI]              [CUISINE KDS]
    │                              │                             │
    ├─ POST /auth/login ──────────▶│                             │
    │◀────── JWT + badge ─────────┤                             │
    │                              │                             │
    ├─ POST /orders ──────────────▶│                             │
    │  {table, items, notes}      │                             │
    │                              ├── WebSocket broadcast ────▶│
    │                              │   order.received            │
    │◀── 201 + order_id ──────────┤                             │
    │                              │                             │
    │  (client decide de payer)    │                             │
    │                              │                             │
    ├─ POST /payments/intent ─────▶│                             │
    │  {order_id, amount}         │                             │
    │◀── {checkout_id, ref} ──────┤                             │
    │                              │                             │
    │  [APP native SumUp SDK]      │                             │
    │  initCheckout → client tape  │                             │
    │  CB sur le téléphone NFC     │                             │
    │                              │                             │
    │◀── SDK return success ──────┤                             │
    │                              │                             │
    ├─ POST /payments/confirm ────▶│                             │
    │  {checkout_id, status}      │                             │
    │                              ├── WebSocket ──────────────▶│
    │                              │   order.paid                │
    │                              │                             │
    │                              ├─ POST /printers/ticket ────▶│
    │                              │   [Imprimante WiFi Epson]   │
    │                              │   ← HTTP POST SOAP/XML     │
    │                              │                             │
    │◀── Ticket imprimé ──────────┤                             │
```

---

## 3. Architecture technique

### 3.1 PWA vs App Native — le verdict

| Composant | PWA (existante) | Native (Capacitor) |
|---|---|---|
| Prise de commande | ✅ Vue 3 + Vite — OK | — |
| Menu / catalogue | ✅ OK | — |
| WebSocket KDS | ✅ OK (navigateur) | — |
| Impression WiFi (ePOS-Print API HTTP) | ✅ OK (HTTP POST) | — |
| SumUp Android Tap-to-Pay | ❌ **Impossible** | ✅ **Requis** |
| SumUp iOS (lecteur BLE) | ❌ **Impossible** | ✅ **Requis** |
| NFC badge serveur | ❌ **Impossible** | ✅ **Requis** |
| Notifications push iOS | ⚠️ Limité | ✅ Plein |

### 3.2 Architecture recommandée : Hybride PWA + Capacitor

```
┌─────────────────────────────────────────────────────────────────┐
│                    TÉLÉPHONE DU SERVEUR                          │
│                                                                  │
│  ┌──────────────────────────────────────────────┐                │
│  │                                              │                │
│  │   PWA Tipsmana (Vue 3 + Vite)                │                │
│  │   ──────────────────────────                  │                │
│  │   • Prise de commande (existante)             │                │
│  │   • Menu / catalogue                           │                │
│  │   • KDS WebSocket client                       │                │
│  │   • Dashboard / stock (existants)              │                │
│  │   • Impression ePOS-Print (HTTP)               │                │
│  │                                              │                │
│  └───────────────┬──────────────────────────────┘                │
│                  │  intégrée dans                              │
│                  ▼                                              │
│  ┌──────────────────────────────────────────────┐                │
│  │                                              │                │
│  │   Capacitor (Vue → Android + iOS)            │                │
│  │   ──────────────────────────                  │                │
│  │   • SumUp SDK (Android Tap-to-Pay native)    │                │
│  │   • SumUp iOS SDK (lecteur BLE)              │                │
│  │   • Epson ePOS SDK (Bluetooth, fallback)     │                │
│  │   • NFC badge serveur (lecture)              │                │
│  │   • App Store / Play Store distribution      │                │
│  │                                              │                │
│  └──────────────────────────────────────────────┘                │
│                                                                  │
│  Communication PWA ↔ Native : JS Bridge (Capacitor Events)      │
│  Exemple : PWA appelle `this.payments.charge(amount)`           │
│           Capacitor plugin → SumUp SDK → callback → PWA         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.3 Schéma détaillé

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TELEPHONE SERVEUR (Client-side)                  │
│                                                                     │
│  ┌─────────────────────────────────────┐                           │
│  │           PWA (Vue 3 / Vite)        │                           │
│  │  ┌───────────────────────────────┐  │                           │
│  │  │  OrderModule (prise commande) │  │                           │
│  │  ├───────────────────────────────┤  │                           │
│  │  │  KDS WebSocket Client         │  │  ◀── WebSocket ──────────▶│
│  │  │  (socket.io / ws)             │  │                           │
│  │  ├───────────────────────────────┤  │                           │
│  │  │  ReceiptPrint (HTTP ePOS)     │  │  ◀── HTTP ───────────────▶│
│  │  └───────────────────────────────┘  │                           │
│  └────────────────┬────────────────────┘                           │
│                   │ JS Payload                                     │
│                   ▼                                                 │
│  ┌─────────────────────────────────────┐                           │
│  │       Capacitor Native Shell        │                           │
│  │                                     │                           │
│  │  ┌───────────────────────────────┐  │                           │
│  │  │  SumUpAndroidTapToPayPlugin   │──┼── SDK SumUp Android ─────▶│
│  │  │  (NFC du téléphone)           │  │                           │
│  │  ├───────────────────────────────┤  │                           │
│  │  │  SumUpIosPlugin               │──┼── Lecteur BLE SumUp ─────▶│
│  │  │  (lecteur Bluetooth SumUp)    │  │                           │
│  │  ├───────────────────────────────┤  │                           │
│  │  │  EpsonEPOSBluetoothPlugin     │──┼── Imprimante BT ─────────▶│
│  │  │  (fallback impression BT)     │  │                           │
│  │  ├───────────────────────────────┤  │                           │
│  │  │  NFCBadgePlugin               │──┼── Badge NFC ─────────────▶│
│  │  │  (auth serveur)               │  │                           │
│  │  └───────────────────────────────┘  │                           │
│  └─────────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘

                          │ REST API (HTTPS)
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND (Python / FastAPI)                       │
│                                                                     │
│  ┌─────────────────────────────────────┐                           │
│  │  REST API Auth (JWT)                │                           │
│  ├─────────────────────────────────────┤                           │
│  │  ORDERS CRUD                        │                           │
│  ├─────────────────────────────────────┤                           │
│  │  Payments (SumUp Cloud API)         │── HTTPS ──▶ SumUp Cloud   │
│  ├─────────────────────────────────────┤                           │
│  │  WebSocket Hub (Redis Pub/Sub)      │── WS ─────▶ KDS / Serveurs│
│  ├─────────────────────────────────────┤                           │
│  │  Print Proxy (template → XML)       │── HTTP ───▶ Imprimante    │
│  └─────────────────────────────────────┘                           │
│                                                                     │
│  ┌────────────────────────┐  ┌────────────────┐                    │
│  │  MariaDB (Tipsmana)     │  │  Redis (WS hub) │                   │
│  └────────────────────────┘  └────────────────┘                    │
└─────────────────────────────────────────────────────────────────────┘

                          │ WebSocket (temps réel)
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CUISINE KDS (Tablette / Écran mural)             │
│                                                                     │
│  ┌─────────────────────────────────────┐                           │
│  │  KDS Web (Vue 3 / Vue Router)       │                           │
│  │  ─────────────────                   │                           │
│  │  • Kanban : À faire / En cours / Prêt │                           │
│  │  • Timer ticking sur chaque item     │                           │
│  │  • Couleurs : nouveau=vert, urgent=rouge│                         │
│  │  • Statut update via WebSocket        │                           │
│  │  • Fallback polling (toutes les 5s)   │                           │
│  └─────────────────────────────────────┘                           │
│                                                                     │
│  Connexion : Écran Android (Google Play) ou tablette                │
│  ou Raspberry Pi (chrome --kiosk) fixé au mur                       │
└─────────────────────────────────────────────────────────────────────┘

                          │ HTTP (SOAP/XML)
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    IMPRIMANTE WiFi (Epson TM)                       │
│                                                                     │
│  TM-T88 / TM-m30 / TM-m50 (WiFi ou Ethernet)                       │
│  ┌─────────────────────────────────────┐                           │
│  │  Serveur HTTP intégré (ePOS-Print)  │                           │
│  │  POST /cgi-bin/epos/service.cgi     │                           │
│  │  ─────────────────                   │                           │
│  │  Requête : SOAP/XML ou JSON          │                           │
│  │  Réponse : success + statut          │                           │
│  │  Découpage papier automatique        │                           │
│  └─────────────────────────────────────┘                           │
│                                                                     │
│  Adresse : http://192.168.x.x/cgi-bin/epos/service.cgi             │
│            ?devid=local_printer&timeout=10000                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.4 Composants techniques

#### Backend — WebSocket hub (KDS temps réel)

```python
# Architecture WebSocket (FastAPI + Redis Pub/Sub)

# Chaque restaurant = un "channel group" par établissement
# Schéma : ws://api.tipsmana.com/ws/{establishment_id}
#
# Événements diffusés :
#   order.received    → nouvelle commande
#   order.status      → changement de statut (preparing/ready/served)
#   order.paid        → paiement confirmé
#   order.voided      → annulation
#   order.updated     → modification (items, notes)
#
# Garantie : replay sur reconnexion (sequence_id)
# Fallback : HTTP GET /orders/live?since={sequence_id}

# Stack :
#   FastAPI WebSocket endpoints
#   Redis Pub/Sub (channel = etab:{id})
#   Reconnection : token JWT dans l'URL (ws://?token=xxx)
```

#### Backend — Print Proxy

```python
# Endpoint de print : POST /api/v1/printers/print
# Body : { printer_ip, template: "ticket", data: { items, total, table } }
# → Génère le XML/SOAP ePOS-Print
# → HTTP POST vers http://{printer_ip}/cgi-bin/epos/service.cgi
# → Retourne le statut (success, error)
```

#### Backend — Payments (SumUp Cloud API)

```python
# POST /api/v1/payments/intent
# → Appelle SumUp Create Checkout (REST API)
# → Retourne checkout_id + référence
# 
# POST /api/v1/payments/confirm
# → Vérifie le statut du checkout SumUp
# → Met à jour la commande
# → Déclenche impression + KDS update
```

### 3.5 Communication PWA ↔ Native (Capacitor Bridge)

```javascript
// Dans la PWA — ordre vers paiement
// 1. PWA submit la commande
const order = await api.post('/orders', { table, items, total: 45.50 })

// 2. PWA demande le paiement natif via Capacitor bridge
//    (ceci appelle le plugin Capacitor → SumUp SDK)
try {
  const result = await window.capacitor?.plugins?.sumup?.charge({
    amount: order.total,
    currency: 'EUR',
    orderId: order.id
  })
  
  if (result.success) {
    // 3. Confirmation au backend
    await api.post(`/orders/${order.id}/pay`, {
      checkoutId: result.checkoutId,
      paymentMethod: 'contactless_nfc'
    })
    
    // 4. Impression du ticket
    await api.post('/print', { orderId: order.id, printer: 'bar' })
  }
} catch (err) {
  // Fallback : lien de paiement par SMS
  if (err.type === 'nfc_unavailable') {
    await api.post(`/orders/${order.id}/payment-link`)
    // Un SMS avec lien de paiement est envoyé au client
  }
}
```

---

## 4. Quid du Bluetooth pour l'imprimante

### Comparaison WiFi vs Bluetooth

| Critère | WiFi (via ePOS-Print API) | Bluetooth (via ePOS SDK natif) |
|---|---|---|
| **Portée** | Réseau entier | ~10 mètres |
| **Connexion** | TCP/IP permanent (HTTP) | Appairage BLE + déconnexion possible |
| **Multi-émetteurs** | ✅ Plusieurs téléphones → même imprimante | ❌ 1 téléphone → 1 imprimante |
| **iOS** | ✅ Fonctionne depuis tout navigateur | ❌ Nécessite MFi + approbation Apple (jours/semaines) |
| **Android** | ✅ Fonctionne | ✅ SDK natif disponible |
| **PWA** | ✅ Fonctionne directement (HTTP) | ❌ Nécessite module natif |
| **Fiabilité** | ✅ Excellente (TCP fiable) | ⚠️ BLE perte de connexion fréquente |
| **Débit** | ✅ Largement suffisant | ⚠️ Plus lent pour les gros tickets |
| **Installation** | ✅ Config IP sur le réseau | ❌ Appairage par appareil |
| **Prix imprimante** | ≈ même prix (modèles WiFi) | ≈ même prix (modèles BT/WiFi combinés) |

### Recommandation

**1. WiFi/HTTP comme solution primaire (recommandée)**

L'imprimante Epson TM connectée en WiFi (ou Ethernet) est accessible par **n'importe quel appareil du réseau** via HTTP POST sur l'endpoint ePOS-Print. Cela fonctionne :
- Depuis la PWA (pas de native requis)
- Depuis le backend (impression automatique)
- Depuis le KDS (impression de tickets doublon si besoin)

**Le flow :** Le serveur clique "Payer" dans la PWA → le backend reçoit la confirmation → construit le XML ePOS-Print → l'envoie en HTTP POST à l'imprimante WiFi. **Simple, fiable, pas de SDK.**

```
[PWA] ──POST─▶ [Backend] ──XML/SOAP HTTP──▶ [Imprimante WiFi]
```

**2. Bluetooth comme solution portable (secondaire)**

Utile uniquement pour les **imprimantes portables** (Epson TM-P20/P80) qu'un serveur peut avoir à la ceinture pour imprimer à table. Dans ce cas :
- Android : SDK ePOS natif via Capacitor plugin
- iOS : nécessite le processus MFi Epson (délai administration)

### Conclusion Bluetooth

> **Mettez les imprimantes en WiFi.** Le Bluetooth (BLE) est une source de complexité supplémentaire pour un gain nul sur une imprimante fixe de bar/restaurant. Le ePOS-Print API via HTTP est plus simple, plus fiable, fonctionne depuis la PWA, et ne nécessite aucun SDK natif pour l'impression. Réservez le Bluetooth aux rares cas d'usage d'impression mobile à table.

---

## 5. Recommandation synthèse

### Stack finale

| Couche | Technologie |
|---|---|
| Frontend existant | Vue 3 + Vite PWA (conservé) |
| Native shell | **Capacitor** (wrap PWA → Android + iOS) |
| Paiement Android | **SumUp Android Tap-to-Pay SDK** (NFC natif) |
| Paiement iOS | **SumUp iOS SDK** (lecteur Bluetooth SumUp Solo/Air) |
| Impression WiFi | **Epson ePOS-Print API** (XML/SOAP via HTTP — depuis le backend) |
| Impression Bluetooth | **Epson ePOS SDK** (Capacitor plugin, portable seulement) |
| KDS temps réel | **FastAPI WebSocket + Redis Pub/Sub** |
| KDS affichage | Vue 3 PWA ou app Android en mode kiosk |
| Base de données | MariaDB (existante) |
| Backend | Python / FastAPI (existant) |

### Workflow

1. **Le serveur s'authentifie** via badge NFC (plugin Capacitor → lit l'UID → le transmet au backend → obtient le JWT) ou PIN simple dans la PWA
2. **Prend la commande** dans la PWA (existant, à étendre)
3. **Envoie au KDS** via REST API → backend → WebSocket → cuisine
4. **Paiement** : l'app native initie le SDK SumUp → le client tape sa CB sur le téléphone (Android) ou le lecteur (iOS) → résultat retourné au backend
5. **Ticket** : backend génère le XML ePOS-Print → POST à l'imprimante WiFi → ticket imprimé
6. **Fallback** : si le NFC ne fonctionne pas, un lien de paiement est envoyé par SMS au client

### Plan de développement

| Phase | Contenu | Dépend |
|---|---|---|
| **P1** | WebSocket KDS backend + écran cuisine Vue | Rien |
| **P2** | Réception du paiement :
        - Backend SumUp Cloud API (paiement sans SDK → lien ou lien SMS)
        - Impression WiFi (backend → imprimante) | P1 |
| **P3** | Capacitor wrapper de la PWA existante | Rien |
| **P4** | Plugin SumUp Android Tap-to-Pay (NFC natif) | P3 |
| **P5** | Plugin SumUp iOS (lecteur BLE) | P3 |
| **P6** | Badge NFC serveur + plugin Epson BT portable | P3 |

**P1 et P2 sont livrables immédiatement sur la PWA existante (zéro app native).**
Le vrai paiement NFC sur le téléphone (P4/P5) ne peut arriver qu'après le wrapper Capacitor.

---

*Document d'architecture — Tipsmana POS Mobile — Octobre 2026*