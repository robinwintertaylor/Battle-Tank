// UT-SPAWN: enemy spawn distance and clearance, the 50-attempt fallback, and
// the K-14 delay. The player respawn point is in score.test.js (AC-09.3).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isClear } from '../../site/src/core/collision.js';
import { CONFIG } from '../../site/src/core/config.js';
import { distance, wrapAngle } from '../../site/src/core/math.js';
import { applyHit, newGame, pickSpawnPoint, SPAWN_FALLBACK } from '../../site/src/core/rules.js';
import { step } from '../../site/src/core/sim.js';
import { createWorld } from '../../site/src/core/world.js';
import { enemies, eventsOf, input, player, playing, run, stepsFor } from './support.js';

/** @typedef {import('../../site/src/core/world.js').Obstacle} Obstacle */

const idle = input();

/** @param {number} x @param {number} z @param {number} radius @returns {Obstacle} */
const disc = (x, z, radius) => ({ id: 999, model: 'pillar', pos: { x, z }, yaw: 0, footprint: { type: 'circle', radius } });

test('AC-06.1 BR-14 over 200 seeds the first enemy is 80 to 140 u away, inside the boundary and clear of every obstacle', () => {
  for (let seed = 0; seed < 200; seed++) {
    const state = createWorld(seed, CONFIG);
    newGame(state, CONFIG);
    const [enemy] = enemies(state);
    const d = distance(enemy.pos, player(state).pos);
    assert.ok(d >= CONFIG.enemySpawnDistanceMin && d <= CONFIG.enemySpawnDistanceMax, `seed ${seed}: ${d} u`);
    assert.ok(isClear(enemy.pos, CONFIG.tankRadius, state.obstacles, CONFIG.arenaHalfSize), `seed ${seed}`);
  }
});

test('BR-14 BR-15 a new enemy faces the player, has its grace period, and is a hunter under AI control', () => {
  const state = createWorld(4, CONFIG);
  newGame(state, CONFIG);
  const [enemy] = enemies(state);
  const toPlayer = Math.atan2(-enemy.pos.x, -enemy.pos.z);
  assert.ok(Math.abs(wrapAngle(enemy.heading - toPlayer)) < 1e-9);
  assert.equal(enemy.prevHeading, enemy.heading);
  assert.deepEqual(enemy.prevPos, enemy.pos);
  assert.equal(enemy.graceTicks, stepsFor(CONFIG.enemyGraceSeconds));
  assert.equal(enemy.kind, 'hunter');
  assert.equal(enemy.control.type, 'ai');
  assert.equal(enemy.alive, true);
  assert.deepEqual(eventsOf(state, 'enemy-spawned').map((e) => e.tankId), [enemy.id]);
});

test('NFR-21 the same seed spawns the enemy in the same place', () => {
  const a = createWorld(31, CONFIG);
  const b = createWorld(31, CONFIG);
  newGame(a, CONFIG);
  newGame(b, CONFIG);
  assert.deepEqual(enemies(a)[0].pos, enemies(b)[0].pos);
  const c = createWorld(32, CONFIG);
  newGame(c, CONFIG);
  assert.notDeepEqual(enemies(a)[0].pos, enemies(c)[0].pos);
});

test('BR-14 every point on the fallback list is inside the boundary and clear of the fixed layout', () => {
  const state = createWorld(1, CONFIG);
  assert.ok(SPAWN_FALLBACK.length >= 4);
  for (const p of SPAWN_FALLBACK) assert.ok(isClear(p, CONFIG.tankRadius, state.obstacles, CONFIG.arenaHalfSize), `${p.x}, ${p.z}`);
});

test('BR-14 if 50 attempts find no valid point, the furthest clear fallback point from the player is used', () => {
  const state = createWorld(1, CONFIG);
  const p = player(state);
  p.pos = { x: 100, z: 100 };
  // A disc covering the whole 80 to 140 u ring round the player.
  state.obstacles = [disc(100, 100, CONFIG.enemySpawnDistanceMax + 10)];
  const rngBefore = state.rng;
  assert.deepEqual(pickSpawnPoint(state, p.pos, CONFIG), { x: -200, z: -200 });
  assert.notEqual(state.rng, rngBefore, 'the attempts still consumed the generator');
  // Block that corner too: the next furthest wins.
  state.obstacles.push(disc(-200, -200, 5));
  const next = pickSpawnPoint(state, p.pos, CONFIG);
  const others = SPAWN_FALLBACK.filter((f) => !(f.x === -200 && f.z === -200));
  const furthest = Math.max(...others.map((f) => distance(f, p.pos)));
  assert.equal(distance(next, p.pos), furthest);
});

test('BR-14 the fallback list skips a point that another tank is standing on', () => {
  const state = createWorld(1, CONFIG);
  state.obstacles = [disc(0, 0, CONFIG.enemySpawnDistanceMax + 10)];
  state.tanks.push({ ...player(state), id: 50, side: 'enemy', pos: { x: -200, z: -200 } });
  const spot = pickSpawnPoint(state, { x: 0, z: 0 }, CONFIG);
  assert.notDeepEqual(spot, { x: -200, z: -200 });
});

test('AC-07.4 BR-14 a new enemy spawns K-14 after a kill, and not before', () => {
  const { state, enemy } = playing();
  applyHit(state, enemy, CONFIG);
  const delay = stepsFor(CONFIG.enemyRespawnSeconds);
  run(state, idle, delay);
  assert.equal(enemies(state).length, 0);
  step(state, idle);
  assert.equal(enemies(state).length, 1);
  assert.equal(eventsOf(state, 'enemy-spawned').length, 1);
});

test('BR-14 K-25 enemies exist during play: no extra enemy ever spawns', () => {
  const { state } = playing();
  run(state, idle, 600);
  assert.equal(enemies(state).length, CONFIG.maxEnemies);
});
