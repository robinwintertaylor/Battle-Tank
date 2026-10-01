// Mimics the ADR 0008 hook and a fixed-step rAF loop.
const hook = window.__WT_TEST__;
const seenAtModuleStart = hook ? { ...hook } : null;
let frames = 0, ticks = 0, acc = 0, last = performance.now();
const STEP = 1000 / 60;
function frame(now) {
  frames++;
  acc += Math.min(now - last, 250); last = now;
  while (acc >= STEP) { ticks++; acc -= STEP; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
const anyPointerFine = window.matchMedia('(any-pointer: fine)').matches;
if (hook) {
  hook.snapshot = () => Object.freeze({ frames, ticks, anyPointerFine, seenAtModuleStart, now: performance.now() });
}
// Inline-eval probe: must be blocked by script-src 'self'.
let evalBlocked = false;
try { new Function('return 1')(); } catch { evalBlocked = true; }
window.__SPIKE__ = { evalBlocked };
