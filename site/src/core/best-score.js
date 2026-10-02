// The best score's storage key and validation (SEC-21, SEC-22, US-15).
// platform/storage.js does the localStorage reads and writes; this module
// only decides what a stored string is worth.

export const BEST_SCORE_KEY = 'wireframe-tanks:best-score';
export const MAX_BEST_SCORE = 10_000_000;

/**
 * A stored best score, or null if it is not a plain whole number from 0 to
 * 10,000,000. Signs, spaces, decimals and exponents are all rejected.
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseBestScore(raw) {
  if (typeof raw !== 'string' || !/^[0-9]{1,8}$/.test(raw)) return null;
  const value = Number(raw);
  return value <= MAX_BEST_SCORE ? value : null;
}

/**
 * The best score once a game reaches Game over (BR-26), capped at
 * MAX_BEST_SCORE so that whatever is written always reads back (SEC-22).
 * @param {number | null} stored @param {number} score
 */
export function bestAfterGame(stored, score) {
  return Math.min(Math.max(stored ?? 0, score), MAX_BEST_SCORE);
}
