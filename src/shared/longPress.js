/**
 * Appui long (tactile ou souris) qui cohabite avec le glisser-déposer :
 * déclenché après `delay` ms sans bouger de plus de `tolerance` px.
 *
 *   const lp = createLongPress({ onLongPress: (target) => … })
 *   lp.start(target, x, y)   // touchstart / mousedown
 *   lp.move(x, y)            // touchmove / mousemove (annule au-delà du seuil)
 *   lp.cancel()              // touchend / mouseup
 */
export const LONG_PRESS_MS = 550
export const LONG_PRESS_TOLERANCE_PX = 10

export function createLongPress({ onLongPress, delay = LONG_PRESS_MS, tolerance = LONG_PRESS_TOLERANCE_PX } = {}) {
  let timer = null
  let origin = null

  function cancel() {
    clearTimeout(timer)
    timer = null
    origin = null
  }

  return {
    start(target, x, y) {
      cancel()
      origin = { x, y }
      timer = setTimeout(() => {
        timer = null
        origin = null
        onLongPress?.(target)
      }, delay)
    },
    move(x, y) {
      if (!origin) return
      if (Math.hypot(x - origin.x, y - origin.y) > tolerance) cancel()
    },
    cancel,
    get pending() { return timer != null },
  }
}
