/**
 * App client — paiement de l'addition depuis le téléphone du client
 *
 * Endpoint demandé (public, sans JWT ; absent du backend, vérifié 2026-11-10 —
 * seul POST /payments/sumup/checkout existe, et il exige un JWT de l'équipe) :
 *  - POST /public/tickets/{ticketId}/checkout[?token=…]
 *      { provider: 'stripe' | 'lynx', amount, table_number, return_url }
 *    → { url } (page de paiement hébergée du prestataire)
 *
 * Prestataires proposés : VITE_GUEST_PAYMENT_PROVIDERS (défaut « stripe,lynx »,
 * vide = aucun). Sans route de paiement, ou au choix du client : « payer par
 * carte à table » → appel serveur (« Paiement par carte ») + QR code à montrer
 * au serveur, qui le scanne depuis l'app équipe et ouvre directement la note.
 *
 * Retour du prestataire : return_url = page client + ?paid=1 (ou ?paid=0).
 */
import { guestUrl } from './guestTicket'

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'

export const KNOWN_PROVIDERS = {
  stripe: { code: 'stripe', icon: '💳', label: 'Stripe' },
  lynx: { code: 'lynx', icon: '📱', label: 'Lynx' },
}

export function paymentProviders(raw = import.meta.env.VITE_GUEST_PAYMENT_PROVIDERS) {
  const list = raw == null ? 'stripe,lynx' : String(raw)
  return list.split(',').map(s => s.trim().toLowerCase()).filter(code => KNOWN_PROVIDERS[code]).map(code => KNOWN_PROVIDERS[code])
}

export function checkoutPath(ticketId, token) {
  const qs = token ? `?token=${encodeURIComponent(token)}` : ''
  return `/public/tickets/${encodeURIComponent(ticketId)}/checkout${qs}`
}

/** Page client où revenir après paiement. */
export function paymentReturnUrl({ table, establishmentId }, opts) {
  const url = guestUrl({ table, establishmentId }, opts)
  return `${url}${url.includes('?') ? '&' : '?'}paid=1`
}

/** Seules les pages de paiement en https (ou relatives au site) sont suivies. */
export function isSafeCheckoutUrl(url, origin = typeof window !== 'undefined' ? window.location.origin : '') {
  try {
    const u = new URL(url, origin || undefined)
    return u.protocol === 'https:' || (origin && u.origin === origin)
  } catch {
    return false
  }
}

/**
 * Demande la page de paiement. Renvoie { ok: true, url } ou { ok: false, reason }
 * avec reason ∈ noTicket | offline | unavailable (route absente) | error.
 */
export async function startGuestPayment({ ticketId, token, table, establishmentId, provider, amount }, {
  fetchImpl = globalThis.fetch,
  returnUrl = null,
} = {}) {
  if (!ticketId) return { ok: false, reason: 'noTicket' }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' }
  let res
  try {
    res = await fetchImpl(`${API_BASE}${checkoutPath(ticketId, token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        provider,
        amount,
        table_number: table,
        return_url: returnUrl || paymentReturnUrl({ table, establishmentId }),
      }),
    })
  } catch {
    return { ok: false, reason: 'offline' }
  }
  if ([404, 405, 501].includes(res.status)) return { ok: false, reason: 'unavailable' }
  if (!res.ok) return { ok: false, reason: 'error' }
  let data
  try {
    data = await res.json()
  } catch {
    return { ok: false, reason: 'error' }
  }
  const url = data?.data?.url ?? data?.url ?? data?.data?.checkout_url ?? data?.checkout_url ?? data?.hosted_checkout_url
  if (!url || !isSafeCheckoutUrl(url)) return { ok: false, reason: 'error' }
  return { ok: true, url }
}

/** Retour du prestataire : 'paid' | 'cancelled' | null. */
export function paymentReturnStatus(route) {
  const v = route?.query?.paid
  const s = String((Array.isArray(v) ? v[0] : v) ?? '')
  if (s === '1' || s === 'true') return 'paid'
  if (s === '0' || s === 'false') return 'cancelled'
  return null
}

/**
 * Contenu du QR « payer à table » : le lien de la table, lu par le scanner QR
 * de l'app équipe (parseTableQr reconnaît …/guest/{table}) → ouvre la note.
 */
export function tablePaymentQr({ table, establishmentId }, opts) {
  const url = guestUrl({ table, establishmentId }, opts)
  return `${url}${url.includes('?') ? '&' : '?'}pay=card`
}
