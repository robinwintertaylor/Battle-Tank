// UT-HIT: swept hit test, ownership, obstacle before tank, same-step destruction.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../../site/src/core/config.js';
import { step } from '../../site/src/core/sim.js';
import { enemies, eventsOf, input, player, playing } from './support.js';

/** @typedef {import('../../site/src/core/world.js').GameState} GameState */
/** @typedef {import('../../site/src/core/math.js').Vec2} Vec2 */

const idle = input();

/**
 * Puts a shell in flight that will travel from `from` to `to` in the next step.
 * @param {GameState} state @param {number} ownerId @param {Vec2} from @param {Vec2} to
 */
function shellFrom(state, ownerId, from, to) {
  const k = 1 / CONFIG.stepSeconds;
  const owner = state.tanks.find((t) => t.id === ownerId);
  const side = owner ? owner.side : 'enemy';
  const shell = { id: state.nextId++, ownerId, side, pos: { ...from }, prevPos: { ...from }, vel: { x: (to.x - from.x) * k, z: (to.z - from.z) * k }, ticksLeft: 100 };
  state.shells.push(shell);
  return shell;
}

test('AC-07.1 BR-09 BR-10 a player shell passing within 3 u of the enemy destroys it and is removed', () => {
  const { state, enemy } = playing();
  shellFrom(state, state.playerId, { x: 100 - 2.9, z: -1 }, { x: 100 - 2.9, z: 1 });
  step(state, idle);
  assert.equal(enemies(state).length, 0);
  assert.equal(state.shells.length, 0);
  assert.deepEqual(eventsOf(state, 'tank-hit').map((e) => e.tankId), [enemy.id]);
});

test('AC-07.2 a player shell passing 3.1 u from the enemy centre does not destroy it', () => {
  const { state } = playing();
  shellFrom(state, state.playerId, { x: 100 - 3.1, z: -1 }, { x: 100 - 3.1, z: 1 });
  step(state, idle);
  assert.equal(enemies(state).length, 1);
  assert.equal(state.shells.length, 1);
});

test('AC-07.3 BR-09 a shell that crosses the enemy within one step still hits (swept test)', () => {
  const { state } = playing();
  shellFrom(state, state.playerId, { x: 90, z: 0 }, { x: 110, z: 0 }); // starts and ends outside the hit radius
  step(state, idle);
  assert.equal(enemies(state).length, 0);
});

test('AC-07.5 a player shell never hits the player; an enemy shell never hits the enemy', () => {
  const { state, enemy } = playing();
  shellFrom(state, state.playerId, { x: -1, z: -5 }, { x: -1, z: 5 }); // through the player
  shellFrom(state, enemy.id, { x: 99, z: -5 }, { x: 99, z: 5 }); // through the enemy
  step(state, idle);
  assert.equal(player(state).alive, true);
  assert.equal(enemies(state).length, 1);
  assert.equal(state.shells.length, 2);
});

test('AC-07.6 BR-09 an enemy shell passing within 3 u of the player destroys the player', () => {
  const { state, enemy } = playing();
  shellFrom(state, enemy.id, { x: 5, z: 2.9 }, { x: -5, z: 2.9 });
  step(state, idle);
  assert.equal(player(state).alive, false);
  assert.equal(eventsOf(state, 'player-hit').length, 1);
});

test('BR-09 a shell whose path reaches an obstacle before a tank is stopped by the obstacle', () => {
  const { state } = playing(1, { x: 0, z: 60 }); // the pillar at (0, 45) is between
  shellFrom(state, state.playerId, { x: 0, z: 40 }, { x: 0, z: 62 });
  step(state, idle);
  assert.equal(enemies(state).length, 1);
  assert.equal(state.shells.length, 0);
  assert.equal(eventsOf(state, 'shell-blocked').length, 1);
});

test('BR-09 a shell whose path reaches a tank before an obstacle hits the tank', () => {
  const { state } = playing(1, { x: 0, z: 38 }); // the enemy is in front of the pillar at (0, 45)
  shellFrom(state, state.playerId, { x: 0, z: 30 }, { x: 0, z: 50 });
  step(state, idle);
  assert.equal(enemies(state).length, 0);
  assert.equal(eventsOf(state, 'shell-blocked').length, 0);
});

test('BR-09 shells do not hit each other', () => {
  const { state, enemy } = playing();
  shellFrom(state, state.playerId, { x: 50, z: -1 }, { x: 50, z: 1 });
  shellFrom(state, enemy.id, { x: 49, z: 0 }, { x: 51, z: 0 });
  step(state, idle);
  assert.equal(state.shells.length, 2);
});

test('BR-21 AC-09.7 if both tanks are hit in the same step, the kill scores and the death costs a life', () => {
  const { state, enemy } = playing();
  shellFrom(state, state.playerId, { x: 99, z: -5 }, { x: 99, z: 5 });
  shellFrom(state, enemy.id, { x: 1, z: -5 }, { x: 1, z: 5 });
  step(state, idle);
  assert.equal(state.score, CONFIG.pointsPerKill);
  assert.equal(state.lives, CONFIG.startingLives - 1);
  assert.equal(player(state).alive, false);
  assert.equal(enemies(state).length, 0);
});

test('an enemy shell still flies, and still hits, after the enemy that fired it is destroyed', () => {
  const { state, enemy } = playing();
  shellFrom(state, state.playerId, { x: 99, z: -5 }, { x: 99, z: 5 });
  shellFrom(state, enemy.id, { x: 50, z: 0 }, { x: 49, z: 0 });
  step(state, idle);
  assert.equal(enemies(state).length, 0);
  assert.equal(state.shells.length, 1);
  state.shells[0].pos = { x: 3.5, z: 0 }; // next step it moves 1 u, to within 3 u of the player
  step(state, idle);
  assert.equal(player(state).alive, false);
});

test('BR-13 a player death removes every shell in flight', () => {
  const { state, enemy } = playing();
  shellFrom(state, enemy.id, { x: 1, z: -5 }, { x: 1, z: 5 });
  shellFrom(state, state.playerId, { x: -100, z: 50 }, { x: -100, z: 51 });
  step(state, idle);
  assert.equal(player(state).alive, false);
  assert.deepEqual(state.shells, []);
});
