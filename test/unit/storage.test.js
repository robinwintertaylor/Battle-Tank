// UT-STORE: the best score in storage, with storage that works, holds bad
// values, or throws (storage.js, US-15, SEC-21, SEC-22, AC-15.1 to AC-15.4).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadBest, openStorage, saveBest } from '../../site/src/platform/storage.js';

/** A Map-backed stand-in for localStorage. */
function memoryStorage(initial = /** @type {Record<string, string>} */ ({})) {
  const data = new Map(Object.entries(initial));
  /** @type {[string, string][]} */
  const writes = [];
  return {
    data,
    writes,
    /** @param {string} key */
    getItem: (key) => data.get(key) ?? null,
    /** @param {string} key @param {string} value */
    setItem: (key, value) => {
      writes.push([key, value]);
      data.set(key, value);
    },
  };
}

/** A storage whose every call throws, as in private mode or with a full quota. */
const throwing = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
};

test('SEC-21 AC-15.1 a higher score is written under the namespaced key', () => {
  const s = memoryStorage();
  assert.equal(saveBest(s, 0, 300), 300);
  assert.deepEqual(s.writes, [['wireframe-tanks:best-score', '300']]);
  assert.equal(loadBest(s), 300);
});

test('AC-15.1 a score that does not beat the best is not written', () => {
  const s = memoryStorage({ 'wireframe-tanks:best-score': '500' });
  assert.equal(saveBest(s, 500, 300), 500);
  assert.equal(saveBest(s, 500, 500), 500);
  assert.deepEqual(s.writes, []);
});

test('AC-15.3 SEC-22 a missing or invalid stored value reads as 0, with no error', () => {
  assert.equal(loadBest(memoryStorage()), 0);
  for (const bad of ['-5', '12.5', 'abc', '1e9', '99999999', ' 7']) {
    assert.equal(loadBest(memoryStorage({ 'wireframe-tanks:best-score': bad })), 0, bad);
  }
});

test('AC-15.4 SEC-22 storage that throws on read or write never stops the game', () => {
  assert.equal(loadBest(throwing), 0);
  assert.equal(saveBest(throwing, 0, 400), 400, 'the best is still shown for this visit');
  assert.equal(loadBest(null), 0);
  assert.equal(saveBest(null, 100, 400), 400);
});

test('AC-15.4 reaching localStorage at all can throw; then there is no storage', () => {
  const win = /** @type {{ localStorage: Storage }} */ (/** @type {unknown} */ ({
    get localStorage() {
      throw new Error('SecurityError');
    },
  }));
  assert.equal(openStorage(win), null);
  const ok = /** @type {{ localStorage: Storage }} */ (/** @type {unknown} */ ({ localStorage: memoryStorage() }));
  assert.notEqual(openStorage(ok), null);
});
