// UT-MOVE and UT-DET: one simulation step with player movement and collisions.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isClear } from '../../site/src/core/collision.js';
import { CONFIG } from '../../site/src/core/config.js';
import { degToRad, distance } from '../../site/src/core/math.js';
import { step } from '../../site/src/core/sim.js';
import { createWorld } from '../../site/src/core/world.js';

/** @typedef {import('../../site/src/core/sim.js').InputSnapshot} InputSnapshot */

/** @param {Partial<InputSnapshot>} [over] @returns {InputSnapshot} */
const input = (over = {}) => ({ throttle: 0, turn: 0, firePressed: false, commands: [], ...over });

const close = (/** @type {number} */ a, /** @type {number} */ b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${a} is not close to ${b}`);

/** @param {ReturnType<typeof createWorld>} state @param {InputSnapshot} snapshot @param {number} n */
function run(state, snapshot, n) {
  for (let i = 0; i < n; i++) step(state, snapshot);
}

const player = (/** @type {ReturnType<typeof createWorld>} */ state) =>
  /** @type {import('../../site/src/core/world.js').Tank} */ (state.tanks.find((t) => t.id === state.playerId));

test('a step advances the tick by one and clears last step\'s events', () => {
  const state = createWorld(1, CONFIG);
  state.events.push({ type: 'shot', tick: 0 });
  step(state, input());
  assert.equal(state.tick, 1);
  assert.deepEqual(state.events, []);
});

test('a step copies each tank\'s position and heading into prevPos and prevHeading first', () => {
  const state = createWorld(1, CONFIG);
  step(state, input({ throttle: 1, turn: 1 }));
  const p = player(state);
  const before = { pos: { ...p.pos }, heading: p.heading };
  step(state, input({ throttle: 1, turn: 1 }));
  assert.deepEqual(p.prevPos, before.pos);
  assert.equal(p.prevHeading, before.heading);
  assert.notDeepEqual(p.pos, p.prevPos);
  assert.notEqual(p.prevPos, p.pos, 'prevPos is a copy, not the same object');
});

test('AC-03.1 BR-02 forward moves the player along its heading at K-02', () => {
  const state = createWorld(1, CONFIG);
  run(state, input({ throttle: 1 }), 60);
  close(player(state).pos.x, 0);
  close(player(state).pos.z, CONFIG.playerForwardSpeed);
});

test('AC-03.2 BR-02 reverse moves the player backwards at K-03', () => {
  const state = createWorld(1, CONFIG);
  run(state, input({ throttle: -1 }), 60);
  close(player(state).pos.z, -CONFIG.playerReverseSpeed);
});

test('AC-03.3 BR-02 turn right turns clockwise at K-04; turn left turns the other way', () => {
  const right = createWorld(1, CONFIG);
  run(right, input({ turn: 1 }), 60);
  close(player(right).heading, degToRad(CONFIG.playerTurnRateDeg));
  assert.deepEqual(player(right).pos, { x: 0, z: 0 }, 'turning on the spot does not move');
  const left = createWorld(1, CONFIG);
  run(left, input({ turn: -1 }), 30);
  close(player(left).heading, -degToRad(CONFIG.playerTurnRateDeg) / 2);
});

test('the heading stays wrapped in (-pi, pi]', () => {
  const state = createWorld(1, CONFIG);
  run(state, input({ turn: 1 }), 60 * 3); // 270 degrees
  close(player(state).heading, -Math.PI / 2);
});

test('AC-03.4 BR-02 turning and driving combine: a full circle comes back to the start', () => {
  const state = createWorld(1, CONFIG);
  run(state, input({ throttle: 1, turn: 1 }), 60 * 4); // 360 degrees in 4 s
  const p = player(state);
  assert.ok(distance(p.pos, { x: 0, z: 0 }) < 0.05, `ended at ${p.pos.x}, ${p.pos.z}`);
  // Radius of the circle is speed / turn rate = 12 / (pi / 2), so it swings out to +x.
  run(state, input({ throttle: 1, turn: 1 }), 120);
  close(p.pos.x, 2 * CONFIG.playerForwardSpeed / (Math.PI / 2), 0.05);
});

test('throttle and turn outside -1..1 are clamped, so the speed limit holds', () => {
  const state = createWorld(1, CONFIG);
  run(state, input({ throttle: 5, turn: -9 }), 1);
  close(distance(player(state).pos, { x: 0, z: 0 }), CONFIG.playerForwardSpeed * CONFIG.stepSeconds);
  close(player(state).heading, -degToRad(CONFIG.playerTurnRateDeg) * CONFIG.stepSeconds);
});

test('AC-05.2 BR-04 the player cannot drive into the first pillar and ends touching it', () => {
  const state = createWorld(1, CONFIG);
  run(state, input({ throttle: 1 }), 60 * 5); // 60 u of driving, the pillar is 45 u ahead
  const p = player(state);
  close(p.pos.z, 45 - 2.5 - CONFIG.tankRadius, 1e-3);
  assert.ok(isClear(p.pos, CONFIG.tankRadius, state.obstacles, CONFIG.arenaHalfSize));
});

test('AC-05.4 BR-05 the player cannot leave the arena', () => {
  const state = createWorld(1, CONFIG);
  run(state, input({ throttle: -1 }), 60 * 50); // 300 u of reversing towards -z
  close(player(state).pos.z, -(CONFIG.arenaHalfSize - CONFIG.tankRadius));
});

test('BR-04 the player cannot drive into another tank', () => {
  const state = createWorld(1, CONFIG);
  const enemy = { ...player(state), id: state.nextId++, side: /** @type {const} */ ('enemy'), kind: 'hunter', pos: { x: 0, z: 20 }, prevPos: { x: 0, z: 20 } };
  state.tanks.push(enemy);
  run(state, input({ throttle: 1 }), 60 * 3);
  close(player(state).pos.z, 20 - 2 * CONFIG.tankRadius, 1e-3);
  assert.deepEqual(enemy.pos, { x: 0, z: 20 }, 'the skeleton does not move enemies yet (D3)');
  assert.deepEqual(enemy.prevPos, enemy.pos);
});

test('a destroyed player does not move', () => {
  const state = createWorld(1, CONFIG);
  player(state).alive = false;
  run(state, input({ throttle: 1, turn: 1 }), 10);
  assert.deepEqual(player(state).pos, { x: 0, z: 0 });
  assert.equal(player(state).heading, 0);
});

test('UT-DET NFR-21 the same seed and inputs give an identical state log', () => {
  /** @param {number} tick */
  const script = (tick) => input({ throttle: tick % 200 < 120 ? 1 : -1, turn: Math.floor(tick / 90) % 3 - 1 });
  const record = () => {
    const state = createWorld(77, CONFIG);
    const log = [];
    for (let i = 0; i < 600; i++) {
      step(state, script(state.tick));
      log.push(JSON.stringify(state));
    }
    return log;
  };
  assert.deepEqual(record(), record());
});
