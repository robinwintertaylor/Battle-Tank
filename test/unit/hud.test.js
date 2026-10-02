// UT-HUD: crosshair states, the bearing tape and chevron, score and lives,
// banners, hit feedback timing and reduced motion (hud.js, UX_SPEC.md 5.2, 6).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../../site/src/core/config.js';
import { degToRad } from '../../site/src/core/math.js';
import { applyHit } from '../../site/src/core/rules.js';
import { step } from '../../site/src/core/sim.js';
import { horizontalFov } from '../../site/src/render/camera.js';
import { buildHud, createHudMemory, noteEvents, relativeBearing } from '../../site/src/render/hud.js';
import { MODELS } from '../../site/src/core/models.js';
import { projectBuckets } from '../../site/src/render/camera.js';
import { PALETTE_SPEC, STROKE_KEYS, createBuckets } from '../../site/src/render/palette.js';
import { buildScene, cameraFor } from '../../site/src/render/scene.js';
import { close, input, player, playing, shellAtPlayer, stepsFor } from './support.js';

/** @typedef {import('../../site/src/core/world.js').GameState} GameState */
/** @typedef {import('../../site/src/render/hud.js').HudMemory} HudMemory */

const VP = { width: 1600, height: 900 };
const TAPE_HALF = 240; // min(480, 60% of 1600) / 2
const BASE = VP.height - 56;

/**
 * @param {GameState} state @param {HudMemory} [memory]
 * @param {Partial<import('../../site/src/render/hud.js').HudOptions>} [over]
 */
function hud(state, memory = createHudMemory(), over = {}) {
  const out = createBuckets(4);
  const extras = { fills: /** @type {import('../../site/src/render/hud.js').Fill[]} */ ([]), texts: /** @type {import('../../site/src/render/hud.js').TextItem[]} */ ([]) };
  const view = buildHud(state, memory, { viewport: VP, alpha: 1, reducedMotion: false, muted: false, best: 0, ...over }, out, extras);
  const texts = extras.texts.map((t) => t.text);
  const marker = extras.fills.find((f) => f.kind === 'poly' && f.key === 'enemy');
  return { out, extras, view, texts, marker };
}

/** Steps the game, feeding each step's events to the HUD memory, as the frame loop will. @param {GameState} state @param {HudMemory} memory @param {number} n */
function play(state, memory, n) {
  for (let i = 0; i < n; i++) {
    step(state, input());
    noteEvents(memory, state, state.events);
  }
}

/** @param {{ kind: string, points?: number[] } | undefined} marker */
const markerX = (marker) => /** @type {number[]} */ (/** @type {{ points: number[] }} */ (marker).points)[0];

test('AC-09.1 the HUD shows score 0 and lives 3 in a new game, with one triangle per life', () => {
  const { state } = playing();
  const h = hud(state);
  assert.ok(h.texts.includes('SCORE'));
  assert.ok(h.texts.includes('0'));
  assert.ok(h.texts.includes('3'));
  assert.ok(h.out.hud.count >= 3 * 3, 'three outline triangles');
});

test('US-15 the best score shows only when above 0, and the hint doubles as the mute indicator', () => {
  const { state } = playing();
  assert.ok(!hud(state).texts.some((t) => t.startsWith('BEST')));
  assert.ok(hud(state, undefined, { best: 1200 }).texts.includes('BEST 1200'));
  assert.ok(hud(state).texts.includes('P PAUSE   M SOUND ON'));
  assert.ok(hud(state, undefined, { muted: true }).texts.includes('P PAUSE   M SOUND OFF'));
});

test('M4 the crosshair is solid with a dot when ready, dashed and dim with no dot when it cannot fire', () => {
  const { state } = playing();
  let h = hud(state);
  assert.ok(h.out.hud.count > 0);
  assert.equal(h.out.crosshairDim.count, 0);
  assert.ok(h.extras.fills.some((f) => f.kind === 'circle'));
  player(state).reload = 5;
  h = hud(state);
  assert.equal(h.out.crosshairDim.count, 24);
  assert.ok(!h.extras.fills.some((f) => f.kind === 'circle'));
  player(state).reload = 0;
  state.shells.push({ id: 80, ownerId: state.playerId, side: 'player', pos: { x: 0, z: 5 }, prevPos: { x: 0, z: 4 }, vel: { x: 0, z: 80 }, ticksLeft: 5 });
  assert.equal(hud(state).out.crosshairDim.count, 24, 'shell in flight');
});

test('AC-08.1 the marker sits at the enemy\'s bearing relative to the heading, within +-5 degrees', () => {
  const { state } = playing(); // enemy at (100, 0): 90 degrees right of heading 0
  close(markerX(hud(state).marker), 800 + (90 / 180) * TAPE_HALF, 1e-6);
  player(state).heading = degToRad(60);
  player(state).prevHeading = degToRad(60);
  const x = markerX(hud(state).marker);
  const shown = ((x - 800) / TAPE_HALF) * 180;
  assert.ok(Math.abs(shown - 30) <= 5, `${shown}`);
});

test('AC-08.2 an enemy behind is at an end of the tape, never near the centre', () => {
  const { state } = playing(1, { x: 0, z: -100 });
  const x = markerX(hud(state).marker);
  close(Math.abs(x - 800), TAPE_HALF, 1e-6);
  assert.equal(x, 800 + TAPE_HALF, 'directly behind goes to the right end');
});

test('AC-08.3 with no enemy the locator shows no marker and reads SCANNING; otherwise the range', () => {
  const { state, enemy } = playing();
  let h = hud(state);
  assert.ok(h.texts.includes('100 m'));
  applyHit(state, enemy, CONFIG);
  h = hud(state);
  assert.equal(h.marker, undefined);
  assert.ok(h.texts.includes('SCANNING'));
});

test('AC-08.4 the locator uses this frame\'s heading: turning moves the marker at once', () => {
  const { state } = playing();
  const before = markerX(hud(state).marker);
  player(state).heading = 0.5;
  assert.notEqual(markerX(hud(state).marker), before);
});

test('6.4 the view bracket sits at half the horizontal field of view', () => {
  const { state } = playing();
  const h = hud(state);
  const half = horizontalFov(VP, CONFIG.fovVerticalDeg) / 2;
  const want = 800 + (half / Math.PI) * TAPE_HALF;
  let found = false;
  for (let i = 0; i < h.out.hud.count; i++) {
    const d = h.out.hud.data;
    if (Math.abs(d[i * 4] - want) < 1e-3 && d[i * 4] === d[i * 4 + 2] && Math.abs(d[i * 4 + 3] - (BASE - 24)) < 1e-6) found = true;
  }
  assert.ok(found);
});

test('6.5 the edge chevron shows only when the enemy is out of view, on the shorter turning side', () => {
  const { state } = playing(); // 90 degrees right: out of a 66 degree view
  let h = hud(state);
  assert.equal(h.out.chevron.count, 2);
  assert.ok(h.out.chevron.data[2] > 800, 'right edge');
  player(state).heading = Math.PI / 2;
  player(state).prevHeading = Math.PI / 2;
  h = hud(state);
  assert.equal(h.out.chevron.count, 0, 'in view: no chevron');
  player(state).heading = Math.PI;
  player(state).prevHeading = Math.PI;
  h = hud(state);
  assert.ok(h.out.chevron.data[2] < 800, 'enemy now to the left');
});

test('AC-08.5 an out-of-view enemy shot turns the chevron to alert for K-30, once', () => {
  const { state, enemy } = playing();
  const memory = createHudMemory();
  noteEvents(memory, state, [{ type: 'shot', tick: state.tick, tankId: enemy.id }]);
  assert.equal(hud(state, memory).out.chevronAlert.count, 2);
  state.tick += stepsFor(CONFIG.enemyShotFlashMs / 1000);
  const h = hud(state, memory);
  assert.equal(h.out.chevronAlert.count, 0);
  assert.equal(h.out.chevron.count, 2);
  noteEvents(memory, state, [{ type: 'shot', tick: state.tick, tankId: state.playerId }]);
  assert.equal(hud(state, memory).out.chevronAlert.count, 0, 'the player\'s own shot does not flash it');
});

test('6.4 an aiming enemy gets a ring that pulses at 2 Hz, or is steady with reduced motion', () => {
  const { state, enemy } = playing();
  enemy.control = { type: 'ai', memory: { state: 'aim' } };
  const half = stepsFor(CONFIG.aimPulseSeconds / 2);
  state.tick = 0;
  assert.equal(hud(state).out.aimRing.count, 16);
  state.tick = half;
  assert.equal(hud(state).out.aimRing.count, 0, 'off for the second quarter-second');
  assert.equal(hud(state, undefined, { reducedMotion: true }).out.aimRing.count, 16);
  enemy.control = { type: 'ai', memory: { state: 'approach' } };
  state.tick = 0;
  assert.equal(hud(state).out.aimRing.count, 0);
});

test('6.4 a visible aiming enemy gets its whole tank and its whole ring, and the ring does not shake', () => {
  const { state, enemy } = playing(1, { x: 0, z: 30 }); // straight ahead, in view
  enemy.control = { type: 'ai', memory: { state: 'aim' } };
  state.tick = 0;
  const out = createBuckets(4);
  const out3 = createBuckets(6);
  const cam = cameraFor(state, 1);
  buildScene(state, 1, cam, out3);
  projectBuckets(out3, cam, VP, CONFIG.fovVerticalDeg, CONFIG.nearPlane, out, STROKE_KEYS);
  buildHud(state, createHudMemory(), { viewport: VP, alpha: 1, reducedMotion: false, muted: false, best: 0 }, out, { fills: [], texts: [] });
  assert.equal(out.enemy.count, MODELS.tank.edges.length);
  assert.equal(out.aimRing.count, 16);
  assert.equal(PALETTE_SPEC.aimRing.layer, 'hud');
});

test('AC-14.1 AC-14.4 a hit shows the alert frame for K-23, shakes for K-28, and the HIT banner through Respawning', () => {
  const { state } = playing();
  const memory = createHudMemory();
  shellAtPlayer(state);
  play(state, memory, 1);
  let h = hud(state, memory);
  assert.equal(h.view.hitFrame, true);
  assert.equal(h.out.alert.count, 4);
  assert.ok(h.view.shakeX !== 0 || h.view.shakeY !== 0);
  assert.ok(h.texts.includes('HIT · 2 LIVES LEFT'));
  play(state, memory, stepsFor(CONFIG.shakeSeconds));
  h = hud(state, memory);
  assert.equal(h.view.shakeX, 0);
  assert.equal(h.view.shakeY, 0);
  assert.equal(h.view.hitFrame, true, 'the frame outlasts the shake');
  play(state, memory, stepsFor(CONFIG.hitFlashSeconds) - stepsFor(CONFIG.shakeSeconds));
  h = hud(state, memory);
  assert.equal(h.view.hitFrame, false);
  assert.ok(h.texts.includes('HIT · 2 LIVES LEFT'), 'the banner stays for all of Respawning');
  play(state, memory, stepsFor(CONFIG.playerRespawnSeconds));
  assert.equal(state.screen, 'playing');
  assert.ok(!hud(state, memory).texts.some((t) => t.startsWith('HIT')));
});

test('AC-14.4 one life left reads HIT · 1 LIFE LEFT', () => {
  const { state } = playing();
  state.lives = 2;
  shellAtPlayer(state);
  step(state, input());
  assert.ok(hud(state).texts.includes('HIT · 1 LIFE LEFT'));
});

test('AC-14.5 the last life reads DESTROYED until Game over', () => {
  const { state } = playing();
  state.lives = 1;
  shellAtPlayer(state);
  step(state, input());
  assert.ok(hud(state).texts.includes('DESTROYED'));
});

test('AC-14.2 the hit frame shows once per hit: one continuous run, well under three flashes a second', () => {
  const { state } = playing();
  const memory = createHudMemory();
  shellAtPlayer(state);
  /** @type {boolean[]} */
  const frames = [];
  for (let i = 0; i < 60; i++) {
    play(state, memory, 1);
    frames.push(hud(state, memory).view.hitFrame);
  }
  const onsets = frames.filter((on, i) => on && !frames[i - 1]).length;
  assert.equal(onsets, 1);
});

test('AC-14.3 NFR-16 with reduced motion the hit does not shake', () => {
  const { state } = playing();
  const memory = createHudMemory();
  shellAtPlayer(state);
  play(state, memory, 1);
  const h = hud(state, memory, { reducedMotion: true });
  assert.deepEqual([h.view.shakeX, h.view.shakeY], [0, 0]);
  assert.equal(h.view.hitFrame, true, 'the frame is not motion, so it stays');
});

test('6.6 a kill shows +100 for one second, and a newer HIT banner replaces it', () => {
  const { state, enemy } = playing();
  const memory = createHudMemory();
  applyHit(state, enemy, CONFIG);
  noteEvents(memory, state, state.events);
  assert.ok(hud(state, memory).texts.includes('+100'));
  state.tick += stepsFor(CONFIG.pointsBannerSeconds);
  assert.ok(!hud(state, memory).texts.includes('+100'));
  state.tick -= stepsFor(CONFIG.pointsBannerSeconds);
  shellAtPlayer(state);
  play(state, memory, 1);
  const texts = hud(state, memory).texts;
  assert.ok(!texts.includes('+100'));
  assert.ok(texts.includes('HIT · 2 LIVES LEFT'));
});

test('relativeBearing is negative to the left, positive to the right, and pi directly behind', () => {
  const cam = { x: 0, z: 0, heading: 0 };
  close(relativeBearing(cam, -1, 0), -Math.PI / 2);
  close(relativeBearing(cam, 1, 0), Math.PI / 2);
  close(relativeBearing(cam, 0, -1), Math.PI);
});
