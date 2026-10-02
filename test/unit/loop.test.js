// UT-LOOP: the fixed-step accumulator of ADR 0003 and ARCHITECTURE.md 5.2.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../../site/src/core/config.js';
import { distance } from '../../site/src/core/math.js';
import { normaliseSeed, nextRange } from '../../site/src/core/rng.js';
import { newGame } from '../../site/src/core/rules.js';
import { step } from '../../site/src/core/sim.js';
import { createWorld } from '../../site/src/core/world.js';
import { advance } from '../../site/src/platform/loop.js';

const STEP = 1000 / 60;

const close = (/** @type {number} */ a, /** @type {number} */ b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${a} is not close to ${b}`);

test('advance runs no step until a whole step has accumulated', () => {
  const r = advance(0, 10);
  assert.equal(r.steps, 0);
  close(r.acc, 10);
  close(r.alpha, 10 / STEP);
});

test('advance runs one step per 1/60 s and carries the remainder', () => {
  const r = advance(10, 10);
  assert.equal(r.steps, 1);
  close(r.acc, 20 - STEP);
  close(r.alpha, (20 - STEP) / STEP);
});

test('advance runs several steps for a long frame', () => {
  const r = advance(0, 3.5 * STEP);
  assert.equal(r.steps, 3);
  close(r.alpha, 0.5);
});

test('alpha is always in [0, 1)', () => {
  const rng = { rng: normaliseSeed(3) };
  let acc = 0;
  for (let i = 0; i < 5000; i++) {
    const r = advance(acc, nextRange(rng, 0, 120));
    assert.ok(r.alpha >= 0 && r.alpha < 1, `alpha ${r.alpha}`);
    acc = r.acc;
  }
});

test('NFR-03 K-16 a 5-second gap is clamped and runs at most five steps', () => {
  const r = advance(0, 5000);
  assert.equal(r.steps, CONFIG.maxStepsPerFrame);
  assert.equal(r.acc, 0, 'a slow frame drops the backlog instead of spiralling');
  assert.ok(r.steps * CONFIG.stepMs <= CONFIG.maxFrameMs);
});

test('advance never runs more than five steps, whatever the backlog', () => {
  assert.equal(advance(10_000, 16).steps, 5);
});

test('a frame that just reaches the step cap keeps its remainder when no full step is still owed', () => {
  const r = advance(0, 90); // 5 steps is 83.3 ms, 6.7 ms over
  assert.equal(r.steps, CONFIG.maxStepsPerFrame);
  close(r.acc, 90 - 5 * STEP);
});

test('a negative or non-finite frame interval runs nothing', () => {
  assert.deepEqual(advance(5, -100), { steps: 0, acc: 5, alpha: 5 / STEP });
  assert.deepEqual(advance(5, Number.NaN), { steps: 0, acc: 5, alpha: 5 / STEP });
});

/**
 * Drives the real step through advance with a fixed frame interval until
 * 10 simulated seconds have run. Inputs depend only on the tick, which is how
 * a player's held keys look to the simulation.
 * @param {(frame: number) => number} interval
 */
function play(interval) {
  const state = createWorld(2024, CONFIG);
  newGame(state, CONFIG);
  /** @param {number} tick */
  const script = (tick) => ({ throttle: tick % 240 < 150 ? 1 : -1, turn: Math.floor(tick / 75) % 3 - 1, firePressed: false, commands: [] });
  let acc = 0;
  let frames = 0;
  while (state.tick < 600) {
    const r = advance(acc, interval(frames++));
    acc = r.acc;
    for (let i = 0; i < r.steps && state.tick < 600; i++) step(state, script(state.tick));
  }
  return { state, frames };
}

test('M10 NFR-02 30, 60 and 144 Hz frames give an identical state after 10 simulated seconds', () => {
  const at60 = play(() => 16.67);
  const at144 = play(() => 6.94);
  const at30 = play(() => 33.33);
  assert.ok(at144.frames > 2 * at60.frames && at60.frames > 1.9 * at30.frames, 'the frame counts really differ');
  assert.deepEqual(at144.state, at60.state);
  assert.deepEqual(at30.state, at60.state);
  assert.notDeepEqual(at60.state.tanks[0].pos, { x: 0, z: 0 }, 'the player really moved');
});

test('M10 jittery frame intervals give the same state as steady 60 Hz', () => {
  const rng = { rng: normaliseSeed(11) };
  const jitter = play(() => nextRange(rng, 4, 40));
  assert.deepEqual(jitter.state, play(() => 16.67).state);
});

test('NFR-03 after a 5-second gap no tank moves more than K-16 worth of driving', () => {
  const state = createWorld(1, CONFIG);
  state.screen = 'playing';
  const before = { ...state.tanks[0].pos };
  const r = advance(0, 5000);
  for (let i = 0; i < r.steps; i++) step(state, { throttle: 1, turn: 0, firePressed: false, commands: [] });
  assert.ok(distance(before, state.tanks[0].pos) <= CONFIG.playerForwardSpeed * CONFIG.maxFrameSeconds);
});
