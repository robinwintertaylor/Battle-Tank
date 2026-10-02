// Keyboard input (ARCHITECTURE.md 4.5, REQUIREMENTS.md BR-01, UX_SPEC.md
// 4.1). Keys are identified by KeyboardEvent.code, so other layouts work.
// Held keys drive and turn; presses since the last step become the fire
// edge and the commands. One InputSnapshot is taken per simulation step.
// No DOM here: main.js passes the events in, so this is unit-tested in Node.

/** @typedef {import('../core/sim.js').InputSnapshot} InputSnapshot */
/** @typedef {import('../core/sim.js').Command} Command */
/** @typedef {import('../core/world.js').Screen} Screen */
/** @typedef {'forward' | 'reverse' | 'left' | 'right' | 'fire' | 'pause' | 'escape' | 'mute' | 'enter'} Action */
/** @typedef {{ held: Set<Action>, firePressed: boolean, commands: Command[] }} InputState */

/** The one key table (BR-01). */
export const KEYS = Object.freeze(/** @type {Record<string, Action>} */ ({
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'reverse',
  ArrowDown: 'reverse',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'fire',
  KeyP: 'pause',
  Escape: 'escape',
  KeyM: 'mute',
  Enter: 'enter',
}));

/** @returns {InputState} */
export function createInput() {
  return { held: new Set(), firePressed: false, commands: [] };
}

/**
 * Handles a keydown. Returns true if the browser's default action should be
 * prevented: the game's keys during play, so Space and the arrows never
 * scroll the page (BR-01). Overlays keep Tab, Enter and Space for buttons.
 * @param {InputState} input @param {{ code: string, repeat: boolean }} e @param {Screen} screen
 */
export function keyDown(input, e, screen) {
  const action = Object.hasOwn(KEYS, e.code) ? KEYS[e.code] : undefined;
  if (!action) return false;
  const inPlay = screen === 'playing' || screen === 'respawning' || screen === 'destroyed';
  if (action === 'forward' || action === 'reverse' || action === 'left' || action === 'right') {
    input.held.add(action);
    return inPlay;
  }
  if (e.repeat) return inPlay; // auto-repeat never fires or commands (BR-01)
  if (action === 'fire') {
    if (inPlay) input.firePressed = true;
    return inPlay;
  }
  if (action === 'mute') {
    input.commands.push('mute');
    return false;
  }
  const command = commandFor(action, screen);
  if (command) input.commands.push(command);
  return inPlay;
}

/**
 * What P, Escape and Enter mean on each screen (UX_SPEC.md 4.1). game.js's
 * `pause` never resumes, so the key has to choose. Escape is P everywhere
 * except Game over, where it goes to the title screen (BR-20).
 * @param {'pause' | 'escape' | 'enter'} action @param {Screen} screen
 * @returns {Command | null}
 */
function commandFor(action, screen) {
  if (action === 'enter') {
    if (screen === 'start') return 'start';
    if (screen === 'gameover') return 'restart';
    return null;
  }
  if (screen === 'playing' || screen === 'respawning') return 'pause';
  if (screen === 'paused') return 'resume';
  if (screen === 'gameover' && action === 'escape') return 'quit-to-title';
  return null;
}

/** @param {InputState} input @param {{ code: string }} e */
export function keyUp(input, e) {
  const action = Object.hasOwn(KEYS, e.code) ? KEYS[e.code] : undefined;
  if (action) input.held.delete(action);
}

/**
 * When the window loses focus every held key counts as released (BR-01).
 * @param {InputState} input
 */
export function releaseAll(input) {
  input.held.clear();
}

/**
 * A command from an overlay button, or from the page (auto-pause).
 * @param {InputState} input @param {Command} command
 */
export function queue(input, command) {
  input.commands.push(command);
}

/**
 * A finite axis value in -1..1, or 0. Every axis goes through this before it
 * reaches the simulation, so a bad device value cannot poison a position.
 * @param {number} v
 */
export function axis(v) {
  return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
}

/**
 * Takes this step's snapshot and clears the presses. Opposite keys cancel.
 * @param {InputState} input
 * @returns {InputSnapshot}
 */
export function takeSnapshot(input) {
  const h = input.held;
  const snapshot = {
    throttle: axis((h.has('forward') ? 1 : 0) - (h.has('reverse') ? 1 : 0)),
    turn: axis((h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0)),
    firePressed: input.firePressed,
    commands: input.commands,
  };
  input.firePressed = false;
  input.commands = [];
  return snapshot;
}
