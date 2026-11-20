/**
 * Notification sounds — Web Audio API, zero file dependencies.
 *
 * Canonical chime patterns used across all Tipsmana views.
 * Import from here instead of duplicating AudioContext logic.
 */

let audioCtx = null

/**
 * Lazy-init AudioContext (singleton). Resumes if suspended.
 * Call once before any play function, or let the play functions call it.
 */
export function unlockAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (Ctx) audioCtx = new Ctx()
    }
    if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {})
  } catch { /* audio indisponible */ }
  return audioCtx
}

function _playNote(ctx, freq, start, duration, type = 'sine', gainVal = 0.3) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  gain.gain.setValueAtTime(gainVal, start)
  gain.gain.exponentialRampToValueAtTime(0.01, start + duration)
  osc.start(start)
  osc.stop(start + duration)
}

/**
 * Double-chime « nouvelle commande » — 2 notes montantes.
 * Fréquences canoniques : La5 (880 Hz) puis Do#6 (1174.66 Hz).
 * Décalage de 160 ms entre les deux notes.
 */
export function playNewOrderSound() {
  const ctx = unlockAudio()
  if (!ctx) return
  try {
    const t0 = ctx.currentTime
    _playNote(ctx, 880, t0, 0.35)
    _playNote(ctx, 1174.66, t0 + 0.16, 0.3)
  } catch { /* silencieux */ }
}

/**
 * Alarme d'urgence — 3 impulsions basses + 1 note aiguë.
 * Utilisée pour les commandes en retard (> 15 min).
 */
export function playUrgencySound() {
  const ctx = unlockAudio()
  if (!ctx) return
  try {
    const t0 = ctx.currentTime
    _playNote(ctx, 660, t0, 0.15, 'square', 0.25)
    _playNote(ctx, 440, t0 + 0.2, 0.15, 'square', 0.25)
    _playNote(ctx, 330, t0 + 0.4, 0.2, 'square', 0.25)
    _playNote(ctx, 1320, t0 + 0.1, 0.35, 'sawtooth', 0.15)
  } catch { /* silencieux */ }
}
