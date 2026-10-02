// Seeded random numbers (T3, NFR-21). mulberry32: the whole generator state
// is one unsigned 32-bit integer, kept in GameState.rng, so a copied state
// replays exactly. Nothing in core/ may use Math.random.

/**
 * Maps any number to an unsigned 32-bit seed.
 * @param {number} seed
 */
export function normaliseSeed(seed) {
  return Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
}

/**
 * Returns a float in [0, 1) and advances `holder.rng`.
 * @param {{ rng: number }} holder
 */
export function nextFloat(holder) {
  holder.rng = (holder.rng + 0x6d2b79f5) >>> 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Returns a float in [min, max) and advances `holder.rng`.
 * @param {{ rng: number }} holder @param {number} min @param {number} max
 */
export function nextRange(holder, min, max) {
  return min + (max - min) * nextFloat(holder);
}
