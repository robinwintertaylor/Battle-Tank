// Ground-plane maths. X and Z, with Y up. Heading 0 faces +Z, and a positive
// heading turns clockwise seen from above, towards +X (ARCHITECTURE.md 4.2).

/** @typedef {{ x: number, z: number }} Vec2 */

const TWO_PI = 2 * Math.PI;

/** @param {number} deg */
export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Wraps an angle into (-pi, pi].
 * @param {number} a
 */
export function wrapAngle(a) {
  const r = a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);
  return r === -Math.PI ? Math.PI : r;
}

/** @param {number} v @param {number} min @param {number} max */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** @param {number} a @param {number} b @param {number} t */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Interpolates between two headings the short way round.
 * @param {number} a @param {number} b @param {number} t
 */
export function lerpAngle(a, b, t) {
  return wrapAngle(a + wrapAngle(b - a) * t);
}

/**
 * Unit vector along a heading.
 * @param {number} heading
 * @returns {Vec2}
 */
export function forward(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

/** @param {Vec2} a @param {Vec2} b */
export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Takes a world point into the frame of an object at `origin` with `yaw`.
 * The inverse of UX_SPEC.md 7.1: world = (ox + x cos + z sin, oz - x sin + z cos).
 * @param {Vec2} p @param {Vec2} origin @param {number} yaw
 * @returns {Vec2}
 */
export function toLocal(p, origin, yaw) {
  const dx = p.x - origin.x;
  const dz = p.z - origin.z;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
