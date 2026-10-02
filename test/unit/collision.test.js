// UT-COLL and UT-HIT: ground-plane collision for tanks and swept shells.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isClear, resolveTankMove, sweepShell } from '../../site/src/core/collision.js';
import { CONFIG } from '../../site/src/core/config.js';
import { degToRad, distance } from '../../site/src/core/math.js';
import { nextRange, normaliseSeed } from '../../site/src/core/rng.js';
import { createWorld } from '../../site/src/core/world.js';

const R = CONFIG.tankRadius;
const H = CONFIG.arenaHalfSize;

/** @returns {import('../../site/src/core/world.js').Obstacle} */
function pillar(x = 0, z = 0, id = 1) {
  return { id, model: 'pillar', pos: { x, z }, yaw: 0, footprint: { type: 'circle', radius: 2.5 } };
}

/** @returns {import('../../site/src/core/world.js').Obstacle} */
function wall(x = 0, z = 0, yawDeg = 0, id = 2) {
  return { id, model: 'wall', pos: { x, z }, yaw: degToRad(yawDeg), footprint: { type: 'rect', halfLength: 6, halfWidth: 0.5 } };
}

const close = (/** @type {number} */ a, /** @type {number} */ b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `${a} is not close to ${b}`);

// --- isClear ---------------------------------------------------------------

test('isClear: open ground is clear', () => {
  assert.equal(isClear({ x: 20, z: 0 }, R, [pillar()], H), true);
});

test('isClear: a tank overlapping a circle footprint is not clear; touching is clear', () => {
  assert.equal(isClear({ x: 5.4, z: 0 }, R, [pillar()], H), false);
  assert.equal(isClear({ x: 5.5, z: 0 }, R, [pillar()], H), true);
});

test('isClear: a rotated wall footprint follows its yaw', () => {
  // A wall rotated 90 degrees runs along z, so its long side is now north-south.
  const w = wall(0, 0, 90);
  assert.equal(isClear({ x: 0, z: 8 }, R, [w], H), false, 'inside the end of the rotated wall');
  assert.equal(isClear({ x: 4, z: 0 }, R, [w], H), true, 'beside the thin side');
  assert.equal(isClear({ x: 3.4, z: 0 }, R, [w], H), false, 'overlapping the thin side');
  assert.equal(isClear({ x: 8, z: 0 }, R, [wall(0, 0, 0)], H), false, 'unrotated wall runs along x');
});

test('BR-05 isClear: a tank must stay K-07 inside the boundary', () => {
  assert.equal(isClear({ x: H - R, z: 0 }, R, [], H), true);
  assert.equal(isClear({ x: H - R + 0.01, z: 0 }, R, [], H), false);
  assert.equal(isClear({ x: 0, z: -(H - R + 0.01) }, R, [], H), false);
});

// --- resolveTankMove -------------------------------------------------------

test('UT-COLL a free move is unchanged', () => {
  const to = resolveTankMove({ x: 0, z: 0 }, { x: 0.1, z: 0.2 }, R, [pillar(50, 50)], H, []);
  assert.deepEqual(to, { x: 0.1, z: 0.2 });
});

test('BR-04 a tank driving into a pillar stops outside it', () => {
  const p = pillar(0, 10);
  let pos = { x: 0, z: 0 };
  for (let i = 0; i < 100; i++) {
    pos = resolveTankMove(pos, { x: pos.x, z: pos.z + 0.2 }, R, [p], H, []);
    assert.ok(isClear(pos, R, [p], H), `overlap at step ${i}`);
  }
  close(pos.z, 10 - 2.5 - R, 1e-3);
});

test('BR-04 a tank slides along a wall it meets at an angle', () => {
  // Wall along x at z = 10. Drive diagonally into it: z is blocked, x keeps moving.
  const w = wall(0, 10, 0);
  let pos = { x: -4, z: 5 };
  for (let i = 0; i < 40; i++) {
    pos = resolveTankMove(pos, { x: pos.x + 0.1414, z: pos.z + 0.1414 }, R, [w], H, []);
    assert.ok(isClear(pos, R, [w], H), `overlap at step ${i}`);
  }
  close(pos.z, 10 - 0.5 - R, 1e-3);
  assert.ok(pos.x > -4 + 40 * 0.1414 - 0.01, `x only reached ${pos.x}`);
});

test('BR-05 a tank driving at the boundary is held K-07 inside it and slides along it', () => {
  const to = resolveTankMove({ x: H - R - 0.05, z: 0 }, { x: H - R + 0.15, z: 0.1 }, R, [], H, []);
  assert.deepEqual(to, { x: H - R, z: 0.1 });
  const corner = resolveTankMove({ x: -(H - R), z: -(H - R) }, { x: -H, z: -H }, R, [], H, []);
  assert.deepEqual(corner, { x: -(H - R), z: -(H - R) });
});

test('BR-04 a tank cannot overlap another tank', () => {
  const other = { x: 0, z: 7 };
  let pos = { x: 0, z: 0 };
  for (let i = 0; i < 50; i++) {
    pos = resolveTankMove(pos, { x: pos.x, z: pos.z + 0.2 }, R, [], H, [other]);
    assert.ok(distance(pos, other) >= 2 * R, `overlap at step ${i}`);
  }
  close(pos.z, 7 - 2 * R, 1e-3);
});

test('BR-04 a tank that cannot fit through a gap stays out of it', () => {
  // Two pillars 10 u apart leave a 5 u gap, narrower than the 6 u tank.
  const pillars = [pillar(-5, 10, 1), pillar(5, 10, 2)];
  let pos = { x: 0, z: 0 };
  for (let i = 0; i < 100; i++) {
    pos = resolveTankMove(pos, { x: pos.x, z: pos.z + 0.2 }, R, pillars, H, []);
    assert.ok(isClear(pos, R, pillars, H), `overlap at step ${i}`);
  }
  assert.ok(pos.z < 10, `tank squeezed through to z = ${pos.z}`);
});

test('BR-04 a tank wedged in a corner between a wall and a pillar never overlaps', () => {
  const obstacles = [wall(0, 10, 0, 1), pillar(-4, 5, 2)];
  let pos = { x: 4, z: 3 };
  for (let i = 0; i < 200; i++) {
    pos = resolveTankMove(pos, { x: pos.x - 0.12, z: pos.z + 0.12 }, R, obstacles, H, []);
    assert.ok(isClear(pos, R, obstacles, H), `overlap at step ${i}: ${pos.x}, ${pos.z}`);
  }
});

test('BR-04 property: random drives over the real layout never overlap anything', () => {
  const { obstacles } = createWorld(1, CONFIG);
  const rng = { rng: normaliseSeed(2026) };
  const other = { x: 0, z: 30 };
  for (let run = 0; run < 20; run++) {
    let pos = { x: 0, z: 0 };
    let heading = nextRange(rng, -Math.PI, Math.PI);
    for (let i = 0; i < 1500; i++) {
      if (i % 30 === 0) heading = nextRange(rng, -Math.PI, Math.PI);
      const speed = 3; // far faster than any tank, to stress the push-out
      const to = { x: pos.x + Math.sin(heading) * speed, z: pos.z + Math.cos(heading) * speed };
      pos = resolveTankMove(pos, to, R, obstacles, H, [other]);
      assert.ok(isClear(pos, R, obstacles, H), `run ${run} step ${i} overlaps at ${pos.x}, ${pos.z}`);
      assert.ok(distance(pos, other) >= 2 * R, `run ${run} step ${i} overlaps the other tank`);
    }
  }
});

test('a move that starts exactly on an obstacle centre still ends clear', () => {
  const p = pillar(0, 0);
  const to = resolveTankMove({ x: 0, z: -6 }, { x: 0, z: 0 }, R, [p], H, []);
  assert.ok(isClear(to, R, [p], H));
});

test('BR-04 a move so fast it lands inside a wall leaves on the side it came from', () => {
  const w = wall(0, 0, 0);
  const fromSouth = resolveTankMove({ x: 2, z: -4 }, { x: 2, z: 0.1 }, R, [w], H, []);
  close(fromSouth.z, -(0.5 + R), 1e-3);
  const fromWest = resolveTankMove({ x: -10, z: 0 }, { x: -5, z: 0.1 }, R, [w], H, []);
  close(fromWest.x, -(6 + R), 1e-3);
  const fromEast = resolveTankMove({ x: 10, z: 0 }, { x: 5, z: 0 }, R, [w], H, []);
  close(fromEast.x, 6 + R, 1e-3);
  for (const p of [fromSouth, fromWest, fromEast]) assert.ok(isClear(p, R, [w], H));
});

test('BR-04 a tank already sitting on another tank is pushed clear of it', () => {
  const to = resolveTankMove({ x: 0, z: 0 }, { x: 0, z: 0 }, R, [], H, [{ x: 0, z: 0 }]);
  assert.ok(distance(to, { x: 0, z: 0 }) >= 2 * R);
});

test('BR-04 if no clear spot can be found, the tank stays where it was', () => {
  // A pillar in the corner pushes the tank out of the arena and the boundary pushes it back.
  const corner = [pillar(H - 5, H - 5)];
  const from = { x: H - 12, z: H - 12 };
  assert.deepEqual(resolveTankMove(from, { x: H, z: H }, R, corner, H, []), from);
});

// --- sweepShell ------------------------------------------------------------

const targets = (/** @type {Array<[number, number, number]>} */ ...list) =>
  list.map(([id, x, z]) => ({ id, pos: { x, z } }));

test('AC-07.1 BR-09 a shell whose path passes a tank centre hits it, at the right point', () => {
  const hit = sweepShell({ x: 0, z: 0 }, { x: 0, z: 20 }, [], H, targets([7, 0, 10]), R);
  assert.ok(hit);
  assert.equal(hit.kind, 'tank');
  assert.equal(hit.id, 7);
  close(hit.t, (10 - R) / 20);
});

test('AC-07.2 BR-09 a path 3.1 u from the centre misses and 2.9 u hits', () => {
  assert.equal(sweepShell({ x: 3.1, z: 0 }, { x: 3.1, z: 20 }, [], H, targets([7, 0, 10]), R), null);
  assert.equal(sweepShell({ x: 2.9, z: 0 }, { x: 2.9, z: 20 }, [], H, targets([7, 0, 10]), R)?.kind, 'tank');
});

test('AC-07.3 BR-09 the sweep covers the whole step, so a fast shell cannot pass through a tank', () => {
  // One step jumps from well before the tank to well after it.
  const hit = sweepShell({ x: 0, z: 0 }, { x: 0, z: 100 }, [], H, targets([7, 0, 50]), R);
  assert.equal(hit?.id, 7);
});

test('AC-05.3 BR-08 a fast shell cannot tunnel through a thin wall', () => {
  const hit = sweepShell({ x: 0, z: 0 }, { x: 0, z: 100 }, [wall(0, 50, 0)], H, [], R);
  assert.equal(hit?.kind, 'obstacle');
  assert.equal(hit?.id, 2);
  close(/** @type {NonNullable<typeof hit>} */ (hit).t, 49.5 / 100);
});

test('BR-08 a shell hits a circle footprint at its edge', () => {
  const hit = sweepShell({ x: 0, z: 0 }, { x: 0, z: 20 }, [pillar(0, 10)], H, [], R);
  assert.equal(hit?.kind, 'obstacle');
  close(/** @type {NonNullable<typeof hit>} */ (hit).t, 7.5 / 20);
});

test('BR-08 a shell passing beside an obstacle is not stopped', () => {
  assert.equal(sweepShell({ x: 3, z: 0 }, { x: 3, z: 20 }, [pillar(0, 10)], H, [], R), null);
  assert.equal(sweepShell({ x: 0.6, z: 0 }, { x: 0.6, z: 100 }, [wall(0, 50, 90)], H, [], R), null);
});

test('BR-08 a rotated wall stops a shell along its rotated face', () => {
  // The wall runs along z after a 90 degree yaw, so a shell along x meets its thin side at x = -0.5.
  const hit = sweepShell({ x: -20, z: 4 }, { x: 20, z: 4 }, [wall(0, 0, 90)], H, [], R);
  assert.equal(hit?.kind, 'obstacle');
  close(/** @type {NonNullable<typeof hit>} */ (hit).t, 19.5 / 40);
});

test('BR-09 when an obstacle comes first along the path, the obstacle decides', () => {
  const hit = sweepShell({ x: 0, z: 0 }, { x: 0, z: 30 }, [pillar(0, 10)], H, targets([7, 0, 20]), R);
  assert.equal(hit?.kind, 'obstacle');
});

test('BR-09 when a tank comes first along the path, the tank decides', () => {
  const hit = sweepShell({ x: 0, z: 0 }, { x: 0, z: 30 }, [pillar(0, 25)], H, targets([7, 0, 10]), R);
  assert.equal(hit?.kind, 'tank');
});

test('BR-09 the nearest of two tanks is hit', () => {
  const hit = sweepShell({ x: 0, z: 0 }, { x: 0, z: 40 }, [], H, targets([8, 0, 30], [7, 0, 15]), R);
  assert.equal(hit?.id, 7);
});

test('AC-05.5 BR-08 a shell reaching the boundary stops there', () => {
  const hit = sweepShell({ x: 0, z: H - 1 }, { x: 0, z: H + 1 }, [], H, [], R);
  assert.equal(hit?.kind, 'boundary');
  close(/** @type {NonNullable<typeof hit>} */ (hit).t, 0.5);
  const side = sweepShell({ x: -H + 1, z: 0 }, { x: -H - 3, z: 0 }, [], H, [], R);
  assert.equal(side?.kind, 'boundary');
  close(/** @type {NonNullable<typeof side>} */ (side).t, 0.25);
});

test('BR-08 a shell starting inside a footprint is stopped at once', () => {
  assert.equal(sweepShell({ x: 0, z: 0 }, { x: 0, z: 1 }, [pillar(0, 0)], H, [], R)?.t, 0);
  assert.equal(sweepShell({ x: 0, z: 0 }, { x: 0, z: 1 }, [wall(0, 0, 0)], H, [], R)?.t, 0);
});

test('a shell with nothing on its path returns null, including a zero-length step', () => {
  assert.equal(sweepShell({ x: 0, z: 0 }, { x: 0, z: 1.33 }, [pillar(50, 50)], H, targets([7, -50, 0]), R), null);
  assert.equal(sweepShell({ x: 0, z: 0 }, { x: 0, z: 0 }, [pillar(50, 50)], H, [], R), null);
  assert.equal(sweepShell({ x: 0, z: 0 }, { x: 0, z: 0 }, [], H, targets([7, 0, 2]), R)?.t, 0);
});
