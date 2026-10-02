// Bootstrap and wiring (ARCHITECTURE.md 3 and 4.5). The only module that
// knows every layer: it creates the state, wires input, the loop, the
// renderer, the screens, storage and the test hook, and installs the error
// handler. Everything else gets what it needs passed in.

import { CONFIG } from './core/config.js';
import { setWindowTooSmall } from './core/game.js';
import { step } from './core/sim.js';
import { createWorld } from './core/world.js';
import { createInput, keyDown, keyUp, queue, releaseAll, takeSnapshot } from './platform/input.js';
import { startLoop } from './platform/loop.js';
import { announcementFor, createScreens, overlayFor } from './platform/screens.js';
import { loadBest, openStorage, saveBest } from './platform/storage.js';
import { installTestHook, readTestHook } from './platform/test-hook.js';
import { projectBuckets } from './render/camera.js';
import { draw } from './render/canvas-renderer.js';
import { buildHud, createHudMemory, noteEvents } from './render/hud.js';
import { STROKE_KEYS, clearBuckets, createBuckets, resolvePalette } from './render/palette.js';
import { buildScene, buildSky, cameraFor } from './render/scene.js';

/** @typedef {import('./platform/screens.js').Page} Page */

// The test hook is read once, here, before anything else (ADR 0008).
const testHook = readTestHook(/** @type {{ __WT_TEST__?: unknown }} */ (/** @type {unknown} */ (window)));
const seed = testHook?.seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
const hook = testHook ? installTestHook(testHook) : null;

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('wt-canvas'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
const screens = createScreens(document);
const css = getComputedStyle(document.documentElement);
const palette = resolvePalette((token) => css.getPropertyValue(token));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(any-pointer: fine)');

const state = createWorld(seed, CONFIG);
const input = createInput();
const storage = openStorage(window);
const hudMemory = createHudMemory();
const world3d = createBuckets(6);
const frame2d = createBuckets(4);
const extras = { fills: /** @type {import('./render/hud.js').Fill[]} */ ([]), texts: /** @type {import('./render/hud.js').TextItem[]} */ ([]) };
let best = loadBest(storage);
let newBest = false;
let muted = false;
let view = { shakeX: 0, shakeY: 0, hitFrame: false };

const tooSmall = () => innerWidth < CONFIG.minWindowWidth || innerHeight < CONFIG.minWindowHeight;
/** @type {Page} */
let page = !finePointer.matches || tooSmall() ? 'keyboard' : 'ready';

// Keys (BR-01). Single-key controls act only while the page has focus.
addEventListener('keydown', (e) => {
  if (page === 'error') return;
  if (page !== 'ready' && e.code !== 'KeyM') return;
  if (keyDown(input, e, state.screen)) e.preventDefault();
});
addEventListener('keyup', (e) => keyUp(input, e));

// Auto-pause (BR-22): the tab is hidden, or the window loses focus.
addEventListener('blur', () => {
  releaseAll(input);
  queue(input, 'pause');
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') queue(input, 'pause');
});
addEventListener('resize', () => setWindowTooSmall(state, tooSmall()));

// Overlay buttons (ADR 0005).
/** @param {string} id @param {() => void} fn */
const onClick = (id, fn) => /** @type {HTMLElement} */ (document.getElementById(id)).addEventListener('click', fn);
onClick('wt-start-button', () => queue(input, 'start'));
onClick('wt-resume', () => queue(input, 'resume'));
onClick('wt-quit', () => queue(input, 'quit-to-title'));
onClick('wt-again', () => queue(input, 'restart'));
onClick('wt-title', () => queue(input, 'quit-to-title'));
onClick('wt-keyboard-button', () => {
  page = 'ready';
});
onClick('wt-reload', () => location.reload());

// One simulation step. Its events go to the HUD, the test hook, the live
// region and the best score here, inside the step loop, before the next
// step clears them (ARCHITECTURE.md 4.2).
function simulate() {
  const before = state.screen;
  const snapshot = takeSnapshot(input);
  if (snapshot.commands.includes('mute')) muted = !muted; // BR-23: session only, never stored
  if (before === 'start' && snapshot.commands.includes('start')) newBest = false;
  if (before === 'gameover' && snapshot.commands.includes('restart')) newBest = false;
  step(state, snapshot);
  noteEvents(hudMemory, state, state.events);
  hook?.record(state.events);
  for (const e of state.events) {
    if (e.type === 'game-over') {
      // Only a game that reaches Game over updates the best score (BR-26).
      const after = saveBest(storage, best, state.score);
      newBest = after > best;
      best = after;
    }
  }
  const message = announcementFor(before, state, state.events);
  if (message) screens.announce(message);
}

// One frame: world, sky and HUD into the 2D buffers, then the canvas.
/** @param {number} alpha */
function render(alpha) {
  const scale = Math.min(devicePixelRatio || 1, 2);
  const vp = { width: canvas.clientWidth, height: canvas.clientHeight };
  if (canvas.width !== Math.round(vp.width * scale) || canvas.height !== Math.round(vp.height * scale)) {
    canvas.width = Math.round(vp.width * scale);
    canvas.height = Math.round(vp.height * scale);
  }
  clearBuckets(world3d);
  clearBuckets(frame2d);
  const cam = cameraFor(state, alpha, CONFIG);
  buildScene(state, alpha, cam, world3d, CONFIG);
  projectBuckets(world3d, cam, vp, CONFIG.fovVerticalDeg, CONFIG.nearPlane, frame2d, STROKE_KEYS);
  buildSky(cam, vp, CONFIG, frame2d.horizon);
  view = { shakeX: 0, shakeY: 0, hitFrame: false };
  extras.fills.length = 0;
  extras.texts.length = 0;
  // The Start screen shows the arena with no HUD behind its overlay (UX_SPEC.md 5.1).
  if (state.screen !== 'start') {
    view = buildHud(state, hudMemory, { viewport: vp, alpha, reducedMotion: reducedMotion.matches, muted, best }, frame2d, extras, CONFIG);
  }
  draw(ctx, frame2d, extras, view, palette, vp, scale);
  screens.show(overlayFor(state, page, { best, newBest }));
  hook?.publish(state, view, { muted, page });
}

// Any error stops the game and shows the Error overlay. The detail goes to
// the console, never the screen (BR-27). Frame errors are caught here, so
// they stop the loop the same way in every browser and under a test clock;
// the window listeners catch anything thrown elsewhere.
/** @param {unknown} err */
function fail(err) {
  if (page === 'error') return;
  loop.stop();
  page = 'error';
  console.error(err);
  screens.show(overlayFor(state, page, { best, newBest }));
}
/** @param {() => void} fn */
const guarded = (fn) => () => {
  try {
    fn();
  } catch (err) {
    fail(err);
  }
};
const loop = startLoop({
  now: () => performance.now(),
  requestFrame: (cb) => requestAnimationFrame(cb),
  step: guarded(simulate),
  render: (alpha) => guarded(() => render(alpha))(),
});
addEventListener('error', (e) => fail(e.error ?? e.message));
addEventListener('unhandledrejection', (e) => fail(e.reason));
