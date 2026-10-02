// HTML overlays over the canvas (ADR 0005, UX_SPEC.md 5 and 9). The
// decisions are pure functions, unit-tested in Node: which overlay shows,
// and what the live region announces. createScreens applies them to the
// DOM, writing text with textContent only (SEC-19), and only when something
// changed, never every frame.

/** @typedef {import('../core/world.js').GameState} GameState */
/** @typedef {import('../core/world.js').GameEvent} GameEvent */
/** @typedef {import('../core/world.js').Screen} Screen */
/** @typedef {'loading' | 'keyboard' | 'ready' | 'error'} Page */
/** @typedef {'start' | 'paused' | 'gameover' | 'keyboard' | 'error' | null} Overlay */
/** @typedef {{ overlay: Overlay, startReady: boolean, locked: boolean, tooSmall: boolean, score: number, best: number, newBest: boolean }} OverlayView */

/**
 * Which overlay shows, and in what state. Respawning and Destroyed have no
 * overlay: they are HUD banners (UX_SPEC.md 3).
 * @param {GameState} state @param {Page} page @param {{ best: number, newBest: boolean }} scores
 * @returns {OverlayView}
 */
export function overlayFor(state, page, scores) {
  const base = { startReady: page === 'ready', locked: false, tooSmall: false, score: state.score, best: scores.best, newBest: scores.newBest };
  if (page === 'error') return { ...base, overlay: 'error' };
  if (page === 'keyboard') return { ...base, overlay: 'keyboard' };
  if (page === 'loading' || state.screen === 'start') return { ...base, overlay: 'start' };
  if (state.screen === 'paused') return { ...base, overlay: 'paused', tooSmall: state.pauseLocked };
  if (state.screen === 'gameover') return { ...base, overlay: 'gameover', locked: state.tick < state.timers.lockoutUntil };
  return { ...base, overlay: null };
}

/**
 * The live region's message for this step, or null (UX_SPEC.md A11Y-13). It
 * announces changes of state only, never every frame.
 * @param {Screen} before @param {GameState} state @param {readonly GameEvent[]} events
 * @returns {string | null}
 */
export function announcementFor(before, state, events) {
  let message = null;
  if ((before === 'start' || before === 'gameover') && state.screen === 'playing') {
    message = `Game started. ${state.lives} ${state.lives === 1 ? 'life' : 'lives'}.`;
  }
  for (const e of events) {
    if (e.type === 'tank-hit') message = `Enemy destroyed. Score ${state.score}.`;
    else if (e.type === 'player-hit' && state.lives > 0) message = `Hit. ${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left.`;
    else if (e.type === 'game-over') message = `Game over. Final score ${state.score}.`;
  }
  if (before !== 'paused' && state.screen === 'paused') message = 'Paused.';
  return message;
}

/**
 * Binds the overlay elements in index.html. Returns `show`, which applies an
 * OverlayView and moves focus as UX_SPEC.md A11Y-4 asks, and `announce`.
 * @param {Document} doc
 */
export function createScreens(doc) {
  /** @param {string} id */
  const el = (id) => /** @type {HTMLElement} */ (doc.getElementById(id));
  const overlays = { start: el('wt-start'), paused: el('wt-paused'), gameover: el('wt-gameover'), keyboard: el('wt-keyboard'), error: el('wt-error') };
  const game = el('wt-game');
  const startButton = /** @type {HTMLButtonElement} */ (el('wt-start-button'));
  const startBest = el('wt-start-best');
  const pausedDialog = el('wt-paused');
  const pausedSmall = el('wt-paused-small');
  const resumeButton = /** @type {HTMLButtonElement} */ (el('wt-resume'));
  const overScore = el('wt-over-score');
  const overBest = el('wt-over-best');
  const overActions = el('wt-over-actions');
  const againButton = /** @type {HTMLButtonElement} */ (el('wt-again'));
  const live = el('wt-live');
  let last = '';

  /** @param {OverlayView} v */
  function show(v) {
    const key = JSON.stringify(v);
    if (key === last) return;
    const before = last ? /** @type {OverlayView} */ (JSON.parse(last)) : null;
    last = key;
    for (const [name, node] of Object.entries(overlays)) node.hidden = name !== v.overlay;

    startButton.disabled = !v.startReady;
    startButton.textContent = v.startReady ? 'Start game' : 'Loading…';
    startBest.hidden = v.best <= 0;
    startBest.textContent = `Best score ${v.best}`;

    pausedSmall.hidden = !v.tooSmall;
    resumeButton.disabled = v.tooSmall;

    overScore.textContent = String(v.score);
    overBest.hidden = v.best <= 0;
    overBest.textContent = v.newBest ? `Best ${v.best} · New best score` : `Best ${v.best}`;
    overActions.hidden = v.locked;

    // Focus on open (A11Y-4): the primary button, or the pause dialog itself.
    const opened = !before || before.overlay !== v.overlay;
    if (v.overlay === 'start' && v.startReady && (opened || !before?.startReady)) startButton.focus();
    else if (v.overlay === 'paused' && opened) pausedDialog.focus();
    else if (v.overlay === 'gameover' && !v.locked && (opened || before?.locked)) againButton.focus();
    else if (v.overlay === 'keyboard' && opened) el('wt-keyboard-button').focus();
    else if (v.overlay === 'error' && opened) el('wt-reload').focus();
    else if (v.overlay === null && opened) game.focus();
  }

  /** @param {string} message */
  function announce(message) {
    live.textContent = message;
  }

  return { show, announce };
}
