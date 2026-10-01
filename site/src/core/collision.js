// All collision on the ground plane (ARCHITECTURE.md 5.5). Tanks are circles,
// obstacles are circles or rotated rectangles, the arena is bounded at
// +-halfSize. Shells are points swept along the segment they travel in one
// step, so a fast shell cannot pass through anything between steps.

import { clamp, toLocal } from './math.js';

/** @typedef {import('./math.js').Vec2} Vec2 */
/** @typedef {import('./world.js').Obstacle} Obstacle */
/** @typedef {{ t: number, kind: 'obstacle' | 'boundary' | 'tank', id?: number }} ShellHit */

// Push-out lands this far beyond contact, so the result tests as clear.
const SKIN = 1e-6;
const PUSH_PASSES = 4;

/**
 * True if a circle at `pos` is inside the boundary and overlaps no footprint.
 * Touching counts as clear.
 * @param {Vec2} pos @param {number} radius @param {readonly Obstacle[]} obstacles @param {number} halfSize
 */
export function isClear(pos, radius, obstacles, halfSize) {
  const limit = halfSize - radius;
  if (Math.abs(pos.x) > limit || Math.abs(pos.z) > limit) return false;
  return obstacles.every((o) => pushOut(pos, radius, o, pos) === null);
}

/**
 * Moves a tank circle from `from` towards `to` and returns where it ends up:
 * never overlapping an obstacle, the boundary or another tank (BR-04). A
 * blocked tank is pushed back out along the contact normal, so it slides
 * along surfaces. If pushing cannot find a clear spot, it stays at `from`.
 * @param {Vec2} from a clear position @param {Vec2} to @param {number} radius
 * @param {readonly Obstacle[]} obstacles @param {number} halfSize
 * @param {readonly Vec2[]} others centres of the other tanks, each with the same radius
 * @returns {Vec2}
 */
export function resolveTankMove(from, to, radius, obstacles, halfSize, others) {
  const limit = halfSize - radius;
  let p = { x: to.x, z: to.z };
  for (let pass = 0; pass < PUSH_PASSES; pass++) {
    for (const o of obstacles) p = pushOut(p, radius, o, from) ?? p;
    for (const c of others) p = pushOutOfCircle(p, c, 2 * radius, from) ?? p;
    p = { x: clamp(p.x, -limit, limit), z: clamp(p.z, -limit, limit) };
    if (isClear(p, radius, obstacles, halfSize) && others.every((c) => pushOutOfCircle(p, c, 2 * radius, from) === null)) return p;
  }
  return { x: from.x, z: from.z };
}

/**
 * Where a circle at `p` must move to stop overlapping obstacle `o`, or null
 * if it does not overlap. If its centre is inside the footprint, it leaves on
 * the side it came from, so a fast move cannot pass through a thin wall.
 * @param {Vec2} p @param {number} radius @param {Obstacle} o @param {Vec2} from
 * @returns {Vec2 | null}
 */
function pushOut(p, radius, o, from) {
  const f = o.footprint;
  if (f.type === 'circle') return pushOutOfCircle(p, o.pos, f.radius + radius, from);
  // Work in the wall's own frame, where it is an axis-aligned box.
  const local = toLocal(p, o.pos, o.yaw);
  const cx = clamp(local.x, -f.halfLength, f.halfLength);
  const cz = clamp(local.z, -f.halfWidth, f.halfWidth);
  const dx = local.x - cx;
  const dz = local.z - cz;
  const d = Math.hypot(dx, dz);
  if (d >= radius) return null;
  let nx = local.x;
  let nz = local.z;
  if (d > 0) {
    nx = cx + (dx / d) * (radius + SKIN);
    nz = cz + (dz / d) * (radius + SKIN);
  } else {
    const back = toLocal(from, o.pos, o.yaw);
    const cameAlongZ = Math.abs(back.z) > f.halfWidth;
    const cameAlongX = Math.abs(back.x) > f.halfLength;
    const exitZ = cameAlongZ && (!cameAlongX || f.halfWidth - Math.abs(local.z) <= f.halfLength - Math.abs(local.x));
    if (exitZ) nz = Math.sign(back.z) * (f.halfWidth + radius + SKIN);
    else nx = (back.x < 0 ? -1 : 1) * (f.halfLength + radius + SKIN);
  }
  // Back to world space (UX_SPEC.md 7.1).
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  return { x: o.pos.x + nx * c + nz * s, z: o.pos.z - nx * s + nz * c };
}

/**
 * Where a circle at `p` must move to be at least `minDist` from `centre`, or
 * null if it already is. On the centre itself, it goes back towards `from`.
 * @param {Vec2} p @param {Vec2} centre @param {number} minDist @param {Vec2} from
 * @returns {Vec2 | null}
 */
function pushOutOfCircle(p, centre, minDist, from) {
  let dx = p.x - centre.x;
  let dz = p.z - centre.z;
  let d = Math.hypot(dx, dz);
  if (d >= minDist) return null;
  if (d === 0) {
    dx = from.x - centre.x;
    dz = from.z - centre.z;
    d = Math.hypot(dx, dz);
  }
  if (d === 0) {
    dz = -1;
    d = 1;
  }
  const k = (minDist + SKIN) / d;
  return { x: centre.x + dx * k, z: centre.z + dz * k };
}

/**
 * Sweeps a shell from `from` to `to` and returns the first thing it meets,
 * as a fraction `t` of the way along, or null. Obstacles, the boundary and
 * the given target tanks all compete; the nearest wins (BR-09). The caller
 * chooses the targets, so a shell never hits its own side (AC-07.5).
 * @param {Vec2} from @param {Vec2} to
 * @param {readonly Obstacle[]} obstacles @param {number} halfSize
 * @param {readonly { id: number, pos: Vec2 }[]} targets @param {number} hitRadius
 * @returns {ShellHit | null}
 */
export function sweepShell(from, to, obstacles, halfSize, targets, hitRadius) {
  /** @type {ShellHit | null} */
  let best = null;
  /** @param {number | null} t @param {ShellHit['kind']} kind @param {number} [id] */
  const consider = (t, kind, id) => {
    if (t !== null && (best === null || t < best.t)) best = id === undefined ? { t, kind } : { t, kind, id };
  };
  for (const o of obstacles) {
    const f = o.footprint;
    if (f.type === 'circle') {
      consider(segmentCircle(from, to, o.pos, f.radius), 'obstacle', o.id);
    } else {
      const a = toLocal(from, o.pos, o.yaw);
      const b = toLocal(to, o.pos, o.yaw);
      consider(segmentBox(a, b, f.halfLength, f.halfWidth), 'obstacle', o.id);
    }
  }
  consider(segmentBoundary(from, to, halfSize), 'boundary');
  for (const tank of targets) consider(segmentCircle(from, to, tank.pos, hitRadius), 'tank', tank.id);
  return best;
}

/**
 * First t in [0, 1] at which the segment is within `r` of `c`, or null.
 * @param {Vec2} a @param {Vec2} b @param {Vec2} c @param {number} r
 */
function segmentCircle(a, b, c, r) {
  const fx = a.x - c.x;
  const fz = a.z - c.z;
  const cc = fx * fx + fz * fz - r * r;
  if (cc <= 0) return 0;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const aa = dx * dx + dz * dz;
  if (aa === 0) return null;
  const bb = 2 * (fx * dx + fz * dz);
  const disc = bb * bb - 4 * aa * cc;
  if (disc < 0) return null;
  const t = (-bb - Math.sqrt(disc)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : null;
}

/**
 * First t in [0, 1] at which the segment enters the box |x| <= hx, |z| <= hz, or null.
 * @param {Vec2} a @param {Vec2} b @param {number} hx @param {number} hz
 */
function segmentBox(a, b, hx, hz) {
  let tMin = 0;
  let tMax = 1;
  for (const [p, d, h] of [[a.x, b.x - a.x, hx], [a.z, b.z - a.z, hz]]) {
    if (d === 0) {
      if (Math.abs(p) > h) return null;
      continue;
    }
    let t1 = (-h - p) / d;
    let t2 = (h - p) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

/**
 * First t in [0, 1] at which the segment reaches |x| = h or |z| = h, or null.
 * @param {Vec2} a @param {Vec2} b @param {number} h
 */
function segmentBoundary(a, b, h) {
  let t = Infinity;
  for (const [p, q] of [[a.x, b.x], [a.z, b.z]]) {
    if (Math.abs(p) >= h) return 0;
    if (q >= h) t = Math.min(t, (h - p) / (q - p));
    else if (q <= -h) t = Math.min(t, (-h - p) / (q - p));
  }
  return t === Infinity ? null : t;
}
