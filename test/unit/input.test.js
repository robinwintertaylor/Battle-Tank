// UT-INPUT: the key table, held keys, the fire edge, commands by screen,
// browser defaults, blur, and the axis gate (input.js, BR-01, UX_SPEC.md 4.1).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { axis, createInput, keyDown, keyUp, queue, releaseAll, takeSnapshot } from '../../site/src/platform/input.js';

/** @param {string} code @param {boolean} [repeat] */
const k = (code, repeat = false) => ({ code, repeat });

test('BR-01 WASD and the arrows drive and turn; opposite keys cancel', () => {
  const input = createInput();
  keyDown(input, k('KeyW'), 'playing');
  keyDown(input, k('ArrowRight'), 'playing');
  assert.deepEqual(takeSnapshot(input), { throttle: 1, turn: 1, firePressed: false, commands: [] });
  keyDown(input, k('ArrowDown'), 'playing');
  keyDown(input, k('KeyA'), 'playing');
  let s = takeSnapshot(input);
  assert.equal(s.throttle, 0, 'forward plus reverse cancel');
  assert.equal(s.turn, 0, 'left plus right cancel');
  keyUp(input, k('KeyW'));
  keyUp(input, k('ArrowRight'));
  s = takeSnapshot(input);
  assert.equal(s.throttle, -1);
  assert.equal(s.turn, -1);
});

test('BR-01 keys are physical positions: the AZERTY Z key sends code KeyW and drives forward', () => {
  const input = createInput();
  const zKey = { code: 'KeyW', key: 'z', repeat: false }; // a real KeyboardEvent carries both
  keyDown(input, zKey, 'playing');
  assert.equal(takeSnapshot(input).throttle, 1);
  const wKey = { code: 'KeyZ', key: 'w', repeat: false };
  keyDown(input, wKey, 'playing');
  keyUp(input, k('KeyW'));
  assert.equal(takeSnapshot(input).throttle, 0, 'the key labelled W on AZERTY is not a game key');
});

test('BR-01 AC-04.3 fire acts on key-down only, once per press; auto-repeat is ignored', () => {
  const input = createInput();
  keyDown(input, k('Space'), 'playing');
  assert.equal(takeSnapshot(input).firePressed, true);
  keyDown(input, k('Space', true), 'playing');
  assert.equal(takeSnapshot(input).firePressed, false, 'holding Space does not fire again');
});

test('fire does nothing outside play', () => {
  const input = createInput();
  keyDown(input, k('Space'), 'paused');
  keyDown(input, k('Space'), 'start');
  assert.equal(takeSnapshot(input).firePressed, false);
});

test('UX 4.1 P and Esc pause in play and resume when paused; Esc on Game over goes to the title', () => {
  /** @param {string} code @param {import('../../site/src/core/world.js').Screen} screen */
  const commands = (code, screen) => {
    const input = createInput();
    keyDown(input, k(code), screen);
    return takeSnapshot(input).commands;
  };
  assert.deepEqual(commands('KeyP', 'playing'), ['pause']);
  assert.deepEqual(commands('Escape', 'respawning'), ['pause']);
  assert.deepEqual(commands('KeyP', 'paused'), ['resume']);
  assert.deepEqual(commands('Escape', 'paused'), ['resume']);
  assert.deepEqual(commands('Escape', 'gameover'), ['quit-to-title']);
  assert.deepEqual(commands('KeyP', 'gameover'), []);
  assert.deepEqual(commands('KeyP', 'start'), []);
  assert.deepEqual(commands('KeyP', 'destroyed'), [], 'BR-22: no pause from Destroyed');
});

test('BR-18 BR-20 Enter starts from Start and restarts from Game over, and does nothing in play', () => {
  const input = createInput();
  keyDown(input, k('Enter'), 'start');
  keyDown(input, k('Enter'), 'gameover');
  keyDown(input, k('Enter'), 'playing');
  assert.deepEqual(takeSnapshot(input).commands, ['start', 'restart']);
});

test('BR-23 M toggles sound on every screen', () => {
  for (const screen of /** @type {const} */ (['start', 'playing', 'paused', 'gameover', 'destroyed'])) {
    const input = createInput();
    keyDown(input, k('KeyM'), screen);
    assert.deepEqual(takeSnapshot(input).commands, ['mute'], screen);
  }
});

test('auto-repeat never sends a command twice', () => {
  const input = createInput();
  keyDown(input, k('KeyP'), 'playing');
  keyDown(input, k('KeyP', true), 'playing');
  keyDown(input, k('KeyM', true), 'playing');
  assert.deepEqual(takeSnapshot(input).commands, ['pause']);
});

test('BR-01 game keys prevent the browser default only during play', () => {
  const input = createInput();
  assert.equal(keyDown(input, k('Space'), 'playing'), true);
  assert.equal(keyDown(input, k('ArrowUp'), 'respawning'), true);
  assert.equal(keyDown(input, k('Space'), 'paused'), false, 'Space may activate a focused button');
  assert.equal(keyDown(input, k('Enter'), 'start'), false);
  assert.equal(keyDown(input, k('Tab'), 'playing'), false, 'not a game key');
  assert.equal(keyDown(input, k('KeyM'), 'playing'), false);
});

test('BR-01 when the window loses focus every held key is released', () => {
  const input = createInput();
  keyDown(input, k('KeyW'), 'playing');
  keyDown(input, k('KeyD'), 'playing');
  releaseAll(input);
  const s = takeSnapshot(input);
  assert.equal(s.throttle, 0);
  assert.equal(s.turn, 0);
});

test('a snapshot clears the presses but keeps the held keys', () => {
  const input = createInput();
  keyDown(input, k('KeyW'), 'playing');
  queue(input, 'pause');
  assert.deepEqual(takeSnapshot(input).commands, ['pause']);
  const again = takeSnapshot(input);
  assert.deepEqual(again.commands, []);
  assert.equal(again.throttle, 1);
});

test('Security D1 note: every axis is finite and in -1..1 before it reaches the simulation', () => {
  assert.equal(axis(Number.NaN), 0);
  assert.equal(axis(Number.POSITIVE_INFINITY), 0);
  assert.equal(axis(Number.NEGATIVE_INFINITY), 0);
  assert.equal(axis(3), 1);
  assert.equal(axis(-0.5), -0.5);
});

test('a key named after an Object property is not a game key', () => {
  const input = createInput();
  assert.equal(keyDown(input, k('constructor'), 'playing'), false);
  keyUp(input, k('toString'));
  assert.deepEqual(takeSnapshot(input), { throttle: 0, turn: 0, firePressed: false, commands: [] });
});
