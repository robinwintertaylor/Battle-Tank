import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clamp, degToRad, distance, forward, lerp, lerpAngle, toLocal, wrapAngle } from '../../site/src/core/math.js';

const close = (/** @type {number} */ a, /** @type {number} */ b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${a} is not close to ${b}`);

test('degToRad converts degrees to radians', () => {
  close(degToRad(180), Math.PI);
  close(degToRad(-90), -Math.PI / 2);
});

test('wrapAngle keeps an angle in (-pi, pi]', () => {
  close(wrapAngle(0), 0);
  close(wrapAngle(Math.PI), Math.PI);
  close(wrapAngle(-Math.PI), Math.PI);
  close(wrapAngle(3 * Math.PI / 2), -Math.PI / 2);
  close(wrapAngle(-3 * Math.PI / 2), Math.PI / 2);
  close(wrapAngle(10 * Math.PI + 0.25), 0.25);
});

test('clamp limits a value to a range', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-5, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
});

test('lerp interpolates linearly', () => {
  assert.equal(lerp(2, 6, 0), 2);
  assert.equal(lerp(2, 6, 1), 6);
  assert.equal(lerp(2, 6, 0.25), 3);
});

test('lerpAngle takes the short way round across the wrap', () => {
  close(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5), Math.PI);
  close(lerpAngle(0.2, 0.4, 0.5), 0.3);
});

test('forward: heading 0 faces +z and a positive heading turns towards +x', () => {
  const f0 = forward(0);
  close(f0.x, 0);
  close(f0.z, 1);
  const f90 = forward(Math.PI / 2);
  close(f90.x, 1);
  close(f90.z, 0);
});

test('distance is Euclidean on the ground plane', () => {
  assert.equal(distance({ x: 0, z: 0 }, { x: 3, z: 4 }), 5);
});

test('toLocal undoes the UX_SPEC.md 7.1 model-to-world transform', () => {
  // A model point (6, 0.5) on an object at (10, 20) with yaw 30 degrees.
  const yaw = degToRad(30);
  const world = {
    x: 10 + 6 * Math.cos(yaw) + 0.5 * Math.sin(yaw),
    z: 20 - 6 * Math.sin(yaw) + 0.5 * Math.cos(yaw),
  };
  const local = toLocal(world, { x: 10, z: 20 }, yaw);
  close(local.x, 6);
  close(local.z, 0.5);
});
