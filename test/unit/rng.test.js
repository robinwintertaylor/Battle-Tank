// T3 and NFR-21: one seedable generator whose state lives in the game state.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextFloat, nextRange, normaliseSeed } from '../../site/src/core/rng.js';

/** @param {number} seed @param {number} n */
function draw(seed, n) {
  const holder = { rng: normaliseSeed(seed) };
  return Array.from({ length: n }, () => nextFloat(holder));
}

test('NFR-21 the same seed gives the same sequence', () => {
  assert.deepEqual(draw(12345, 50), draw(12345, 50));
});

test('different seeds give different sequences', () => {
  assert.notDeepEqual(draw(1, 10), draw(2, 10));
});

test('nextFloat advances the state held in the object, so a copied state replays', () => {
  const a = { rng: normaliseSeed(99) };
  nextFloat(a);
  nextFloat(a);
  const b = { ...a };
  assert.equal(nextFloat(a), nextFloat(b));
  assert.equal(a.rng, b.rng);
});

test('the state stays an unsigned 32-bit integer, so it survives JSON', () => {
  const holder = { rng: normaliseSeed(7) };
  for (let i = 0; i < 1000; i++) {
    nextFloat(holder);
    assert.ok(Number.isInteger(holder.rng) && holder.rng >= 0 && holder.rng <= 0xffffffff);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(holder)), holder);
});

test('values are in [0, 1) and spread across the range', () => {
  const values = draw(2024, 10_000);
  assert.ok(values.every((v) => v >= 0 && v < 1));
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  assert.ok(Math.abs(mean - 0.5) < 0.02, `mean ${mean}`);
  const buckets = new Array(10).fill(0);
  for (const v of values) buckets[Math.floor(v * 10)] += 1;
  assert.ok(buckets.every((c) => c > 850 && c < 1150), `buckets ${buckets}`);
});

test('the sequence is pinned, so a change to the generator is a visible decision', () => {
  // mulberry32 reference output for seed 1.
  assert.deepEqual(draw(1, 3), [0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
});

test('normaliseSeed maps any number to an unsigned 32-bit integer', () => {
  assert.equal(normaliseSeed(-1), 0xffffffff);
  assert.equal(normaliseSeed(2 ** 32 + 5), 5);
  assert.equal(normaliseSeed(3.9), 3);
  assert.equal(normaliseSeed(Number.NaN), 0);
});

test('nextRange draws in [min, max)', () => {
  const holder = { rng: normaliseSeed(5) };
  for (let i = 0; i < 1000; i++) {
    const v = nextRange(holder, 80, 140);
    assert.ok(v >= 80 && v < 140);
  }
});
