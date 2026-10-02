// Fixed-timestep loop (ADR 0003, ARCHITECTURE.md 5.2). The accumulator maths
// is the pure function `advance`, unit-tested in Node. The requestAnimationFrame
// driver that calls it is wired up with the platform in D5.

import { CONFIG } from '../core/config.js';

/**
 * Adds one animation frame's elapsed time to the accumulator and says how
 * many whole simulation steps to run. Elapsed time is clamped to K-16, at
 * most `maxStepsPerFrame` steps run, and a frame that hits that cap with a
 * whole step still owed drops its backlog, so a slow machine slows down
 * instead of spiralling. A remainder under one step is always kept.
 * @param {number} acc milliseconds carried from the last frame
 * @param {number} elapsedMs milliseconds since the last frame
 * @returns {{ steps: number, acc: number, alpha: number }} alpha in [0, 1) is how far the render is past the last step
 */
export function advance(acc, elapsedMs) {
  const elapsed = elapsedMs > 0 ? Math.min(elapsedMs, CONFIG.maxFrameMs) : 0;
  let next = acc + elapsed;
  let steps = 0;
  while (next >= CONFIG.stepMs && steps < CONFIG.maxStepsPerFrame) {
    next -= CONFIG.stepMs;
    steps += 1;
  }
  if (next >= CONFIG.stepMs) next = 0;
  return { steps, acc: next, alpha: next / CONFIG.stepMs };
}
