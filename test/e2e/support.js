// Shared helpers for the T2 end-to-end specs (TEST_STRATEGY.md 3.2). Game
// time is driven only by page.clock.runFor (spike T1 rule 1). Nothing here
// uses the mouse (LINT-03).
import { expect } from '@playwright/test';

export const SEED = 12345;
export const OVERLAYS = ['wt-start', 'wt-paused', 'wt-gameover', 'wt-keyboard', 'wt-error'];
export const STEP_MS = 1000 / 60;

/**
 * Installs the clock and the init script, loads the page, pauses the clock
 * and runs the first frames. The init script sets the test hook, records
 * CSP violations and every canvas text draw, spies on AudioContext, and
 * offers the opt-in canvas fault (E2E-24).
 * @param {import('@playwright/test').Page} page
 * @param {{ hook?: boolean, seed?: number, goto?: string, best?: number, noAudio?: boolean, beforeGoto?: () => Promise<void> }} [opts]
 */
export async function open(page, { hook = true, seed = SEED, goto = './', best, noAudio = false, beforeGoto } = {}) {
  /** @type {string[]} */
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  /** @type {string[]} */
  const requests = [];
  /** @type {string[]} */
  const lateRequests = [];
  // Counted from when goto() resolves, i.e. after the page's load event.
  // (Firefox fires a load for the initial about:blank, so page.on('load')
  // cannot be used for this.)
  let loaded = false;
  page.on('request', (req) => {
    requests.push(req.url());
    if (loaded) lateRequests.push(req.url());
  });
  /** @type {{ url: string, status: number }[]} */
  const responses = [];
  page.on('response', (res) => responses.push({ url: res.url(), status: res.status() }));

  await page.clock.install();
  await page.addInitScript(
    ({ seed: s, hook: withHook, best: storedBest, noAudio: withoutAudio }) => {
      const w = /** @type {any} */ (window);
      if (withHook) w.__WT_TEST__ = { seed: s };
      if (storedBest !== undefined && !localStorage.getItem('wireframe-tanks:best-score')) localStorage.setItem('wireframe-tanks:best-score', String(storedBest));
      if (withoutAudio) {
        delete w.AudioContext;
        delete w.webkitAudioContext;
      }
      w.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => w.__cspViolations.push(e.violatedDirective));

      // E2E-24: a canvas call throws once the test sets __wtBoom.
      // E2E-14, E2E-15, E2E-18: the last few frames' draw calls are recorded.
      // A frame starts at the background fill, which draw() makes first.
      w.__frames = [];
      const proto = w.CanvasRenderingContext2D.prototype;
      const frame = () => w.__frames[w.__frames.length - 1];
      const fillRect = proto.fillRect;
      /** @param {any[]} args */
      proto.fillRect = function (...args) {
        if (args[0] === 0 && args[1] === 0) {
          w.__frames.push({ texts: [], strokes: [], arcs: [] });
          if (w.__frames.length > 8) w.__frames.shift();
        }
        return fillRect.apply(this, args);
      };
      const stroke = proto.stroke;
      /** @param {any[]} args */
      proto.stroke = function (...args) {
        if (w.__wtBoom) throw new Error('E2E-24 injected canvas fault');
        frame()?.strokes.push(`${this.lineWidth}|${this.getLineDash().join(',')}|${this.strokeStyle}`);
        return stroke.apply(this, args);
      };
      const fillText = proto.fillText;
      /** @param {any[]} args */
      proto.fillText = function (...args) {
        frame()?.texts.push(String(args[0]));
        return fillText.apply(this, args);
      };
      const arc = proto.arc;
      /** @param {any[]} args */
      proto.arc = function (...args) {
        frame()?.arcs.push(args[2]);
        return arc.apply(this, args);
      };

      // E2E-08: count contexts and started sources. Missing Web Audio stays missing.
      w.__audio = { contexts: 0, sources: 0 };
      const Native = w.AudioContext;
      if (Native) {
        w.AudioContext = class extends Native {
          /** @param {any[]} args */
          constructor(...args) {
            super(...args);
            w.__audio.contexts += 1;
            w.__audio.ctx = this;
          }
          createOscillator() {
            const node = super.createOscillator();
            const start = node.start.bind(node);
            /** @param {any[]} a */
            node.start = (...a) => {
              w.__audio.sources += 1;
              return start(...a);
            };
            return node;
          }
          createBufferSource() {
            const node = super.createBufferSource();
            const start = node.start.bind(node);
            /** @param {any[]} a */
            node.start = (...a) => {
              w.__audio.sources += 1;
              return start(...a);
            };
            return node;
          }
        };
      }
    },
    { seed, hook, best, noAudio },
  );
  if (beforeGoto) await beforeGoto();
  await page.goto(goto);
  loaded = true;
  // install() leaves the fake clock running in wall time, so slow engines
  // (WebKit) would tick the game between steps. Pause it: only runFor moves time.
  await pauseClock(page);
  await page.clock.runFor(200);
  return { errors, requests, lateRequests, responses };
}

/**
 * Whether everything inside an overlay sits inside the window horizontally,
 * and the page itself does not scroll sideways (E2E-21, A11Y-15).
 * @param {import('@playwright/test').Page} page @param {string} overlayId
 */
export const fitsWidth = (page, overlayId) =>
  page.evaluate((id) => {
    const wide = [...(/** @type {HTMLElement} */ (document.getElementById(id))).querySelectorAll('*')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.left < -0.5 || r.right > innerWidth + 0.5);
      })
      .map((el) => el.id || el.tagName);
    return { wide, pageOverflow: document.documentElement.scrollWidth - innerWidth };
  }, overlayId);

/**
 * Pauses the fake clock, which runs in wall time until then. The target must
 * still be in the future when the call arrives, and a loaded machine (Firefox
 * with several workers) can take seconds, so the margin is generous and the
 * call is retried with a bigger one.
 * @param {import('@playwright/test').Page} page
 */
export async function pauseClock(page) {
  for (const margin of [5000, 60_000]) {
    try {
      await page.clock.pauseAt(await page.evaluate((m) => Date.now() + m, margin));
      return;
    } catch (err) {
      if (margin === 60_000 || !String(err).includes('past')) throw err;
    }
  }
}

/** @param {import('@playwright/test').Page} page */
export const snap = (page) => page.evaluate(() => /** @type {any} */ (window).__WT_TEST__.snapshot());
/** @param {import('@playwright/test').Page} page */
export const events = (page) => page.evaluate(() => /** @type {any} */ (window).__WT_TEST__.events());
/** @param {import('@playwright/test').Page} page */
export const focusedId = (page) => page.evaluate(() => document.activeElement?.id ?? null);
/** @param {import('@playwright/test').Page} page */
export const visibleOverlays = (page) =>
  page.evaluate((ids) => ids.filter((id) => !(/** @type {HTMLElement} */ (document.getElementById(id))).hidden), OVERLAYS);
/**
 * What the last drawn frame contained: texts, stroke styles ("width|dash|colour") and arc radii.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ texts: string[], strokes: string[], arcs: number[] }>}
 */
export const lastFrame = (page) => page.evaluate(() => /** @type {any} */ (window).__frames.at(-1));
/** @param {import('@playwright/test').Page} page */
export const liveText = (page) => page.locator('#wt-live').textContent();

/**
 * Lets the fake clock run in real time for a callback (axe and the like use
 * timers), then pauses it again.
 * @template T
 * @param {import('@playwright/test').Page} page @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function inRealTime(page, fn) {
  await page.clock.resume();
  try {
    return await fn();
  } finally {
    await pauseClock(page);
  }
}

/**
 * Every text the page can show, on every screen, for the name search (E2E-10).
 * @param {import('@playwright/test').Page} page
 */
export const pageStrings = (page) =>
  page.evaluate(() => [
    document.title,
    location.href,
    ...[...document.querySelectorAll('meta')].map((m) => `${m.name} ${m.content}`),
    document.body.textContent ?? '',
    ...[...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label') ?? ''),
  ].join(' | '));

/**
 * Presses Enter on the Start screen and runs a moment of game time.
 * @param {import('@playwright/test').Page} page
 */
export async function startGame(page) {
  await page.keyboard.press('Enter');
  await page.clock.runFor(200);
  expect((await snap(page)).screen).toBe('playing');
}

/**
 * Runs game time in slices until the snapshot's screen matches, or fails.
 * @param {import('@playwright/test').Page} page @param {string} screen @param {number} maxMs
 */
export async function runUntil(page, screen, maxMs) {
  for (let t = 0; t < maxMs; t += 500) {
    if ((await snap(page)).screen === screen) return t;
    await page.clock.runFor(500);
  }
  throw new Error(`screen never became ${screen} within ${maxMs} ms; it is ${(await snap(page)).screen}`);
}

/**
 * Bearing from the player to the live enemy relative to the player's heading,
 * in degrees (positive is to the right), the distance, and both tanks.
 * @param {any} s a snapshot
 */
export function aimAt(s) {
  const player = s.tanks.find((/** @type {any} */ t) => t.side === 'player');
  const enemy = s.tanks.find((/** @type {any} */ t) => t.side === 'enemy' && t.alive);
  if (!player || !enemy) return null;
  const dx = enemy.pos.x - player.pos.x;
  const dz = enemy.pos.z - player.pos.z;
  let rel = Math.atan2(dx, dz) - player.heading;
  rel -= 2 * Math.PI * Math.floor((rel + Math.PI) / (2 * Math.PI));
  return { relDeg: (rel * 180) / Math.PI, distance: Math.hypot(dx, dz), player, enemy };
}

/**
 * A scripted player: turns to face the live enemy, closes to `closeTo` units
 * and fires, until the score rises or `maxMs` of game time has passed. It
 * drives only the keyboard. Returns the game time used, or null on failure.
 * @param {import('@playwright/test').Page} page
 * `onSlice` runs after every slice of game time, for checks that need to see
 * each frame's draw calls.
 * @param {{ maxMs?: number, closeTo?: number, onSlice?: (s: any) => Promise<void> }} [opts]
 */
export async function killEnemy(page, { maxMs = 30_000, closeTo = 35, onSlice } = {}) {
  const startScore = (await snap(page)).score;
  /** @type {Set<string>} */
  const held = new Set();
  /** @param {string[]} want */
  const hold = async (want) => {
    for (const k of [...held]) {
      if (!want.includes(k)) {
        await page.keyboard.up(k);
        held.delete(k);
      }
    }
    for (const k of want) {
      if (!held.has(k)) {
        await page.keyboard.down(k);
        held.add(k);
      }
    }
  };
  let used = 0;
  try {
    while (used < maxMs) {
      const s = await snap(page);
      if (s.score > startScore) return used;
      const a = s.screen === 'playing' ? aimAt(s) : null;
      if (!a) {
        await hold([]);
        await page.clock.runFor(100);
        used += 100;
        if (onSlice) await onSlice(await snap(page));
        continue;
      }
      const tol = (Math.atan(2.5 / Math.max(a.distance, 1)) * 180) / Math.PI;
      /** @type {string[]} */
      const keys = [];
      if (a.relDeg > tol) keys.push('KeyD');
      else if (a.relDeg < -tol) keys.push('KeyA');
      else if (a.distance > closeTo) keys.push('KeyW');
      await hold(keys);
      const slice = Math.abs(a.relDeg) < 8 ? STEP_MS : 50;
      if (keys.length === 0 && s.shells.every((/** @type {any} */ sh) => sh.side !== 'player')) await page.keyboard.press('Space');
      await page.clock.runFor(slice);
      used += slice;
      if (onSlice) await onSlice(await snap(page));
    }
  } finally {
    await hold([]);
  }
  return null;
}
