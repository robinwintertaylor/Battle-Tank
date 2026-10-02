// UT-STORE (core half): the best-score key and validation of a stored value.
// storage.js, which wraps localStorage, comes with the platform layer.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BEST_SCORE_KEY, MAX_BEST_SCORE, bestAfterGame, parseBestScore } from '../../site/src/core/best-score.js';

test('SEC-21 the best score is stored under a namespaced key', () => {
  assert.equal(BEST_SCORE_KEY, 'wireframe-tanks:best-score');
});

test('AC-15.3 SEC-22 a stored whole number from 0 to 10,000,000 is read back', () => {
  assert.equal(MAX_BEST_SCORE, 10_000_000);
  assert.equal(parseBestScore('0'), 0);
  assert.equal(parseBestScore('1200'), 1200);
  assert.equal(parseBestScore('10000000'), 10_000_000);
});

test('AC-15.3 SEC-22 a missing, malformed, negative, non-finite or too-large value is rejected', () => {
  const bad = [null, undefined, '', ' 12', '12 ', '12.5', '-1', '-0', '+5', '1e3', '0x10', 'NaN', 'Infinity', '10000001', '99999999999999999999', 'abc', '١٢'];
  for (const raw of bad) assert.equal(parseBestScore(raw), null, JSON.stringify(raw));
  assert.equal(parseBestScore(/** @type {any} */ (1200)), null, 'only strings come out of storage');
});

test('AC-15.1 BR-26 the best score after a finished game is the higher of the stored best and the final score', () => {
  assert.equal(bestAfterGame(null, 300), 300);
  assert.equal(bestAfterGame(500, 300), 500);
  assert.equal(bestAfterGame(500, 800), 800);
  assert.equal(bestAfterGame(0, 0), 0);
});
