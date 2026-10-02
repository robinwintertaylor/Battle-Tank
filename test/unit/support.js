// Shared helpers for the simulation tests. Not a test file itself: the test
// glob only picks up *.test.js.
import assert from 'node:assert/strict';
import { CONFIG } from '../../site/src/core/config.js';
import { newGame } from '../../site/src/core/rules.js';
import { step } from '../../site/src/core/sim.js';
import { createWorld } from '../../site/src/core/world.js';

/** @typedef {import('../../site/src/core/sim.js').InputSnapshot} InputSnapshot */
/** @typedef {import('../../site/src/core/world.js').GameState} GameState */
/** @typedef {import('../../site/src/core/world.js').Tank} Tank */
/** @typedef {import('../../site/src/core/math.js').Vec2} Vec2 */

/** @param {Partial<InputSnapshot>} [over] @returns {InputSnapshot} */
export const input = (over = {}) => ({ throttle: 0, turn: 0, firePressed: false, commands: [], ...over });

export const close = (/** @type {number} */ a, /** @type {number} */ b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${a} is not close to ${b}`);

/** @param {GameState} state @param {InputSnapshot} snapshot @param {number} n */
export function run(state, snapshot, n) {
  for (let i = 0; i < n; i++) step(state, snapshot);
}

/** @param {GameState} state @returns {Tank} */
export const player = (state) => /** @type {Tank} */ (state.tanks.find((t) => t.id === state.playerId));

/** @param {GameState} state @returns {Tank[]} */
export const enemies = (state) => state.tanks.filter((t) => t.side === 'enemy');

/**
 * A game in the Playing screen with its first enemy moved to `at` (default:
 * 100 u along +x, a clear line from the player), out of
 * its grace period and facing the player.
 * @param {number} [seed] @param {Vec2} [at]
 */
export function playing(seed = 1, at = { x: 100, z: 0 }) {
  const state = createWorld(seed, CONFIG);
  newGame(state, CONFIG);
  const enemy = enemies(state)[0];
  enemy.pos = { ...at };
  enemy.prevPos = { ...at };
  enemy.heading = Math.atan2(-at.x, -at.z);
  enemy.graceTicks = 0;
  return { state, enemy };
}

/** @param {GameState} state @param {string} type */
export const eventsOf = (state, type) => state.events.filter((e) => e.type === type);

/**
 * Puts an enemy shell in flight that hits the player in the next step.
 * @param {GameState} state
 */
export function shellAtPlayer(state) {
  const p = player(state);
  const k = 1 / CONFIG.stepSeconds;
  state.shells.push({ id: state.nextId++, ownerId: -1, side: 'enemy', pos: { x: p.pos.x + 1, z: p.pos.z - 5 }, prevPos: { x: p.pos.x + 1, z: p.pos.z - 5 }, vel: { x: 0, z: 10 * k }, ticksLeft: 100 });
}

/** @param {number} seconds */
export const stepsFor = (seconds) => Math.round(seconds / CONFIG.stepSeconds);
