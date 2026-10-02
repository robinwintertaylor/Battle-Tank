// UT-AUDIO: which sound each simulation event makes, where an enemy shot is
// panned, and the Web Audio glue against a stand-in AudioContext: nothing
// before the first key press, mute, and a browser with no Web Audio at all
// (audio.js, ADR 0006, US-11, US-12, AC-01.4, TEST_STRATEGY.md 3.2 rule 4).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createAudio, panFor, soundFor } from '../../site/src/platform/audio.js';
import { close, player, playing } from './support.js';

/** An AudioParam that records its value and the automation calls made on it. */
function param(value = 0) {
  return {
    value,
    calls: /** @type {string[]} */ ([]),
    /** @param {number} v */
    setValueAtTime(v) {
      this.value = v;
      this.calls.push('set');
      return this;
    },
    linearRampToValueAtTime() {
      this.calls.push('linear');
      return this;
    },
    exponentialRampToValueAtTime() {
      this.calls.push('exp');
      return this;
    },
  };
}

/** A minimal AudioContext stand-in. Every node made is kept in `nodes`. */
function fakeAudio({ resume = () => Promise.resolve() } = {}) {
  /** @type {FakeContext[]} */
  const made = [];
  class FakeContext {
    state = 'suspended';
    currentTime = 0;
    sampleRate = 48000;
    destination = { kind: 'destination' };
    /** @type {Record<string, any>[]} */
    nodes = [];
    constructor() {
      made.push(this);
    }
    resume() {
      this.state = 'running';
      return resume();
    }
    /** @param {string} kind @param {Record<string, unknown>} [extra] */
    node(kind, extra = {}) {
      const n = {
        kind,
        started: false,
        connections: /** @type {unknown[]} */ ([]),
        /** @param {unknown} to */
        connect(to) {
          this.connections.push(to);
          return to;
        },
        start() {
          this.started = true;
        },
        stop() {},
        ...extra,
      };
      this.nodes.push(n);
      return n;
    }
    createGain() {
      return this.node('gain', { gain: param(1) });
    }
    createOscillator() {
      return this.node('oscillator', { type: 'sine', frequency: param(440) });
    }
    createStereoPanner() {
      return this.node('panner', { pan: param(0) });
    }
    createBiquadFilter() {
      return this.node('filter', { type: 'lowpass', frequency: param(350) });
    }
    createBufferSource() {
      return this.node('buffer-source', { buffer: null });
    }
    /** @param {number} channels @param {number} length */
    createBuffer(channels, length) {
      const data = new Float32Array(length);
      return { length, getChannelData: () => data };
    }
  }
  return { win: /** @type {any} */ ({ AudioContext: FakeContext }), made };
}

/** @param {{ nodes: Record<string, any>[] }} ctx */
const started = (ctx) => ctx.nodes.filter((n) => n.started).length;

test('AC-11.1 a shot makes a shot sound: the player\'s is low, the enemy\'s is higher', () => {
  const { state } = playing();
  const enemyId = /** @type {number} */ (state.tanks.find((t) => t.side === 'enemy')?.id);
  assert.equal(soundFor({ type: 'shot', tick: 0, tankId: state.playerId }, state.playerId), 'player-shot');
  assert.equal(soundFor({ type: 'shot', tick: 0, tankId: enemyId }, state.playerId), 'enemy-shot');
});

test('AC-11.2 a destroyed tank, enemy or player, makes the explosion', () => {
  assert.equal(soundFor({ type: 'tank-hit', tick: 0, tankId: 2 }, 1), 'explosion');
  assert.equal(soundFor({ type: 'player-hit', tick: 0, tankId: 1 }, 1), 'explosion');
});

test('AC-11.3 a new enemy makes the warning ping, and an enemy starting to aim makes the blips', () => {
  assert.equal(soundFor({ type: 'enemy-spawned', tick: 0, tankId: 2 }, 1), 'warning');
  assert.equal(soundFor({ type: 'enemy-aiming', tick: 0, tankId: 2 }, 1), 'aiming');
});

test('UX 12 events with no sound in the audio table make none', () => {
  for (const type of ['shell-blocked', 'level-up', 'game-over', 'unknown']) {
    assert.equal(soundFor({ type, tick: 0 }, 1), null, type);
  }
});

test('UX 12 an enemy shot is panned towards the enemy, relative to where the player faces', () => {
  const listener = { pos: { x: 0, z: 0 }, heading: 0 };
  close(panFor(listener, { x: 0, z: 100 }), 0); // dead ahead
  close(panFor(listener, { x: 100, z: 0 }), 1); // right: +x when facing +z
  close(panFor(listener, { x: -100, z: 0 }), -1);
  close(panFor(listener, { x: 0, z: -100 }), 0); // behind
  close(panFor({ pos: { x: 0, z: 0 }, heading: Math.PI / 2 }, { x: 0, z: 100 }), -1, 1e-9); // facing +x, +z is on the left
  close(panFor(listener, { x: 0, z: 0 }), 0); // on top of the player
});

test('AC-01.4 before the first key press no AudioContext exists and nothing plays', () => {
  const { win, made } = fakeAudio();
  const audio = createAudio(win);
  const { state } = playing();
  audio.play([{ type: 'shot', tick: 0, tankId: state.playerId }], state);
  assert.equal(made.length, 0);
});

test('ADR 0006 the first key press makes one context and resumes it; later presses reuse it', () => {
  const { win, made } = fakeAudio();
  const audio = createAudio(win);
  audio.unlock();
  audio.unlock();
  assert.equal(made.length, 1);
  assert.equal(made[0].state, 'running');
});

test('AC-11.1 once unlocked, a sound event starts sound through the master gain', () => {
  const { win, made } = fakeAudio();
  const audio = createAudio(win);
  audio.unlock();
  const ctx = made[0];
  const master = ctx.nodes[0];
  assert.equal(master.kind, 'gain');
  assert.ok(master.connections.includes(ctx.destination));
  const { state } = playing();
  audio.play([], state);
  assert.equal(started(ctx), 0, 'no events, no sound');
  for (const type of ['shot', 'tank-hit', 'enemy-spawned', 'enemy-aiming']) {
    const before = started(ctx);
    audio.play([{ type, tick: 0, tankId: state.playerId, pos: { x: 0, z: 0 } }], state);
    assert.ok(started(ctx) > before, `${type} starts a sound`);
  }
});

test('UX 12 an enemy shot goes through a stereo panner set towards the enemy', () => {
  const { win, made } = fakeAudio();
  const audio = createAudio(win);
  audio.unlock();
  const { state } = playing(); // the enemy is at +x, the player faces +z
  const enemy = /** @type {import('./support.js').Tank} */ (state.tanks.find((t) => t.side === 'enemy'));
  audio.play([{ type: 'shot', tick: 0, tankId: enemy.id }], state);
  const panner = made[0].nodes.find((n) => n.kind === 'panner');
  assert.ok(panner, 'a panner is used');
  close(panner.pan.value, panFor(player(state), enemy.pos));
  assert.ok(panner.pan.value > 0.5, 'and the enemy is to the right');
});

test('AC-12.1 AC-12.2 mute silences the master gain and plays nothing; unmute plays from the next event', () => {
  const { win, made } = fakeAudio();
  const audio = createAudio(win);
  audio.unlock();
  const ctx = made[0];
  const master = ctx.nodes[0];
  const { state } = playing();
  const shot = [{ type: 'shot', tick: 0, tankId: state.playerId }];
  audio.setMuted(true);
  assert.equal(master.gain.value, 0);
  audio.play(shot, state);
  assert.equal(started(ctx), 0);
  audio.setMuted(false);
  assert.ok(master.gain.value > 0);
  audio.play(shot, state);
  assert.ok(started(ctx) > 0);
});

test('BR-23 muting before the first key press still holds once the context exists', () => {
  const { win, made } = fakeAudio();
  const audio = createAudio(win);
  audio.setMuted(true);
  audio.unlock();
  assert.equal(made[0].nodes[0].gain.value, 0);
});

test('AC-01.4 a context that is not running yet plays nothing, so no sound bursts out later', () => {
  const { win, made } = fakeAudio({ resume: () => new Promise(() => {}) });
  const audio = createAudio(win);
  audio.unlock();
  made[0].state = 'suspended';
  const { state } = playing();
  audio.play([{ type: 'shot', tick: 0, tankId: state.playerId }], state);
  assert.equal(started(made[0]), 0);
});

test('TS 3.2 rule 4 with no AudioContext at all the game runs silently and nothing throws', () => {
  const audio = createAudio(/** @type {any} */ ({}));
  const { state } = playing();
  audio.unlock();
  audio.setMuted(true);
  audio.setMuted(false);
  audio.play([{ type: 'shot', tick: 0, tankId: state.playerId }], state);
});

test('BR-27 a context that fails to construct or to resume leaves the game running, silently', async () => {
  const throwing = createAudio(
    /** @type {any} */ ({
      AudioContext: class {
        constructor() {
          throw new Error('NotSupportedError');
        }
      },
    }),
  );
  const { state } = playing();
  throwing.unlock();
  throwing.play([{ type: 'shot', tick: 0, tankId: state.playerId }], state);

  /** @type {unknown[]} */
  const unhandled = [];
  const onUnhandled = (/** @type {unknown} */ reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  const { win } = fakeAudio({ resume: () => Promise.reject(new Error('NotAllowedError')) });
  createAudio(win).unlock();
  await nextTurn(); // unhandled rejections are reported by then
  process.off('unhandledRejection', onUnhandled);
  assert.deepEqual(unhandled, []);
});

test('BR-27 if Web Audio throws while playing, sound switches off and the game carries on', () => {
  const { win, made } = fakeAudio();
  const audio = createAudio(win);
  audio.unlock();
  made[0].createOscillator = () => {
    throw new Error('InvalidStateError');
  };
  const { state } = playing();
  const shot = [{ type: 'shot', tick: 0, tankId: state.playerId }];
  audio.play(shot, state);
  audio.setMuted(true);
  audio.unlock();
  audio.play(shot, state);
  assert.equal(made.length, 1, 'no new context is tried');
});
