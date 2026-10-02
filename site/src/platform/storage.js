// The best score in localStorage (ARCHITECTURE.md 4.5, US-15, SEC-21,
// SEC-22). Every storage access is inside try/catch: private browsing, a
// full quota or disabled storage all throw, and the game must still run with
// the best score simply not kept (AC-15.4). Values are validated on read by
// core/best-score.js; only bestAfterGame decides what is written.

import { BEST_SCORE_KEY, bestAfterGame, parseBestScore } from '../core/best-score.js';

/** @typedef {Pick<Storage, 'getItem' | 'setItem'>} ScoreStorage */

/**
 * The page's localStorage, or null if even reaching it throws.
 * @param {{ localStorage: Storage }} win
 * @returns {ScoreStorage | null}
 */
export function openStorage(win) {
  try {
    return win.localStorage;
  } catch {
    return null;
  }
}

/**
 * The stored best score, or 0 if it is missing, invalid or unreadable (AC-15.3, AC-15.4).
 * @param {ScoreStorage | null} storage
 */
export function loadBest(storage) {
  if (!storage) return 0;
  try {
    return parseBestScore(storage.getItem(BEST_SCORE_KEY)) ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Records a finished game (BR-26) and returns the best score to show. The
 * write happens only when the game beat the stored best (AC-15.1); a failed
 * write is ignored.
 * @param {ScoreStorage | null} storage @param {number} stored @param {number} score
 */
export function saveBest(storage, stored, score) {
  const best = bestAfterGame(stored, score);
  if (best > stored && storage) {
    try {
      storage.setItem(BEST_SCORE_KEY, String(best));
    } catch {
      // Storage full or blocked: the best score is simply not kept.
    }
  }
  return best;
}
