// The read-only test hook (ADR 0008, NFR-22, T5). Playwright sets
// window.__WT_TEST__ = { seed } before the page's scripts run. main.js reads
// it once, at start-up, through readTestHook. Only a plain object counts,
// so a DOM element with that id cannot switch it on, and nothing set later
// changes anything. The hook then gains read-only snapshot() and events().
// With no hook, nothing is exposed.

/** @typedef {import('../core/world.js').GameState} GameState */
/** @typedef {import('../core/world.js').GameEvent} GameEvent */
/** @typedef {import('../render/hud.js').HudView} HudView */
/** @typedef {{ seed: number | null, target: Record<string, unknown> }} TestHook */

export const EVENT_LIMIT = 1000;
const MAX_SEED = 0xffffffff;

/**
 * The hook object and its seed, or null if the test runner did not set one.
 * The seed is used only if it is a safe integer in the 32-bit unsigned range.
 * @param {{ __WT_TEST__?: unknown }} win
 * @returns {TestHook | null}
 */
export function readTestHook(win) {
  const target = win.__WT_TEST__;
  if (target === null || typeof target !== 'object' || Object.getPrototypeOf(target) !== Object.prototype) return null;
  const hook = /** @type {Record<string, unknown>} */ (target);
  const seed = hook.seed;
  const valid = typeof seed === 'number' && Number.isSafeInteger(seed) && seed >= 0 && seed <= MAX_SEED;
  return { seed: valid ? seed : null, target: hook };
}

/**
 * Adds snapshot() and events() to the hook object, and returns the two
 * functions main.js calls: record (inside the step loop, so no event is
 * missed) and publish (once per frame).
 * @param {TestHook} hook
 */
export function installTestHook(hook) {
  /** @type {GameEvent[]} */
  const log = [];
  /** @type {Readonly<Record<string, unknown>>} */
  let latest = Object.freeze({});
  hook.target.snapshot = () => latest;
  hook.target.events = () => deepFreeze(structuredClone(log));
  return {
    /** @param {readonly GameEvent[]} events */
    record(events) {
      for (const e of events) {
        log.push(structuredClone(e));
        if (log.length > EVENT_LIMIT) log.shift();
      }
    },
    /** @param {GameState} state @param {HudView} view @param {{ muted: boolean, page: string }} extra */
    publish(state, view, extra) {
      latest = deepFreeze({ ...structuredClone(state), view: { ...view }, muted: extra.muted, page: extra.page });
    },
  };
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
