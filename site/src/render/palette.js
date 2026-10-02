// Palette keys, line widths, dashes and the CSS token each colour comes from
// (ARCHITECTURE.md 4.4, UX_SPEC.md 8.2). Pure: main.js reads the tokens once
// at start-up and resolvePalette turns them into stroke styles.
//
// Four keys go beyond the original 4.4 table because one key is one stroke
// style or layer: `crosshairDim` (the dashed "cannot fire" crosshair,
// UX_SPEC.md 6.3), `aimRing` (the aiming ring on the tape, which must not
// shake or share the tank's bucket, 6.4), and `chevron` and `chevronAlert`
// (the 4 px and 8 px edge chevron, 6.5).

/** @typedef {'horizon' | 'world' | 'playerShell' | 'enemyGrace' | 'enemy' | 'enemyShell' | 'hudDim' | 'crosshairDim' | 'hud' | 'aimRing' | 'chevron' | 'chevronAlert' | 'alert'} PaletteKey */
/** @typedef {{ token: string, width: number, dash: readonly number[], capacity: number, layer: 'world' | 'hud' }} StrokeSpec */
/** @typedef {{ color: string, width: number, dash: readonly number[] }} Stroke */
/** @typedef {{ background: string, font: string, strokes: Record<PaletteKey, Stroke> }} Palette */

export const BACKGROUND_TOKEN = '--wt-color-bg';
export const FONT_TOKEN = '--wt-font';

/**
 * In draw order. `capacity` is the most segments the key can hold in one
 * frame; together they stay inside the 1,500-segment budget (6.1). `world`
 * keys shake with the view on a hit; `hud` keys do not.
 * @type {Readonly<Record<PaletteKey, StrokeSpec>>}
 */
export const PALETTE_SPEC = Object.freeze({
  horizon: { token: '--wt-color-horizon', width: 1.5, dash: [], capacity: 64, layer: 'world' },
  world: { token: '--wt-color-world', width: 1.5, dash: [], capacity: 600, layer: 'world' },
  playerShell: { token: '--wt-color-world', width: 1.5, dash: [], capacity: 24, layer: 'world' },
  enemyGrace: { token: '--wt-color-enemy', width: 2, dash: [6, 4], capacity: 48, layer: 'world' },
  enemy: { token: '--wt-color-enemy', width: 2, dash: [], capacity: 48, layer: 'world' },
  enemyShell: { token: '--wt-color-enemy', width: 2, dash: [], capacity: 24, layer: 'world' },
  hudDim: { token: '--wt-color-text-dim', width: 2, dash: [], capacity: 64, layer: 'hud' },
  crosshairDim: { token: '--wt-color-text-dim', width: 2, dash: [3, 5], capacity: 32, layer: 'hud' },
  hud: { token: '--wt-color-text', width: 2, dash: [], capacity: 96, layer: 'hud' },
  aimRing: { token: '--wt-color-enemy', width: 2, dash: [], capacity: 16, layer: 'hud' },
  chevron: { token: '--wt-color-enemy', width: 4, dash: [], capacity: 4, layer: 'hud' },
  chevronAlert: { token: '--wt-color-alert', width: 8, dash: [], capacity: 4, layer: 'hud' },
  alert: { token: '--wt-color-alert', width: 10, dash: [], capacity: 8, layer: 'hud' },
});

/** @type {readonly PaletteKey[]} */
export const STROKE_KEYS = Object.freeze(/** @type {PaletteKey[]} */ (Object.keys(PALETTE_SPEC)));

/**
 * Turns the spec into stroke styles, reading each token through `read`
 * (getComputedStyle in the page, a stub in tests).
 * @param {(token: string) => string} read
 * @returns {Palette}
 */
export function resolvePalette(read) {
  /** @type {Partial<Record<PaletteKey, Stroke>>} */
  const strokes = {};
  for (const key of STROKE_KEYS) {
    const spec = PALETTE_SPEC[key];
    strokes[key] = { color: read(spec.token).trim(), width: spec.width, dash: spec.dash };
  }
  return { background: read(BACKGROUND_TOKEN).trim(), font: read(FONT_TOKEN).trim(), strokes: /** @type {Record<PaletteKey, Stroke>} */ (strokes) };
}

/** @typedef {{ data: Float32Array, count: number, capacity: number }} Bucket */
/** @typedef {Record<PaletteKey, Bucket>} Buckets */

/**
 * One preallocated buffer per palette key, reused every frame (6.1).
 * @param {number} stride floats per segment: 6 for 3D, 4 for 2D
 * @returns {Buckets}
 */
export function createBuckets(stride) {
  /** @type {Partial<Buckets>} */
  const out = {};
  for (const key of STROKE_KEYS) {
    const capacity = PALETTE_SPEC[key].capacity;
    out[key] = { data: new Float32Array(capacity * stride), count: 0, capacity };
  }
  return /** @type {Buckets} */ (out);
}

/** @param {Buckets} buckets */
export function clearBuckets(buckets) {
  for (const key of STROKE_KEYS) buckets[key].count = 0;
}

/**
 * Adds a 2D segment. A full bucket drops it rather than growing.
 * @param {Bucket} b @param {number} ax @param {number} ay @param {number} bx @param {number} by
 */
export function push2(b, ax, ay, bx, by) {
  if (b.count >= b.capacity) return;
  const i = b.count * 4;
  b.data[i] = ax;
  b.data[i + 1] = ay;
  b.data[i + 2] = bx;
  b.data[i + 3] = by;
  b.count += 1;
}

/**
 * Adds a 3D segment. A full bucket drops it rather than growing.
 * @param {Bucket} b @param {number} ax @param {number} ay @param {number} az @param {number} bx @param {number} by @param {number} bz
 */
export function push3(b, ax, ay, az, bx, by, bz) {
  if (b.count >= b.capacity) return;
  const i = b.count * 6;
  b.data[i] = ax;
  b.data[i + 1] = ay;
  b.data[i + 2] = az;
  b.data[i + 3] = bx;
  b.data[i + 4] = by;
  b.data[i + 5] = bz;
  b.count += 1;
}
