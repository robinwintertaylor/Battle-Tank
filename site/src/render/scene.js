// Turns the game state into 3D line segments, one bucket per palette key
// (ARCHITECTURE.md 4.4). Positions are interpolated with `alpha` between the
// last two steps (5.2). Objects beyond the far distance, or wholly behind the
// camera, are culled before projection. The horizon and ridge are at
// infinity, so buildSky draws them straight into 2D.

import { CONFIG } from '../core/config.js';
import { lerp, lerpAngle, wrapAngle } from '../core/math.js';
import { MODELS, RIDGE } from '../core/models.js';
import { fencePosts, footprintRadius } from '../core/world.js';
import { cameraAt, depthOf, focalLength } from './camera.js';
import { push2, push3 } from './palette.js';

/** @typedef {import('../core/world.js').GameState} GameState */
/** @typedef {import('../core/config.js').Config} Config */
/** @typedef {import('../core/models.js').Model} Model */
/** @typedef {import('./camera.js').Camera} Camera */
/** @typedef {import('./camera.js').Viewport} Viewport */
/** @typedef {import('./palette.js').Bucket} Bucket */
/** @typedef {import('./palette.js').Buckets} Buckets */

const FENCE_HEIGHT = 1.5; // u, UX_SPEC.md 7.4
const TANK_RADIUS = 3.8; // u: bounding circle of the tank model, for culling
const SHELL_RADIUS = 0.6;
const RIDGE_REACH = (80 * Math.PI) / 180; // ridge points within +-80 degrees of the view (7.4)

/**
 * The player's eye, interpolated between the last two steps. A dead player's
 * camera stays where it was.
 * @param {GameState} state @param {number} alpha @param {Config} [config]
 */
export function cameraFor(state, alpha, config = CONFIG) {
  const p = state.tanks.find((t) => t.id === state.playerId);
  if (!p) return cameraAt({ x: 0, z: 0 }, 0, config.eyeHeight);
  const pos = { x: lerp(p.prevPos.x, p.pos.x, alpha), z: lerp(p.prevPos.z, p.pos.z, alpha) };
  return cameraAt(pos, lerpAngle(p.prevHeading, p.heading, alpha), config.eyeHeight);
}

/**
 * Writes the world's segments into `out` (stride 6). Returns the count.
 * @param {GameState} state @param {number} alpha @param {Camera} cam @param {Buckets} out @param {Config} [config]
 */
export function buildScene(state, alpha, cam, out, config = CONFIG) {
  const far = config.farDistance;
  /** @param {number} x @param {number} z @param {number} r */
  const visible = (x, z, r) => {
    const depth = depthOf(cam, x, z);
    return depth > -r && Math.hypot(x - cam.x, z - cam.z) - r < far;
  };
  let total = 0;

  // Fence: a post every ~25 u, joined by a rail (UX_SPEC.md 7.4).
  const posts = fencePosts(config.arenaHalfSize, config.fencePostSpacing);
  for (let i = 0; i < posts.length; i++) {
    const a = posts[i];
    const b = posts[(i + 1) % posts.length];
    if (depthOf(cam, a.x, a.z) < 0 && depthOf(cam, b.x, b.z) < 0) continue;
    if (Math.hypot(a.x - cam.x, a.z - cam.z) > far && Math.hypot(b.x - cam.x, b.z - cam.z) > far) continue;
    push3(out.world, a.x, 0, a.z, a.x, FENCE_HEIGHT, a.z);
    push3(out.world, a.x, FENCE_HEIGHT, a.z, b.x, FENCE_HEIGHT, b.z);
    total += 2;
  }

  for (const o of state.obstacles) {
    if (!visible(o.pos.x, o.pos.z, footprintRadius(o.footprint))) continue;
    total += placeModel(MODELS[o.model], o.pos.x, 0, o.pos.z, o.yaw, out.world);
  }

  for (const t of state.tanks) {
    if (t.id === state.playerId || !t.alive) continue;
    const x = lerp(t.prevPos.x, t.pos.x, alpha);
    const z = lerp(t.prevPos.z, t.pos.z, alpha);
    if (!visible(x, z, TANK_RADIUS)) continue;
    // A tank in its grace period is drawn dashed: not yet armed (UX_SPEC.md 7.6).
    const key = t.graceTicks > 0 ? 'enemyGrace' : 'enemy';
    total += placeModel(MODELS.tank, x, 0, z, lerpAngle(t.prevHeading, t.heading, alpha), out[key]);
  }

  for (const s of state.shells) {
    const x = lerp(s.prevPos.x, s.pos.x, alpha);
    const z = lerp(s.prevPos.z, s.pos.z, alpha);
    if (!visible(x, z, SHELL_RADIUS)) continue;
    const key = s.side === 'player' ? 'playerShell' : 'enemyShell';
    total += placeModel(MODELS.shell, x, config.shellHeight, z, Math.atan2(s.vel.x, s.vel.z), out[key]);
  }
  return total;
}

/**
 * Writes a model's edges in world space: (ox + x cos + z sin, oy + y, oz - x sin + z cos) (UX_SPEC.md 7.1).
 * @param {Model} model @param {number} ox @param {number} oy @param {number} oz @param {number} yaw @param {Bucket} out
 */
function placeModel(model, ox, oy, oz, yaw, out) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const v = model.vertices;
  for (const [i, j] of model.edges) {
    const a = v[i];
    const b = v[j];
    push3(out, ox + a[0] * c + a[2] * s, oy + a[1], oz - a[0] * s + a[2] * c, ox + b[0] * c + b[2] * s, oy + b[1], oz - b[0] * s + b[2] * c);
  }
  return model.edges.length;
}

/**
 * The horizon line at eye level and the distant ridge, which turns with the
 * view but never comes closer (UX_SPEC.md 7.4, M2, C2). Writes 2D segments.
 * @param {Camera} cam @param {Viewport} viewport @param {Config} config @param {Bucket} out
 */
export function buildSky(cam, viewport, config, out) {
  const f = focalLength(viewport, config.fovVerticalDeg);
  const cy = viewport.height / 2;
  push2(out, 0, cy, viewport.width, cy);
  let total = 1;
  for (let i = 0; i + 1 < RIDGE.length; i++) {
    const a = wrapAngle((RIDGE[i][0] * Math.PI) / 180 - cam.heading);
    const b = wrapAngle((RIDGE[i + 1][0] * Math.PI) / 180 - cam.heading);
    if (Math.abs(a) > RIDGE_REACH || Math.abs(b) > RIDGE_REACH) continue;
    const ya = cy - f * Math.tan((RIDGE[i][1] * Math.PI) / 180);
    const yb = cy - f * Math.tan((RIDGE[i + 1][1] * Math.PI) / 180);
    if (ya === cy && yb === cy) continue; // already on the horizon line
    push2(out, viewport.width / 2 + f * Math.tan(a), ya, viewport.width / 2 + f * Math.tan(b), yb);
    total += 1;
  }
  return total;
}
