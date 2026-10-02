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

/**
 * Drives the game from requestAnimationFrame (ARCHITECTURE.md 5.2). The
 * clock and the frame scheduler are passed in, so a test can drive it.
 * `step` runs once per simulation step, so the caller hands each step's
 * events on before the next step clears them; `render` runs once per frame.
 * If either throws, no further frame is requested, so the loop stops and the
 * error reaches the page's error handler (BR-27).
 * @param {{ now: () => number, requestFrame: (cb: (t: number) => void) => unknown, step: () => void, render: (alpha: number) => void }} deps
 */
export function startLoop({ now, requestFrame, step, render }) {
  let acc = 0;
  let last = now();
  let running = true;
  /** @param {number} t */
  const frame = (t) => {
    if (!running) return;
    const r = advance(acc, t - last);
    last = t;
    acc = r.acc;
    for (let i = 0; i < r.steps; i++) step();
    render(r.alpha);
    requestFrame(frame);
  };
  requestFrame(frame);
  return {
    stop() {
      running = false;
    },
  };
}
