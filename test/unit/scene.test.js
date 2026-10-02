// UT-SCENE: what goes into the segment list, interpolation, culling, the sky.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../../site/src/core/config.js';
import { MODELS } from '../../site/src/core/models.js';
import { createWorld } from '../../site/src/core/world.js';
import { cameraAt, projectBuckets } from '../../site/src/render/camera.js';
import { PALETTE_SPEC, STROKE_KEYS, clearBuckets, createBuckets } from '../../site/src/render/palette.js';
import { buildScene, buildSky, cameraFor } from '../../site/src/render/scene.js';
import { close, player, playing } from './support.js';

const VP = { width: 1600, height: 900 };

/** @param {import('../../site/src/core/world.js').GameState} state @param {number} [alpha] */
function scene(state, alpha = 1) {
  const out = createBuckets(6);
  const cam = cameraFor(state, alpha);
  const total = buildScene(state, alpha, cam, out);
  return { out, cam, total };
}

test('M11 P4 the models are the Designer\'s line art: edge counts and valid indices', () => {
  assert.equal(MODELS.tank.edges.length, 33);
  assert.equal(MODELS.pillar.edges.length, 18);
  assert.equal(MODELS.wall.edges.length, 16);
  assert.equal(MODELS.hedgehog.edges.length, 12);
  assert.equal(MODELS.shell.edges.length, 12);
  for (const m of Object.values(MODELS)) {
    for (const [a, b] of m.edges) assert.ok(a < m.vertices.length && b < m.vertices.length);
  }
  assert.ok(Object.isFrozen(MODELS.tank.vertices[0]));
});

test('NFR performance: the palette buffers hold at most 1,500 segments in all', () => {
  const total = STROKE_KEYS.reduce((n, k) => n + PALETTE_SPEC[k].capacity, 0);
  assert.ok(total <= 1500, `${total}`);
});

test('the camera is the player\'s eye, interpolated between steps with alpha', () => {
  const { state } = playing();
  const p = player(state);
  p.prevPos = { x: 0, z: 0 };
  p.pos = { x: 0, z: 2 };
  p.prevHeading = 0;
  p.heading = 0.2;
  const cam = cameraFor(state, 0.5);
  close(cam.z, 1);
  close(cam.heading, 0.1);
  close(cam.y, CONFIG.eyeHeight);
});

test('the first frame shows the first pillar straight ahead (UX_SPEC.md 7.5)', () => {
  const state = createWorld(1, CONFIG);
  const { out, cam } = scene(state);
  const out2 = createBuckets(4);
  projectBuckets(out, cam, VP, CONFIG.fovVerticalDeg, CONFIG.nearPlane, out2, STROKE_KEYS);
  let central = 0;
  for (let i = 0; i < out2.world.count; i++) {
    const x = out2.world.data[i * 4];
    if (Math.abs(x - 800) < 60) central += 1;
  }
  assert.ok(central >= 10, `${central} segments near the centre`);
});

test('M7 an enemy is drawn in enemy colour, or dashed during its grace period (UX_SPEC.md 7.6)', () => {
  const { state, enemy } = playing();
  enemy.graceTicks = 0;
  let r = scene(state);
  assert.equal(r.out.enemy.count, MODELS.tank.edges.length);
  assert.equal(r.out.enemyGrace.count, 0);
  enemy.graceTicks = 10;
  r = scene(state);
  assert.equal(r.out.enemy.count, 0);
  assert.equal(r.out.enemyGrace.count, MODELS.tank.edges.length);
});

test('the player\'s own tank is never drawn, and a dead enemy is not drawn', () => {
  const { state, enemy } = playing();
  enemy.alive = false;
  const r = scene(state);
  assert.equal(r.out.enemy.count + r.out.enemyGrace.count, 0);
});

test('shells are drawn by side, at shell height, interpolated', () => {
  const { state, enemy } = playing();
  state.shells.push({ id: 90, ownerId: state.playerId, side: 'player', pos: { x: 0, z: 12 }, prevPos: { x: 0, z: 10 }, vel: { x: 0, z: 80 }, ticksLeft: 9 });
  state.shells.push({ id: 91, ownerId: enemy.id, side: 'enemy', pos: { x: 50, z: 0 }, prevPos: { x: 52, z: 0 }, vel: { x: -80, z: 0 }, ticksLeft: 9 });
  const r = scene(state, 0.5);
  assert.equal(r.out.playerShell.count, MODELS.shell.edges.length);
  assert.equal(r.out.enemyShell.count, MODELS.shell.edges.length);
  // The first edge starts at model vertex (0.3, 0, 0): halfway, z = 11, at shell height.
  const d = r.out.playerShell.data;
  close(d[1], CONFIG.shellHeight, 1e-5); // Float32 buffers
  close(d[2], 11, 1e-5);
});

test('objects wholly behind the camera are culled before projection', () => {
  const { state } = playing();
  const ahead = scene(state).out.world.count;
  player(state).heading = Math.PI; // the first pillar is now behind
  player(state).prevHeading = Math.PI;
  const behind = scene(state).out.world.count;
  assert.notEqual(ahead, behind);
});

test('objects beyond the far distance are culled', () => {
  const state = createWorld(1, CONFIG);
  const p = player(state);
  p.pos = { x: -240, z: -240 };
  p.prevPos = { ...p.pos };
  p.heading = Math.PI / 4; // looking across the whole arena
  p.prevHeading = p.heading;
  const near = scene(state).total;
  const config = { ...CONFIG, farDistance: 100 };
  const out = createBuckets(6);
  const total = buildScene(state, 1, cameraFor(state, 1), out, config);
  assert.ok(total < near, `${total} < ${near}`);
});

test('M2 C2 the sky is a full-width horizon at eye level plus a ridge that turns with the view', () => {
  const out = createBuckets(4);
  const n = buildSky(cameraAt({ x: 0, z: 0 }, 0, 2.2), VP, CONFIG, out.horizon);
  assert.ok(n > 1);
  assert.deepEqual(Array.from(out.horizon.data.slice(0, 4)), [0, 450, 1600, 450]);
  const first = Array.from(out.horizon.data.slice(4, out.horizon.count * 4));
  clearBuckets(out);
  buildSky(cameraAt({ x: 100, z: -50 }, 0, 2.2), VP, CONFIG, out.horizon);
  assert.deepEqual(Array.from(out.horizon.data.slice(4, out.horizon.count * 4)), first, 'moving never brings the ridge closer');
  clearBuckets(out);
  buildSky(cameraAt({ x: 0, z: 0 }, 0.3, 2.2), VP, CONFIG, out.horizon);
  assert.notDeepEqual(Array.from(out.horizon.data.slice(4, out.horizon.count * 4)), first, 'turning moves it');
});
