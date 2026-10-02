// UT-PROJ: camera transform, near-plane clipping, projection, aspect ratio (camera.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../../site/src/core/config.js';
import { cameraAt, depthOf, focalLength, horizontalFov, projectBuckets, projectSegments } from '../../site/src/render/camera.js';
import { createBuckets, push3 } from '../../site/src/render/palette.js';
import { close } from './support.js';

const VP = { width: 1600, height: 900 };
const FOV = CONFIG.fovVerticalDeg;
const NEAR = CONFIG.nearPlane;

/** @param {number[]} seg @param {ReturnType<typeof cameraAt>} cam @param {{ width: number, height: number }} [vp] */
function project(seg, cam, vp = VP) {
  const b = createBuckets(6);
  const out = createBuckets(4);
  push3(b.world, seg[0], seg[1], seg[2], seg[3], seg[4], seg[5]);
  const n = projectSegments(b.world, cam, vp, FOV, NEAR, out.world);
  return n === 0 ? null : Array.from(out.world.data.slice(0, 4));
}

test('5.1 the focal length gives the 40 degree vertical field of view', () => {
  const f = focalLength(VP, FOV);
  close(Math.atan(VP.height / 2 / f) * 2, (FOV * Math.PI) / 180);
});

test('5.1 the horizontal field of view follows the aspect ratio: about 66 degrees at 16:9', () => {
  const h = (horizontalFov(VP, FOV) * 180) / Math.PI;
  close(h, 65.81, 0.01);
  close(horizontalFov({ width: 900, height: 900 }, FOV), (FOV * Math.PI) / 180);
});

test('a point straight ahead at eye height lands on the screen centre', () => {
  const cam = cameraAt({ x: 0, z: 0 }, 0, 2.2);
  const p = /** @type {number[]} */ (project([0, 2.2, 10, 0, 2.2, 20], cam));
  close(p[0], 800);
  close(p[1], 450);
  close(p[2], 800);
});

test('heading 0 faces +z; +x is to the right, and up is up on screen', () => {
  const cam = cameraAt({ x: 0, z: 0 }, 0, 2.2);
  const p = /** @type {number[]} */ (project([1, 2.2, 10, 0, 5, 10], cam));
  assert.ok(p[0] > 800, 'x+ is right of centre');
  assert.ok(p[3] < 450, 'higher than the eye is above centre');
});

test('the camera yaws: at heading 90 degrees it faces +x and +z is to its left', () => {
  const cam = cameraAt({ x: 5, z: 5 }, Math.PI / 2, 2.2);
  const p = /** @type {number[]} */ (project([15, 2.2, 5, 15, 2.2, 6], cam));
  close(p[0], 800);
  assert.ok(p[2] < 800, '+z is to the left when facing +x');
  close(depthOf(cam, 15, 5), 10);
});

test('the projection matches f * x / z exactly', () => {
  const cam = cameraAt({ x: 0, z: 0 }, 0, 0);
  const f = focalLength(VP, FOV);
  const p = /** @type {number[]} */ (project([3, 2, 10, -4, -1, 20], cam));
  close(p[0], 800 + (f * 3) / 10, 1e-3);
  close(p[1], 450 - (f * 2) / 10, 1e-3);
  close(p[2], 800 + (f * -4) / 20, 1e-3);
  close(p[3], 450 - (f * -1) / 20, 1e-3);
});

test('a segment wholly behind the camera is dropped, never mirrored', () => {
  const cam = cameraAt({ x: 0, z: 0 }, 0, 2.2);
  assert.equal(project([1, 0, -5, -1, 0, -10], cam), null);
});

test('a segment crossing the near plane is clipped at z = near, keeping the visible end', () => {
  const cam = cameraAt({ x: 0, z: 0 }, 0, 0);
  const f = focalLength(VP, FOV);
  // From (1, 0, -10) behind to (1, 0, 10) in front: x stays 1, so the clipped end is at z = near.
  const p = /** @type {number[]} */ (project([1, 0, -10, 1, 0, 10], cam));
  close(p[0], 800 + (f * 1) / NEAR, 1e-2);
  close(p[2], 800 + (f * 1) / 10, 1e-3);
  const q = /** @type {number[]} */ (project([1, 0, 10, 1, 0, -10], cam));
  close(q[0], 800 + (f * 1) / 10, 1e-3);
  close(q[2], 800 + (f * 1) / NEAR, 1e-2);
});

test('projection writes into a bounded buffer and stops when it is full', () => {
  const cam = cameraAt({ x: 0, z: 0 }, 0, 0);
  const src = createBuckets(6);
  for (let i = 0; i < src.alert.capacity; i++) push3(src.alert, 0, 0, 10, 1, 0, 10);
  push3(src.alert, 0, 0, 10, 1, 0, 10); // one more than fits: dropped by push3
  assert.equal(src.alert.count, src.alert.capacity);
  const out = createBuckets(4);
  out.alert.count = out.alert.capacity - 2;
  assert.equal(projectSegments(src.alert, cam, VP, FOV, NEAR, out.alert), 2);
});

test('projectBuckets projects every key it is given', () => {
  const cam = cameraAt({ x: 0, z: 0 }, 0, 0);
  const src = createBuckets(6);
  const out = createBuckets(4);
  push3(src.world, 0, 0, 10, 1, 0, 10);
  push3(src.enemy, 0, 0, 10, 1, 0, 10);
  push3(src.enemy, 0, 0, -10, 1, 0, -10);
  assert.equal(projectBuckets(src, cam, VP, FOV, NEAR, out, ['world', 'enemy']), 2);
  assert.equal(out.world.count, 1);
  assert.equal(out.enemy.count, 1);
});
