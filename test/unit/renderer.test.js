// The palette (UX_SPEC.md 8.2) and the canvas renderer, against a recording
// stub of the 2D context: one path and one stroke per palette key (6.1).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { draw } from '../../site/src/render/canvas-renderer.js';
import { BACKGROUND_TOKEN, FONT_TOKEN, PALETTE_SPEC, STROKE_KEYS, clearBuckets, createBuckets, push2, resolvePalette } from '../../site/src/render/palette.js';

const TOKENS = {
  '--wt-color-bg': ' #070A12',
  '--wt-color-world': '#3FC9DB',
  '--wt-color-horizon': '#2F9FB0',
  '--wt-color-enemy': '#FFB547',
  '--wt-color-text': '#E3F6F8',
  '--wt-color-text-dim': '#8FB3BC',
  '--wt-color-alert': '#FF6B81',
  '--wt-font': 'ui-monospace, monospace ',
};
const palette = resolvePalette((t) => /** @type {Record<string, string>} */ (TOKENS)[t] ?? '');

/** A stub that records each call as [name, ...args] and each property write as ['set', name, value]. */
function recorder() {
  /** @type {unknown[][]} */
  const calls = [];
  const target = {};
  const ctx = new Proxy(target, {
    get: (_t, name) => (/** @type {unknown[]} */ ...args) => calls.push([String(name), ...args]),
    set: (_t, name, value) => {
      calls.push(['set', String(name), value]);
      return true;
    },
  });
  return { ctx: /** @type {import('../../site/src/render/canvas-renderer.js').Ctx} */ (/** @type {unknown} */ (ctx)), calls };
}

const VP = { width: 800, height: 600 };
const noShake = { shakeX: 0, shakeY: 0, hitFrame: false };

test('UX_SPEC.md 8.2 colours come from the CSS tokens, trimmed; widths and dashes from the spec', () => {
  assert.equal(palette.background, '#070A12');
  assert.equal(palette.font, 'ui-monospace, monospace');
  assert.equal(palette.strokes.enemy.color, '#FFB547');
  assert.equal(palette.strokes.world.width, 1.5);
  assert.equal(palette.strokes.enemy.width, 2);
  assert.deepEqual(palette.strokes.enemyGrace.dash, [6, 4]);
  assert.deepEqual(palette.strokes.crosshairDim.dash, [3, 5]);
  assert.equal(palette.strokes.alert.width, 10);
  assert.equal(BACKGROUND_TOKEN, '--wt-color-bg');
  assert.equal(FONT_TOKEN, '--wt-font');
  for (const key of STROKE_KEYS) assert.ok(PALETTE_SPEC[key].token.startsWith('--wt-color-'), key);
});

test('a bucket never grows past its capacity', () => {
  const b = createBuckets(4);
  for (let i = 0; i < 10; i++) push2(b.alert, 0, 0, 1, 1);
  assert.equal(b.alert.count, b.alert.capacity);
  clearBuckets(b);
  assert.equal(b.alert.count, 0);
});

test('6.1 draw clears to the background, then makes one path and one stroke per non-empty key', () => {
  const b = createBuckets(4);
  push2(b.world, 0, 0, 10, 10);
  push2(b.world, 5, 5, 20, 20);
  push2(b.enemy, 1, 1, 2, 2);
  push2(b.hud, 3, 3, 4, 4);
  const { ctx, calls } = recorder();
  draw(ctx, b, { fills: [], texts: [] }, noShake, palette, VP, 2);
  assert.deepEqual(calls[0], ['setTransform', 2, 0, 0, 2, 0, 0], 'scaled for devicePixelRatio, so widths stay in CSS px');
  assert.deepEqual(calls.find((c) => c[0] === 'fillRect'), ['fillRect', 0, 0, 800, 600]);
  assert.equal(calls.filter((c) => c[0] === 'stroke').length, 3);
  assert.equal(calls.filter((c) => c[0] === 'beginPath').length, 3);
  assert.equal(calls.filter((c) => c[0] === 'moveTo').length, 4);
  const strokeStyles = calls.filter((c) => c[0] === 'set' && c[1] === 'strokeStyle').map((c) => c[2]);
  assert.deepEqual(strokeStyles, ['#3FC9DB', '#FFB547', '#E3F6F8']);
});

test('AC-14.1 the shake moves only the world layer; the HUD stays put', () => {
  const b = createBuckets(4);
  push2(b.world, 0, 0, 10, 10);
  push2(b.hud, 3, 3, 4, 4);
  const { ctx, calls } = recorder();
  draw(ctx, b, { fills: [], texts: [] }, { shakeX: 4, shakeY: -2, hitFrame: true }, palette, VP, 1);
  const names = calls.map((c) => (c[0] === 'set' ? `set:${c[1]}` : c[0]));
  const translate = calls.findIndex((c) => c[0] === 'translate');
  assert.deepEqual(calls[translate], ['translate', 4, -2]);
  const restore = names.indexOf('restore');
  const strokes = names.map((n, i) => (n === 'stroke' ? i : -1)).filter((i) => i >= 0);
  assert.ok(strokes[0] > translate && strokes[0] < restore, 'world stroke inside the shaken block');
  assert.ok(strokes[1] > restore, 'HUD stroke after it');
});

test('fills and text use their palette colour, the token font and the given alignment', () => {
  const b = createBuckets(4);
  const { ctx, calls } = recorder();
  draw(ctx, b, {
    fills: [{ kind: 'circle', x: 5, y: 6, r: 2, key: 'hud' }, { kind: 'poly', points: [0, 0, 4, 0, 2, 3], key: 'enemy' }],
    texts: [{ text: 'SCORE', x: 24, y: 36, size: 14, key: 'hudDim', align: 'left' }],
  }, noShake, palette, VP, 1);
  assert.ok(calls.some((c) => c[0] === 'arc' && c[1] === 5 && c[2] === 6 && c[3] === 2));
  assert.equal(calls.filter((c) => c[0] === 'fill').length, 2);
  assert.ok(calls.some((c) => c[0] === 'closePath'));
  assert.ok(calls.some((c) => c[0] === 'set' && c[1] === 'font' && c[2] === '14px ui-monospace, monospace'));
  assert.ok(calls.some((c) => c[0] === 'fillText' && c[1] === 'SCORE' && c[2] === 24 && c[3] === 36));
  assert.ok(calls.some((c) => c[0] === 'set' && c[1] === 'textAlign' && c[2] === 'left'));
});
