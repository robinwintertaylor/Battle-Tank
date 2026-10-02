// UT-CONFIG and UT-SPAWN (player spawn): the world a new game starts from.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../../site/src/core/config.js';
import { degToRad, distance } from '../../site/src/core/math.js';
import { createWorld, fencePosts, footprintRadius } from '../../site/src/core/world.js';

test('createWorld builds the starting state', () => {
  const state = createWorld(42, CONFIG);
  assert.equal(state.screen, 'start');
  assert.equal(state.tick, 0);
  assert.equal(state.rng, 42);
  assert.equal(state.score, 0);
  assert.equal(state.lives, CONFIG.startingLives);
  assert.equal(state.level, 1);
  assert.deepEqual(state.shells, []);
  assert.deepEqual(state.events, []);
});

test('BR-13 K-21 the player starts at the arena centre facing heading 0', () => {
  const state = createWorld(1, CONFIG);
  assert.equal(state.tanks.length, 1);
  const player = state.tanks[0];
  assert.equal(player.id, state.playerId);
  assert.equal(player.side, 'player');
  assert.deepEqual(player.pos, { x: 0, z: 0 });
  assert.deepEqual(player.prevPos, { x: 0, z: 0 });
  assert.equal(player.heading, 0);
  assert.equal(player.prevHeading, 0);
  assert.equal(player.alive, true);
  assert.deepEqual(player.control, { type: 'player' });
});

test('ids are unique and nextId is past all of them', () => {
  const state = createWorld(1, CONFIG);
  const ids = [...state.tanks.map((t) => t.id), ...state.obstacles.map((o) => o.id)];
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id < state.nextId));
});

test('AC-05.1 BR-06 K-24 the obstacles are the fixed layout, the same for every seed', () => {
  const a = createWorld(1, CONFIG);
  const b = createWorld(987654, CONFIG);
  assert.equal(a.obstacles.length, CONFIG.obstacleCount);
  assert.deepEqual(a.obstacles, b.obstacles);
  const wall = a.obstacles[2];
  assert.equal(wall.model, 'wall');
  assert.deepEqual(wall.pos, { x: 40, z: 20 });
  assert.equal(wall.yaw, degToRad(60));
  assert.deepEqual(wall.footprint, CONFIG.footprints.wall);
});

test('the state is plain data: it survives a JSON round trip unchanged', () => {
  const state = createWorld(3, CONFIG);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('AC-05.6 K-22 no obstacle footprint lies within the clear radius of the player spawn', () => {
  const state = createWorld(1, CONFIG);
  const spawn = { x: CONFIG.playerSpawn.x, z: CONFIG.playerSpawn.z };
  for (const o of state.obstacles) {
    const gap = distance(o.pos, spawn) - footprintRadius(o.footprint);
    assert.ok(gap >= CONFIG.spawnClearRadius, `obstacle ${o.id} is ${gap} u from spawn`);
  }
});

test('BR-06 every footprint lies inside the boundary', () => {
  const state = createWorld(1, CONFIG);
  for (const o of state.obstacles) {
    const r = footprintRadius(o.footprint);
    assert.ok(Math.abs(o.pos.x) + r <= CONFIG.arenaHalfSize, `obstacle ${o.id} x`);
    assert.ok(Math.abs(o.pos.z) + r <= CONFIG.arenaHalfSize, `obstacle ${o.id} z`);
  }
});

test('BR-06 every gap is wide enough for a tank, so every open area is reachable', () => {
  // Bounding circles are conservative: if a tank fits between them, it fits between the shapes.
  const { obstacles } = createWorld(1, CONFIG);
  const tankWidth = 2 * CONFIG.tankRadius;
  for (let i = 0; i < obstacles.length; i++) {
    for (let j = i + 1; j < obstacles.length; j++) {
      const a = obstacles[i];
      const b = obstacles[j];
      const gap = distance(a.pos, b.pos) - footprintRadius(a.footprint) - footprintRadius(b.footprint);
      assert.ok(gap > tankWidth, `gap between ${a.id} and ${b.id} is ${gap} u`);
    }
    const o = obstacles[i];
    const r = footprintRadius(o.footprint);
    const toEdge = CONFIG.arenaHalfSize - Math.max(Math.abs(o.pos.x), Math.abs(o.pos.z)) - r;
    assert.ok(toEdge > tankWidth, `obstacle ${o.id} is ${toEdge} u from the boundary`);
  }
});

test('footprintRadius gives the bounding circle of each footprint shape', () => {
  assert.equal(footprintRadius({ type: 'circle', radius: 2.5 }), 2.5);
  assert.equal(footprintRadius({ type: 'rect', halfLength: 3, halfWidth: 4 }), 5);
});

test('AC-05.7 the fence has a post every 25 u at K-01 = 250: 80 posts', () => {
  const posts = fencePosts(250);
  assert.equal(posts.length, 80);
  assert.equal(new Set(posts.map((p) => `${p.x},${p.z}`)).size, 80);
  for (const p of posts) {
    assert.ok(Math.abs(p.x) === 250 || Math.abs(p.z) === 250, `post ${p.x},${p.z} is on the boundary`);
  }
  for (const corner of [[-250, -250], [250, -250], [250, 250], [-250, 250]]) {
    assert.ok(posts.some((p) => p.x === corner[0] && p.z === corner[1]), `corner ${corner}`);
  }
  // Posts are in order round the boundary, 25 u apart, so the rail joins neighbours.
  for (let i = 0; i < posts.length; i++) {
    const next = posts[(i + 1) % posts.length];
    assert.ok(Math.abs(distance(posts[i], next) - 25) < 1e-9);
  }
});

test('the fence follows K-01: posts are evenly spaced at the nearest spacing to 25 u', () => {
  // 2 * 110 = 220 u per side: 9 gaps of 24.44 u is nearer to 25 than 8 gaps of 27.5 u.
  const posts = fencePosts(110);
  assert.equal(posts.length, 36);
  for (let i = 0; i < posts.length; i++) {
    const next = posts[(i + 1) % posts.length];
    assert.ok(Math.abs(distance(posts[i], next) - 220 / 9) < 1e-9);
  }
});

test('createWorld takes its numbers from the config it is given', () => {
  const config = { ...CONFIG, startingLives: 5, playerSpawn: Object.freeze({ x: 10, z: -10, headingDeg: 90 }) };
  const state = createWorld(1, config);
  assert.equal(state.lives, 5);
  assert.deepEqual(state.tanks[0].pos, { x: 10, z: -10 });
  assert.equal(state.tanks[0].heading, degToRad(90));
});

test('the seed is stored as an unsigned 32-bit integer', () => {
  assert.equal(createWorld(-1, CONFIG).rng, 0xffffffff);
});
