// The screen state machine (REQUIREMENTS.md 8.1, ARCHITECTURE.md 4.1).
// Commands come from the input snapshot, so `step` applies them and a game
// replays from its inputs alone. Loading, Keyboard needed and Error are
// page-level states in main.js and screens.js (ARCHITECTURE.md 9).

import { CONFIG } from './config.js';
import { newGame, resetGame } from './rules.js';

/** @typedef {import('./config.js').Config} Config */
/** @typedef {import('./world.js').GameState} GameState */
/** @typedef {import('./sim.js').Command} Command */

/**
 * @param {GameState} state @param {Command} command @param {Config} [config]
 */
export function handleCommand(state, command, config = CONFIG) {
  switch (command) {
    case 'start': // BR-18
      if (state.screen === 'start') newGame(state, config);
      return;
    case 'pause': // BR-22: also the auto-pause, so it never resumes
      pause(state);
      return;
    case 'resume': // BR-22, BR-25
      if (state.screen === 'paused' && !state.pauseLocked) state.screen = state.resumeTo;
      return;
    case 'restart': // BR-20
      if (gameOverUnlocked(state)) newGame(state, config);
      return;
    case 'quit-to-title': // BR-20, BR-26: no game-over, so no best score
      if (state.screen === 'paused' || gameOverUnlocked(state)) {
        resetGame(state, config);
        state.screen = 'start';
      }
      return;
    default: // mute and debug belong to the platform
      return;
  }
}

/**
 * The window has gone below K-29, or come back to it (BR-25). Below it, play
 * pauses and resume is locked; at K-29 again resume is unlocked, but the game
 * stays paused until the player resumes (AC-10.10).
 * @param {GameState} state @param {boolean} tooSmall
 */
export function setWindowTooSmall(state, tooSmall) {
  state.pauseLocked = tooSmall;
  if (tooSmall) pause(state);
}

/** @param {GameState} state */
function pause(state) {
  if (state.screen === 'playing' || state.screen === 'respawning') {
    state.resumeTo = state.screen;
    state.screen = 'paused';
  }
}

/** @param {GameState} state */
function gameOverUnlocked(state) {
  return state.screen === 'gameover' && state.tick >= state.timers.lockoutUntil;
}
