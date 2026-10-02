// The test hook (ADR 0008, NFR-22), the frame driver (loop.js startLoop),
// and the screens' pure decisions: which overlay shows and what the live
// region says (screens.js, UX_SPEC.md 5, A11Y-13).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../../site/src/core/config.js';
import { applyHit } from '../../site/src/core/rules.js';
import { step } from '../../site/src/core/sim.js';
import { createWorld } from '../../site/src/core/world.js';
import { startLoop } from '../../site/src/platform/loop.js';
import { announcementFor, overlayFor } from '../../site/src/platform/screens.js';
import { EVENT_LIMIT, installTestHook, readTestHook } from '../../site/src/platform/test-hook.js';
import { input, playing, shellAtPlayer, stepsFor } from './support.js';

const noView = { shakeX: 0, shakeY: 0, hitFrame: false };

test('ADR 0008 with no hook set, nothing is exposed', () => {
  assert.equal(readTestHook({}), null);
});

test('ADR 0008 only a plain object switches the hook on: not an element, an array, a class instance or null', () => {
  class Fake {}
  const bad = [null, 5, 'x', [], new Fake(), Object.create(null), { __proto__: { seed: 1 } }];
  bad.forEach((v, i) => assert.equal(readTestHook({ __WT_TEST__: v }), null, `case ${i}`));
  assert.notEqual(readTestHook({ __WT_TEST__: {} }), null);
});

test('ADR 0008 the seed is used only if it is a safe integer in the 32-bit unsigned range', () => {
  assert.equal(readTestHook({ __WT_TEST__: { seed: 42 } })?.seed, 42);
  assert.equal(readTestHook({ __WT_TEST__: { seed: 0xffffffff } })?.seed, 0xffffffff);
  for (const bad of [-1, 0x100000000, 1.5, Number.NaN, '42', 2 ** 60]) {
    assert.equal(readTestHook({ __WT_TEST__: { seed: bad } })?.seed, null, String(bad));
  }
});

test('NFR-22 snapshot() is deeply frozen, so a test cannot change the game through it', () => {
  const target = {};
  const hook = installTestHook({ seed: 1, target });
  const { state } = playing();
  hook.publish(state, noView, { muted: true, page: 'ready' });
  const snap = /** @type {() => any} */ (/** @type {Record<string, unknown>} */ (target).snapshot)();
  assert.ok(Object.isFrozen(snap));
  assert.ok(Object.isFrozen(snap.tanks[0].pos));
  assert.throws(() => {
    'use strict';
    snap.score = 999;
  });
  assert.equal(state.score, 0);
  assert.equal(snap.muted, true);
  assert.deepEqual(snap.view, noView);
  state.score = 100;
  assert.equal(snap.score, 0, 'a copy, not the live state');
});

test('ADR 0008 events() keeps the last 1,000 events in order, each with its tick', () => {
  const target = {};
  const hook = installTestHook({ seed: 1, target });
  for (let i = 0; i < EVENT_LIMIT + 5; i++) hook.record([{ type: 'shot', tick: i, tankId: 1 }]);
  const events = /** @type {() => { tick: number }[]} */ (/** @type {Record<string, unknown>} */ (target).events)();
  assert.equal(events.length, EVENT_LIMIT);
  assert.equal(events[0].tick, 5);
  assert.equal(events.at(-1)?.tick, EVENT_LIMIT + 4);
  assert.ok(Object.isFrozen(events));
});

test('startLoop runs whole steps per frame from the clock, then renders with alpha', () => {
  /** @type {((t: number) => void)[]} */
  const queue = [];
  let steps = 0;
  /** @type {number[]} */
  const alphas = [];
  const loop = startLoop({ now: () => 0, requestFrame: (cb) => queue.push(cb), step: () => steps++, render: (a) => alphas.push(a) });
  /** @param {number} t */
  const tick = (t) => /** @type {(t: number) => void} */ (queue.shift())(t);
  tick(17); // one whole step (16.7 ms) and a little over
  assert.equal(steps, 1);
  tick(17 + 34); // two more
  assert.equal(steps, 3);
  assert.equal(alphas.length, 2);
  loop.stop();
  tick(5000);
  assert.equal(steps, 3, 'a stopped loop runs nothing');
  assert.equal(queue.length, 0, 'and asks for no more frames');
});

test('BR-27 if a step throws, the loop asks for no further frame', () => {
  /** @type {((t: number) => void)[]} */
  const queue = [];
  startLoop({ now: () => 0, requestFrame: (cb) => queue.push(cb), step: () => { throw new Error('boom'); }, render: () => {} });
  assert.throws(() => /** @type {(t: number) => void} */ (queue.shift())(100));
  assert.equal(queue.length, 0);
});

test('UX 5 the overlay follows the screen; Respawning and Destroyed have none', () => {
  const state = createWorld(1, CONFIG);
  const scores = { best: 0, newBest: false };
  assert.equal(overlayFor(state, 'ready', scores).overlay, 'start');
  assert.equal(overlayFor(state, 'ready', scores).startReady, true);
  assert.equal(overlayFor(state, 'loading', scores).startReady, false);
  assert.equal(overlayFor(state, 'keyboard', scores).overlay, 'keyboard');
  assert.equal(overlayFor(state, 'error', scores).overlay, 'error');
  state.screen = 'playing';
  assert.equal(overlayFor(state, 'ready', scores).overlay, null);
  state.screen = 'respawning';
  assert.equal(overlayFor(state, 'ready', scores).overlay, null);
  state.screen = 'destroyed';
  assert.equal(overlayFor(state, 'ready', scores).overlay, null);
  state.screen = 'paused';
  state.pauseLocked = true;
  assert.equal(overlayFor(state, 'ready', scores).tooSmall, true, 'BR-25 message and Resume disabled');
});

test('BR-20 AC-09.5 the Game over overlay is locked for K-17, then unlocked', () => {
  const { state } = playing();
  state.lives = 1;
  shellAtPlayer(state);
  step(state, input());
  for (let i = 0; i < stepsFor(CONFIG.gameOverDelaySeconds); i++) step(state, input());
  const scores = { best: 300, newBest: true };
  assert.equal(overlayFor(state, 'ready', scores).overlay, 'gameover');
  assert.equal(overlayFor(state, 'ready', scores).locked, true);
  for (let i = 0; i < stepsFor(CONFIG.restartLockoutSeconds); i++) step(state, input());
  assert.equal(overlayFor(state, 'ready', scores).locked, false);
  assert.equal(overlayFor(state, 'ready', scores).newBest, true);
});

test('A11Y-13 the live region announces changes of state only', () => {
  const state = createWorld(1, CONFIG);
  step(state, input({ commands: ['start'] }));
  assert.equal(announcementFor('start', state, state.events), 'Game started. 3 lives.');
  assert.equal(announcementFor('playing', state, []), null, 'nothing per frame');
  const enemy = state.tanks.find((t) => t.side === 'enemy');
  state.events.length = 0;
  applyHit(state, /** @type {import('../../site/src/core/world.js').Tank} */ (enemy), CONFIG);
  assert.equal(announcementFor('playing', state, state.events), 'Enemy destroyed. Score 100.');
  shellAtPlayer(state);
  step(state, input());
  assert.equal(announcementFor('playing', state, state.events), 'Hit. 2 lives left.');
  state.lives = 1;
  assert.equal(announcementFor('playing', state, [{ type: 'player-hit', tick: 0 }]), 'Hit. 1 life left.');
  state.screen = 'paused';
  assert.equal(announcementFor('playing', state, []), 'Paused.');
  assert.equal(announcementFor('playing', state, [{ type: 'game-over', tick: 0, score: 100 }]), 'Paused.', 'pause is the latest change');
  state.screen = 'gameover';
  assert.equal(announcementFor('destroyed', state, [{ type: 'game-over', tick: 0, score: 100 }]), 'Game over. Final score 100.');
});
