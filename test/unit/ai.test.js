// UT-AI: the hunter state machine (REQUIREMENTS.md 8.3), its steering, the
// grace period and fire conditions in the running simulation, and the
// 100-seed reachability run (AC-06.5).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI } from '../../site/src/core/ai/registry.js';
import { isClear } from '../../site/src/core/collision.js';
import { CONFIG } from '../../site/src/core/config.js';
import { degToRad, distance, wrapAngle } from '../../site/src/core/math.js';
import { nextFloat, nextRange, normaliseSeed } from '../../site/src/core/rng.js';
import { newGame } from '../../site/src/core/rules.js';
import { aiView, step } from '../../site/src/core/sim.js';
import { createWorld } from '../../site/src/core/world.js';
import { enemies, eventsOf, input, player, run, stepsFor } from './support.js';

/** @typedef {import('../../site/src/core/world.js').GameState} GameState */
/** @typedef {import('../../site/src/core/world.js').Tank} Tank */
/** @typedef {import('../../site/src/core/ai/hunter.js').HunterMemory} HunterMemory */
/** @typedef {import('../../site/src/core/math.js').Vec2} Vec2 */

const idle = input();
const hunter = AI.hunter;
const H = CONFIG.hunter;

/**
 * A game in play with its real AI enemy moved to `at`, heading `heading`
 * (default: facing the player), out of its grace period.
 * @param {Vec2} at @param {number} [heading] @param {number} [seed]
 */
function duel(at, heading, seed = 1) {
  const state = createWorld(seed, CONFIG);
  newGame(state, CONFIG);
  state.events.length = 0;
  const enemy = enemies(state)[0];
  enemy.pos = { ...at };
  enemy.prevPos = { ...at };
  enemy.heading = heading ?? Math.atan2(-at.x, -at.z);
  enemy.prevHeading = enemy.heading;
  enemy.graceTicks = 0;
  return { state, enemy, memory: /** @type {HunterMemory} */ (/** @type {{ memory: object }} */ (enemy.control).memory) };
}

/** @param {GameState} state @param {Tank} enemy */
const think = (state, enemy) =>
  hunter.think(/** @type {HunterMemory} */ (/** @type {{ memory: object }} */ (enemy.control).memory), enemy, aiView(state, enemy, CONFIG), () => nextFloat(state));

test('ADR 0004 the registry maps hunter to a controller, and each enemy gets its own memory', () => {
  assert.equal(typeof hunter.think, 'function');
  const a = duel({ x: 140, z: 0 }).enemy;
  const b = duel({ x: 140, z: 0 }).enemy;
  assert.equal(a.control.type, 'ai');
  assert.notEqual(/** @type {{ memory: object }} */ (a.control).memory, /** @type {{ memory: object }} */ (b.control).memory);
  assert.equal(/** @type {HunterMemory} */ (/** @type {{ memory: object }} */ (a.control).memory).state, 'spawn');
});

test('8.3 Spawn goes straight to Approach, and the memory stays plain data', () => {
  const { state, enemy, memory } = duel({ x: 140, z: 0 });
  think(state, enemy);
  assert.equal(memory.state, 'approach');
  assert.deepEqual(JSON.parse(JSON.stringify(memory)), memory);
});

test('8.3 Approach seeks the player: with the player to its left, it turns left and drives', () => {
  const { state, enemy } = duel({ x: 140, z: 0 }, 0); // facing +z, player at -x
  const intent = think(state, enemy);
  assert.ok(intent.turn < 0, `turn ${intent.turn}`);
  assert.equal(intent.fire, false);
  const ahead = duel({ x: 140, z: 0 }); // facing the player
  assert.equal(think(ahead.state, ahead.enemy).throttle, 1);
});

test('8.3 Approach steers round an obstacle in its way rather than into it', () => {
  // The pillar at (0, 45) lies on the straight line from (0, 62) to the player.
  const { state, enemy } = duel({ x: 0, z: 62 });
  const intent = think(state, enemy);
  assert.notEqual(intent.turn, 0, 'it turns off the blocked line');
});

test('8.3 Approach becomes Aim within firing range with a clear line of sight', () => {
  const { state, enemy, memory } = duel({ x: H.fireRange - 1, z: 0 });
  think(state, enemy);
  assert.equal(memory.state, 'aim');
  const far = duel({ x: H.fireRange + 10, z: 0 });
  think(far.state, far.enemy);
  assert.equal(far.memory.state, 'approach');
});

test('8.3 no Aim without a line of sight, and Aim drops back to Approach when the sight is lost', () => {
  const blocked = duel({ x: 0, z: 90 }); // the pillar at (0, 45) is between
  think(blocked.state, blocked.enemy);
  assert.equal(blocked.memory.state, 'approach');
  const { state, enemy, memory } = duel({ x: 60, z: 0 });
  think(state, enemy);
  assert.equal(memory.state, 'aim');
  enemy.pos = { x: 0, z: 90 }; // now the pillar at (0, 45) is between them
  think(state, enemy);
  assert.equal(memory.state, 'approach');
});

test('BR-16 Aim turns towards the player and asks to fire only inside the aim tolerance', () => {
  const tol = CONFIG.difficulty[0].aimToleranceDeg;
  const { state, enemy, memory } = duel({ x: 60, z: 0 });
  enemy.heading = Math.atan2(-60, 0) + degToRad(tol + 3);
  let intent = think(state, enemy);
  assert.equal(memory.state, 'aim');
  assert.equal(intent.fire, false);
  assert.ok(intent.turn < 0, 'turns back towards the player');
  assert.equal(intent.throttle, 0);
  enemy.heading = Math.atan2(-60, 0) + degToRad(tol - 0.5);
  intent = think(state, enemy);
  assert.equal(intent.fire, true);
});

test('8.3 after a shot Aim becomes Evade, which lasts its time and then returns to Approach', () => {
  const { state, enemy, memory } = duel({ x: 60, z: 0 });
  think(state, enemy);
  state.shells.push({ id: 900, ownerId: enemy.id, side: 'enemy', pos: { x: 50, z: 0 }, prevPos: { x: 50, z: 0 }, vel: { x: -80, z: 0 }, ticksLeft: 10 });
  think(state, enemy);
  assert.equal(memory.state, 'evade');
  state.shells.length = 0;
  for (let i = 1; i < stepsFor(H.evadeSeconds); i++) {
    const intent = think(state, enemy);
    assert.equal(memory.state, 'evade', `tick ${i}`);
    assert.equal(intent.fire, false);
  }
  think(state, enemy);
  assert.notEqual(memory.state, 'evade');
});

test('8.3 Approach becomes Evade when the player aims at the enemy, then waits out a cooldown', () => {
  const { state, enemy, memory } = duel({ x: H.fireRange + 20, z: 0 });
  player(state).heading = Math.PI / 2; // straight at the enemy
  think(state, enemy);
  assert.equal(memory.state, 'evade');
  for (let i = 0; i < stepsFor(H.evadeSeconds); i++) think(state, enemy);
  assert.equal(memory.state, 'approach', 'the cooldown stops it evading again at once');
});

test('the hunter holds still while the player is dead', () => {
  const { state, enemy } = duel({ x: 60, z: 0 });
  player(state).alive = false;
  assert.deepEqual(think(state, enemy), { throttle: 0, turn: 0, fire: false });
});

test('the hunter backs off when it has made no progress', () => {
  const { state, enemy, memory } = duel({ x: 140, z: 0 });
  /** @type {import('../../site/src/core/sim.js').Intent[]} */
  const intents = [];
  for (let i = 0; i < stepsFor(H.stuckSeconds) * 2 + 2; i++) intents.push(think(state, enemy)); // never moves
  assert.ok(intents.some((t) => t.throttle < 0), 'it reverses to get unstuck');
  assert.equal(memory.state, 'approach');
});

test('AC-06.2 BR-15 an enemy spawned with the player in its sights does not fire for 2.0 s, then does', () => {
  const state = createWorld(5, CONFIG);
  newGame(state, CONFIG);
  const enemy = enemies(state)[0];
  enemy.pos = { x: 60, z: 0 };
  enemy.heading = -Math.PI / 2;
  player(state).heading = 0; // not aiming back, so the enemy does not evade
  let firstShot = -1;
  for (let i = 1; i <= 300 && firstShot < 0; i++) {
    step(state, idle);
    if (eventsOf(state, 'shot').some((e) => e.tankId === enemy.id)) firstShot = i;
  }
  assert.ok(firstShot > stepsFor(CONFIG.enemyGraceSeconds), `fired after ${firstShot} steps`);
  assert.ok(firstShot <= stepsFor(CONFIG.enemyGraceSeconds) + 2, `fired after ${firstShot} steps`);
});

test('AC-06.3 once grace, reload and aim all hold, the enemy fires in that step', () => {
  const { state, enemy } = duel({ x: 60, z: 0 });
  step(state, idle);
  assert.ok(eventsOf(state, 'shot').some((e) => e.tankId === enemy.id));
});

test('AC-06.4 an enemy facing beyond its tolerance does not fire in that step', () => {
  const { state, enemy } = duel({ x: 60, z: 0 }, -Math.PI / 2 + degToRad(30));
  step(state, idle);
  assert.equal(eventsOf(state, 'shot').length, 0);
  assert.ok(Math.abs(wrapAngle(enemy.heading + Math.PI / 2)) < degToRad(30), 'it turns towards the player instead');
});

test('BR-03 the enemy drives at no more than K-20 and turns at no more than its level\'s rate', () => {
  const { state, enemy } = duel({ x: 140, z: 0 }, 0);
  const maxMove = CONFIG.enemyDriveSpeed * CONFIG.stepSeconds + 1e-9;
  const maxTurn = degToRad(CONFIG.difficulty[0].turnRateDeg) * CONFIG.stepSeconds + 1e-9;
  let moved = 0;
  for (let i = 0; i < 240; i++) {
    step(state, idle);
    assert.ok(distance(enemy.pos, enemy.prevPos) <= maxMove);
    assert.ok(Math.abs(wrapAngle(enemy.heading - enemy.prevHeading)) <= maxTurn);
    moved += distance(enemy.pos, enemy.prevPos);
  }
  assert.ok(moved > 5, 'it really moved');
});

test('enemy-aiming is emitted once each time the enemy enters Aim', () => {
  const { state, enemy } = duel({ x: 60, z: 0 }, -Math.PI / 2 + degToRad(30));
  /** @type {number[]} */
  const ticks = [];
  for (let i = 0; i < 30; i++) {
    step(state, idle);
    for (const e of eventsOf(state, 'enemy-aiming')) {
      assert.equal(e.tankId, enemy.id);
      ticks.push(e.tick);
    }
  }
  assert.deepEqual(ticks, [0]);
});

test('a tank of an unregistered kind stands still and holds fire, even one named after an Object property', () => {
  for (const kind of ['nobody', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    const { state, enemy } = duel({ x: 60, z: 0 });
    enemy.kind = kind;
    run(state, idle, 30);
    assert.deepEqual(enemy.pos, { x: 60, z: 0 }, kind);
    assert.equal(state.shells.length, 0, kind);
  }
});

test('AC-06.5 with a wall between them, in at least 95 of 100 seeds the enemy fires within 30 s and never overlaps an obstacle', () => {
  let fired = 0;
  for (let seed = 0; seed < 100; seed++) {
    const jitter = { rng: normaliseSeed(seed * 7919 + 1) };
    // The wall at (-20, -70) runs 12 u along x. The player waits north of it,
    // facing away; the enemy starts south of it.
    const { state, enemy } = duel({ x: -20 + nextRange(jitter, -5, 5), z: -95 + nextRange(jitter, -5, 5) }, undefined, seed);
    player(state).pos = { x: -20, z: -50 };
    assert.ok(isClear(enemy.pos, CONFIG.tankRadius, state.obstacles, CONFIG.arenaHalfSize));
    for (let i = 0; i < stepsFor(30); i++) {
      step(state, idle);
      assert.ok(isClear(enemy.pos, CONFIG.tankRadius, state.obstacles, CONFIG.arenaHalfSize), `seed ${seed} step ${i}`);
      if (eventsOf(state, 'shot').some((e) => e.tankId === enemy.id)) {
        fired += 1;
        break;
      }
    }
  }
  assert.ok(fired >= 95, `${fired} of 100`);
});

test('AC-06.7 NFR-21 the same seed and inputs give the same enemy path and shots', () => {
  /** @param {number} tick */
  const script = (tick) => input({ throttle: tick % 300 < 200 ? 1 : 0, turn: Math.floor(tick / 100) % 3 - 1, firePressed: tick % 50 === 0 });
  const record = () => {
    const state = createWorld(2026, CONFIG);
    newGame(state, CONFIG);
    const log = [];
    for (let i = 0; i < 1800; i++) {
      step(state, script(state.tick));
      log.push(JSON.stringify(state));
    }
    return log;
  };
  const a = record();
  assert.deepEqual(a, record());
  assert.ok(a.some((s) => s.includes('"type":"shot"')), 'shots were fired');
});

test('a paused game holds still: prevPos and prevHeading match the current values for tanks and shells', () => {
  const { state } = duel({ x: 140, z: 0 }, 0);
  step(state, input({ throttle: 1, turn: 1, firePressed: true }));
  step(state, input({ throttle: 1, commands: ['pause'] }));
  assert.equal(state.screen, 'paused');
  for (const t of state.tanks) {
    assert.deepEqual(t.prevPos, t.pos);
    assert.equal(t.prevHeading, t.heading);
  }
  assert.ok(state.shells.length > 0);
  for (const s of state.shells) assert.deepEqual(s.prevPos, s.pos);
});

test('the Game over screen holds still too', () => {
  const { state, enemy } = duel({ x: 140, z: 0 }, 0);
  state.lives = 1;
  state.shells.push({ id: 901, ownerId: enemy.id, side: 'enemy', pos: { x: 1, z: -5 }, prevPos: { x: 1, z: -5 }, vel: { x: 0, z: 600 }, ticksLeft: 10 });
  step(state, idle);
  run(state, idle, stepsFor(CONFIG.gameOverDelaySeconds) + 1);
  assert.equal(state.screen, 'gameover');
  for (const t of state.tanks) assert.deepEqual(t.prevPos, t.pos);
});
