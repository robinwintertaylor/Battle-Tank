// UT-FLOW: the screen state machine (REQUIREMENTS.md 8.1), pause, the
// small-window pause lock, quit to title, and the restart lockout.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../../site/src/core/config.js';
import { handleCommand, setWindowTooSmall } from '../../site/src/core/game.js';
import { applyHit } from '../../site/src/core/rules.js';
import { step } from '../../site/src/core/sim.js';
import { createWorld } from '../../site/src/core/world.js';
import { enemies, eventsOf, input, player, playing, run, shellAtPlayer, stepsFor } from './support.js';

/** @typedef {import('../../site/src/core/sim.js').Command} Command */
/** @typedef {import('../../site/src/core/world.js').GameState} GameState */

const idle = input();
/** @param {...Command} commands */
const cmd = (...commands) => input({ commands });

/** A game on the Game over screen, at the step it opened. */
function gameOver() {
  const { state, enemy } = playing();
  applyHit(state, enemy, CONFIG);
  state.lives = 1;
  shellAtPlayer(state);
  step(state, idle);
  run(state, idle, stepsFor(CONFIG.gameOverDelaySeconds));
  assert.equal(state.screen, 'gameover');
  return state;
}

test('BR-18 the game opens on the Start screen and Start begins a new game', () => {
  const state = createWorld(1, CONFIG);
  assert.equal(state.screen, 'start');
  step(state, cmd('start'));
  assert.equal(state.screen, 'playing');
  assert.equal(enemies(state).length, 1);
  assert.equal(state.tick, 1, 'the first step of play runs in the same step');
});

test('BR-18 only Start starts a game from the Start screen', () => {
  const state = createWorld(1, CONFIG);
  for (const c of /** @type {Command[]} */ (['pause', 'resume', 'restart', 'quit-to-title', 'mute', 'debug'])) {
    step(state, cmd(c));
    assert.equal(state.screen, 'start', c);
  }
});

test('BR-22 AC-10.1 AC-10.6 while Paused, no tank, shell or timer moves, whatever is pressed', () => {
  const { state } = playing();
  step(state, input({ firePressed: true, throttle: 1 }));
  step(state, cmd('pause'));
  assert.equal(state.screen, 'paused');
  const frozen = JSON.stringify({ ...state, events: [] });
  run(state, input({ throttle: 1, turn: -1, firePressed: true }), 300);
  assert.equal(JSON.stringify({ ...state, events: [] }), frozen);
});

test('AC-10.2 resuming continues from exactly the paused state: a paused run matches an unpaused one', () => {
  /** @param {number} tick */
  const drive = (tick) => input({ throttle: 1, turn: tick % 120 < 60 ? 1 : -1, firePressed: tick % 45 === 0 });
  const a = playing(9).state;
  const b = playing(9).state;
  for (let i = 0; i < 50; i++) step(a, drive(a.tick));
  step(a, cmd('pause'));
  run(a, idle, 30);
  step(a, { ...drive(a.tick), commands: ['resume'] });
  for (let i = 0; i < 49; i++) step(a, drive(a.tick));
  for (let i = 0; i < 100; i++) step(b, drive(b.tick));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('BR-22 pause from Respawning returns to Respawning, and the respawn timer waits', () => {
  const { state } = playing();
  shellAtPlayer(state);
  step(state, idle);
  run(state, idle, 10);
  step(state, cmd('pause'));
  run(state, idle, 500);
  step(state, cmd('resume'));
  assert.equal(state.screen, 'respawning');
  run(state, idle, stepsFor(CONFIG.playerRespawnSeconds) - 12);
  assert.equal(state.screen, 'respawning');
  step(state, idle);
  assert.equal(state.screen, 'playing');
});

test('BR-22 pause does nothing on the Destroyed, Game over and Paused screens', () => {
  const { state } = playing();
  state.lives = 1;
  shellAtPlayer(state);
  step(state, idle);
  step(state, cmd('pause'));
  assert.equal(state.screen, 'destroyed');
  const over = gameOver();
  handleCommand(over, 'pause', CONFIG);
  assert.equal(over.screen, 'gameover');
  const paused = playing().state;
  handleCommand(paused, 'pause', CONFIG);
  handleCommand(paused, 'pause', CONFIG); // an auto-pause while paused does not resume (AC-10.4)
  assert.equal(paused.screen, 'paused');
});

test('BR-25 AC-10.9 a window below K-29 pauses play and Resume does nothing', () => {
  const { state } = playing();
  setWindowTooSmall(state, true);
  assert.equal(state.screen, 'paused');
  assert.equal(state.pauseLocked, true);
  step(state, cmd('resume'));
  assert.equal(state.screen, 'paused');
});

test('BR-25 AC-10.10 AC-10.11 at K-29 again Resume works, but play stays paused until the player resumes', () => {
  const { state } = playing();
  setWindowTooSmall(state, true);
  setWindowTooSmall(state, false);
  assert.equal(state.screen, 'paused');
  assert.equal(state.pauseLocked, false);
  step(state, cmd('resume'));
  assert.equal(state.screen, 'playing');
});

test('BR-25 a small window only locks resume on the screens that can pause', () => {
  const state = createWorld(1, CONFIG);
  setWindowTooSmall(state, true);
  assert.equal(state.screen, 'start');
  step(state, cmd('start'));
  assert.equal(state.screen, 'playing', 'BR-24 is advice, not a block');
});

test('BR-26 AC-10.8 Quit to title from Paused shows Start and does not end the game with a game-over', () => {
  const { state, enemy } = playing();
  applyHit(state, enemy, CONFIG);
  step(state, cmd('pause'));
  step(state, cmd('quit-to-title'));
  assert.equal(state.screen, 'start');
  assert.equal(eventsOf(state, 'game-over').length, 0);
  assert.equal(enemies(state).length, 0);
  assert.deepEqual(state.shells, []);
  assert.equal(state.score, 0, 'the quit game is gone');
  run(state, idle, 10);
  assert.equal(state.screen, 'start');
});

test('BR-26 Quit to title is only on the Paused and (after the lockout) Game over screens', () => {
  const { state } = playing();
  step(state, cmd('quit-to-title'));
  assert.equal(state.screen, 'playing');
});

test('BR-20 AC-09.5 on Game over every command is ignored for K-17', () => {
  const state = gameOver();
  const lockout = stepsFor(CONFIG.restartLockoutSeconds);
  for (let i = 0; i < lockout; i++) {
    step(state, cmd('restart', 'quit-to-title', 'start'));
    assert.equal(state.screen, 'gameover', `step ${i}`);
  }
  step(state, cmd('restart'));
  assert.equal(state.screen, 'playing');
});

test('BR-20 AC-09.6 Play again after the lockout starts a new game with score 0 and lives K-08', () => {
  const state = gameOver();
  run(state, idle, stepsFor(CONFIG.restartLockoutSeconds));
  step(state, cmd('restart'));
  assert.equal(state.screen, 'playing');
  assert.equal(state.score, 0);
  assert.equal(state.lives, CONFIG.startingLives);
  assert.equal(player(state).alive, true);
  assert.equal(enemies(state).length, 1);
});

test('BR-20 AC-09.8 Title screen after the lockout returns to Start', () => {
  const state = gameOver();
  run(state, idle, stepsFor(CONFIG.restartLockoutSeconds));
  step(state, cmd('quit-to-title'));
  assert.equal(state.screen, 'start');
});

test('Game over keeps the final score on screen and runs no simulation', () => {
  const state = gameOver();
  const score = state.score;
  run(state, input({ throttle: 1, firePressed: true }), 200);
  assert.equal(state.screen, 'gameover');
  assert.equal(state.score, score);
  assert.deepEqual(state.shells, []);
});

test('mute and debug are platform commands and leave the game unchanged', () => {
  const { state } = playing();
  const before = JSON.stringify(state);
  handleCommand(state, 'mute', CONFIG);
  handleCommand(state, 'debug', CONFIG);
  assert.equal(JSON.stringify(state), before);
});
