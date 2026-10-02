// First-person camera and projection (ARCHITECTURE.md 5.1). Pure maths.
// Camera space: x right, y up, z forward. The camera yaws only.

/** @typedef {import('../core/math.js').Vec2} Vec2 */
/** @typedef {import('./palette.js').Bucket} Bucket */
/** @typedef {import('./palette.js').Buckets} Buckets */
/** @typedef {import('./palette.js').PaletteKey} PaletteKey */
/** @typedef {{ x: number, y: number, z: number, heading: number, sin: number, cos: number }} Camera */
/** @typedef {{ width: number, height: number }} Viewport */

/**
 * A camera at `pos`, `eyeHeight` above the ground, looking along `heading`.
 * @param {Vec2} pos @param {number} heading @param {number} eyeHeight
 * @returns {Camera}
 */
export function cameraAt(pos, heading, eyeHeight) {
  return { x: pos.x, y: eyeHeight, z: pos.z, heading, sin: Math.sin(heading), cos: Math.cos(heading) };
}

/**
 * Focal length in pixels for a vertical field of view.
 * @param {Viewport} viewport @param {number} fovVerticalDeg
 */
export function focalLength(viewport, fovVerticalDeg) {
  return viewport.height / 2 / Math.tan((fovVerticalDeg * Math.PI) / 360);
}

/**
 * Horizontal field of view in radians, from the vertical one and the aspect
 * ratio. The HUD uses it for the view bracket and the edge chevron, so the
 * HUD and the projection agree on what is in view.
 * @param {Viewport} viewport @param {number} fovVerticalDeg
 */
export function horizontalFov(viewport, fovVerticalDeg) {
  return 2 * Math.atan(Math.tan((fovVerticalDeg * Math.PI) / 360) * (viewport.width / viewport.height));
}

/**
 * Camera-space depth of a ground point: how far in front of the camera it is.
 * @param {Camera} cam @param {number} x @param {number} z
 */
export function depthOf(cam, x, z) {
  return (x - cam.x) * cam.sin + (z - cam.z) * cam.cos;
}

/**
 * Projects every 3D segment in `src` into 2D pixels in `out`, clipping each
 * one to z >= near first, so points behind the camera are cut, never
 * mirrored. Returns how many segments were written.
 * @param {Bucket} src @param {Camera} cam @param {Viewport} viewport @param {number} fovVerticalDeg @param {number} near @param {Bucket} out
 */
export function projectSegments(src, cam, viewport, fovVerticalDeg, near, out) {
  const f = focalLength(viewport, fovVerticalDeg);
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const before = out.count;
  const d = src.data;
  for (let i = 0; i < src.count; i++) {
    const k = i * 6;
    // World to camera space (yaw only).
    const ax = d[k] - cam.x;
    const az = d[k + 2] - cam.z;
    const bx = d[k + 3] - cam.x;
    const bz = d[k + 5] - cam.z;
    let x1 = ax * cam.cos - az * cam.sin;
    let y1 = d[k + 1] - cam.y;
    let z1 = ax * cam.sin + az * cam.cos;
    let x2 = bx * cam.cos - bz * cam.sin;
    let y2 = d[k + 4] - cam.y;
    let z2 = bx * cam.sin + bz * cam.cos;
    if (z1 < near && z2 < near) continue;
    if (z1 < near) {
      const t = (near - z1) / (z2 - z1);
      x1 += (x2 - x1) * t;
      y1 += (y2 - y1) * t;
      z1 = near;
    } else if (z2 < near) {
      const t = (near - z2) / (z1 - z2);
      x2 += (x1 - x2) * t;
      y2 += (y1 - y2) * t;
      z2 = near;
    }
    if (out.count >= out.capacity) break;
    const o = out.count * 4;
    out.data[o] = cx + (f * x1) / z1;
    out.data[o + 1] = cy - (f * y1) / z1;
    out.data[o + 2] = cx + (f * x2) / z2;
    out.data[o + 3] = cy - (f * y2) / z2;
    out.count += 1;
  }
  return out.count - before;
}

/**
 * Projects every key's 3D bucket into the matching 2D bucket.
 * @param {Buckets} src @param {Camera} cam @param {Viewport} viewport @param {number} fovVerticalDeg @param {number} near @param {Buckets} out
 * @param {readonly PaletteKey[]} keys
 */
export function projectBuckets(src, cam, viewport, fovVerticalDeg, near, out, keys) {
  let total = 0;
  for (const key of keys) total += projectSegments(src[key], cam, viewport, fovVerticalDeg, near, out[key]);
  return total;
}
