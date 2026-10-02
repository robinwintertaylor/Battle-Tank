// Draws a frame on a 2D canvas (ARCHITECTURE.md 4.4, ADR 0001). It knows
// nothing about tanks: it clears, then strokes each palette key's segments as
// one path in that key's colour, width and dash, then draws fills and text.
// World keys shake with the view on a hit; HUD keys stay still. A move to
// WebGL replaces only this file.

import { PALETTE_SPEC, STROKE_KEYS } from './palette.js';

/** @typedef {import('./palette.js').Buckets} Buckets */
/** @typedef {import('./palette.js').Palette} Palette */
/** @typedef {import('./palette.js').PaletteKey} PaletteKey */
/** @typedef {import('./hud.js').HudExtras} HudExtras */
/** @typedef {import('./hud.js').HudView} HudView */
/** @typedef {import('./camera.js').Viewport} Viewport */
/**
 * The canvas calls the renderer uses, so tests can pass a recording stub.
 * @typedef {Pick<CanvasRenderingContext2D,
 *   'setTransform' | 'fillRect' | 'save' | 'restore' | 'translate' | 'beginPath' | 'moveTo' | 'lineTo' |
 *   'stroke' | 'fill' | 'closePath' | 'arc' | 'setLineDash' | 'fillText' |
 *   'fillStyle' | 'strokeStyle' | 'lineWidth' | 'font' | 'textAlign' | 'textBaseline' | 'lineCap' | 'lineJoin'>} Ctx
 */

/**
 * @param {Ctx} ctx @param {Buckets} segments 2D, stride 4, in CSS pixels @param {HudExtras} extras
 * @param {HudView} view @param {Palette} palette @param {Viewport} viewport @param {number} scale device pixels per CSS pixel
 */
export function draw(ctx, segments, extras, view, palette, viewport, scale) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.save();
  ctx.translate(view.shakeX, view.shakeY);
  for (const key of STROKE_KEYS) if (PALETTE_SPEC[key].layer === 'world') strokeKey(ctx, segments, key, palette);
  ctx.restore();
  for (const key of STROKE_KEYS) if (PALETTE_SPEC[key].layer === 'hud') strokeKey(ctx, segments, key, palette);

  for (const f of extras.fills) {
    ctx.fillStyle = palette.strokes[f.key].color;
    ctx.beginPath();
    if (f.kind === 'circle') {
      ctx.arc(f.x, f.y, f.r, 0, 2 * Math.PI);
    } else {
      ctx.moveTo(f.points[0], f.points[1]);
      for (let i = 2; i < f.points.length; i += 2) ctx.lineTo(f.points[i], f.points[i + 1]);
      ctx.closePath();
    }
    ctx.fill();
  }

  ctx.textBaseline = 'alphabetic';
  for (const t of extras.texts) {
    ctx.fillStyle = palette.strokes[t.key].color;
    ctx.font = `${t.size}px ${palette.font}`;
    ctx.textAlign = t.align;
    ctx.fillText(t.text, t.x, t.y);
  }
}

/**
 * One path and one stroke for every segment of a key (ARCHITECTURE.md 6.1).
 * @param {Ctx} ctx @param {Buckets} segments @param {PaletteKey} key @param {Palette} palette
 */
function strokeKey(ctx, segments, key, palette) {
  const b = segments[key];
  if (b.count === 0) return;
  const style = palette.strokes[key];
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.setLineDash(/** @type {number[]} */ (style.dash));
  ctx.beginPath();
  const d = b.data;
  for (let i = 0; i < b.count; i++) {
    const k = i * 4;
    ctx.moveTo(d[k], d[k + 1]);
    ctx.lineTo(d[k + 2], d[k + 3]);
  }
  ctx.stroke();
}
