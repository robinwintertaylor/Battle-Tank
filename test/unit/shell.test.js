// UT-SHELL: firing, one shell per tank, player reload, range and removal.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../../site/src/core/config.js';
import { degToRad, distance, forward } from '../../site/src/core/math.js';
import { step, tryFire } from '../../site/src/core/sim.js';
import { close, eventsOf, input, player, playing, run } from './support.js';

const fire = input({ firePressed: true });
const idle = input();

test('AC-04.1 BR-07 a press fires one shell from the muzzle along the heading at K-05', () => {
  const { state } = playing();
  player(state).heading = degToRad(30);
  step(state, fire);
  assert.equal(state.shells.length, 1);
  const shell = state.shells[0];
  const dir = forward(degToRad(30));
  const muzzle = { x: dir.x * CONFIG.muzzleDistance, z: dir.z * CONFIG.muzzleDistance };
  close(shell.prevPos.x, muzzle.x);
  close(shell.prevPos.z, muzzle.z);
  close(Math.hypot(shell.vel.x, shell.vel.z), CONFIG.shellSpeed);
  close(shell.vel.x / CONFIG.shellSpeed, dir.x);
  close(distance(shell.pos, shell.prevPos), CONFIG.shellSpeed * CONFIG.stepSeconds);
  assert.equal(shell.ownerId, state.playerId);
  assert.deepEqual(eventsOf(state, 'shot').map((e) => e.tankId), [state.playerId]);
});

test('BR-07 the muzzle is outside the firing tank\'s own hit radius', () => {
  assert.ok(CONFIG.muzzleDistance > CONFIG.tankRadius);
});

test('AC-04.2 BR-08 a press with a shell in flight fires nothing and queues nothing', () => {
  const { state } = playing();
  player(state).heading = degToRad(-90); // towards -x, away from the enemy, open ground
  step(state, fire);
  run(state, idle, 40); // past the reload, shell still in flight
  step(state, fire);
  assert.equal(state.shells.length, 1);
  assert.equal(eventsOf(state, 'shot').length, 0);
  run(state, idle, 200); // the first shell runs out of range
  assert.equal(state.shells.length, 0, 'the ignored press was not queued');
});

test('AC-04.3 holding fire does not fire again: firePressed is an edge, so only a fresh press fires', () => {
  const { state } = playing();
  player(state).heading = degToRad(-90);
  step(state, fire);
  run(state, idle, 200);
  assert.equal(state.shells.length, 0);
  step(state, fire);
  assert.equal(state.shells.length, 1);
});

test('AC-04.4 BR-08 a shell that meets nothing is removed after K-06 and the player can fire again', () => {
  const { state } = playing();
  player(state).heading = degToRad(-90);
  step(state, fire);
  const start = { ...state.shells[0].prevPos };
  const steps = Math.round(CONFIG.shellRange / CONFIG.shellSpeed / CONFIG.stepSeconds);
  run(state, idle, steps - 2); // the shell also moves in the step it is fired
  assert.equal(state.shells.length, 1);
  close(distance(state.shells[0].pos, start), CONFIG.shellRange - CONFIG.shellSpeed * CONFIG.stepSeconds, 1e-6);
  step(state, idle);
  assert.equal(state.shells.length, 0);
  step(state, fire);
  assert.equal(state.shells.length, 1);
});

test('AC-04.5 BR-08 the player cannot fire again until K-26 after the last shot, and can at K-26', () => {
  const { state } = playing();
  player(state).heading = degToRad(-90);
  step(state, fire);
  state.shells.length = 0; // the shell is gone at once, so only the reload holds
  const reloadSteps = Math.round(CONFIG.playerReloadSeconds / CONFIG.stepSeconds);
  run(state, idle, reloadSteps - 2);
  step(state, fire); // 29 steps after the shot
  assert.equal(state.shells.length, 0);
  step(state, fire); // 30 steps = 0.5 s after the shot
  assert.equal(state.shells.length, 1);
});

test('BR-15 AC-06.2 an enemy in its grace period does not fire', () => {
  const { state, enemy } = playing();
  enemy.graceTicks = 1;
  assert.equal(tryFire(state, enemy, true, CONFIG), false);
  enemy.graceTicks = 0;
  assert.equal(tryFire(state, enemy, true, CONFIG), true);
});

test('BR-16 AC-06.3 an enemy aimed within its tolerance fires, and reloads for its level\'s time', () => {
  const { state, enemy } = playing();
  enemy.heading += degToRad(CONFIG.difficulty[0].aimToleranceDeg - 0.1);
  assert.equal(tryFire(state, enemy, true, CONFIG), true);
  assert.equal(state.shells[0].ownerId, enemy.id);
  assert.equal(enemy.reload, Math.round(CONFIG.difficulty[0].reloadSeconds / CONFIG.stepSeconds));
});

test('BR-16 AC-06.4 an enemy aimed beyond its tolerance does not fire', () => {
  const { state, enemy } = playing();
  enemy.heading -= degToRad(CONFIG.difficulty[0].aimToleranceDeg + 0.1);
  assert.equal(tryFire(state, enemy, true, CONFIG), false);
  assert.equal(state.shells.length, 0);
});

test('BR-16 AC-06.6 an enemy with a shell in flight, or still reloading, does not fire', () => {
  const { state, enemy } = playing();
  assert.equal(tryFire(state, enemy, true, CONFIG), true);
  enemy.reload = 0;
  assert.equal(tryFire(state, enemy, true, CONFIG), false, 'shell in flight');
  state.shells.length = 0;
  enemy.reload = 1;
  assert.equal(tryFire(state, enemy, true, CONFIG), false, 'reloading');
});

test('BR-13 the enemy does not fire while the player is dead', () => {
  const { state, enemy } = playing();
  player(state).alive = false;
  state.screen = 'respawning';
  assert.equal(tryFire(state, enemy, true, CONFIG), false);
});

test('a tank that does not want to fire, or is dead, does not fire', () => {
  const { state, enemy } = playing();
  assert.equal(tryFire(state, enemy, false, CONFIG), false);
  enemy.alive = false;
  assert.equal(tryFire(state, enemy, true, CONFIG), false);
});

test('BR-05 BR-08 a shell that reaches the boundary is removed', () => {
  const { state } = playing();
  const p = player(state);
  p.pos = { x: -240, z: 0 };
  p.heading = degToRad(-90);
  step(state, fire);
  run(state, idle, 10);
  assert.equal(state.shells.length, 0);
});

test('AC-05.3 BR-08 a shell that enters an obstacle footprint is removed with a shell-blocked event', () => {
  const { state } = playing(); // the first pillar is 45 u ahead of the start
  step(state, fire);
  /** @type {import('../../site/src/core/world.js').GameEvent[]} */
  const blocked = [];
  for (let i = 0; i < 60 && state.shells.length > 0; i++) {
    step(state, idle);
    blocked.push(...eventsOf(state, 'shell-blocked'));
  }
  assert.equal(state.shells.length, 0);
  assert.equal(blocked.length, 1);
  close(/** @type {{ z: number }} */ (blocked[0].pos).z, 45 - 2.5, 1e-6);
});
