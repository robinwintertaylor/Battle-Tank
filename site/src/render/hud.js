// The HUD as numbers: 2D segments, fills and text items (ARCHITECTURE.md 4.4,
// UX_SPEC.md 5.2 and 6). Pure, so every rule is testable without a canvas.
// All geometry is in CSS pixels. Timings run on simulation ticks, so a paused
// game freezes the HUD's effects with everything else.
//
// The HUD keeps a little memory of recent events (when the player was hit,
// when the enemy last fired, the points banner). The frame loop passes each
// step's events to noteEvents inside the step loop, because the simulation
// clears them every step.

import { CONFIG } from '../core/config.js';
import { distance, lerp, wrapAngle } from '../core/math.js';
import { horizontalFov } from './camera.js';
import { push2 } from './palette.js';
import { cameraFor } from './scene.js';

/** @typedef {import('../core/world.js').GameState} GameState */
/** @typedef {import('../core/world.js').GameEvent} GameEvent */
/** @typedef {import('../core/config.js').Config} Config */
/** @typedef {import('./camera.js').Viewport} Viewport */
/** @typedef {import('./palette.js').Buckets} Buckets */
/** @typedef {import('./palette.js').PaletteKey} PaletteKey */
/** @typedef {{ hitAt: number, enemyShotAt: number, pointsUntil: number, pointsText: string }} HudMemory */
/** @typedef {{ kind: 'poly', points: number[], key: PaletteKey } | { kind: 'circle', x: number, y: number, r: number, key: PaletteKey }} Fill */
/** @typedef {{ text: string, x: number, y: number, size: number, key: PaletteKey, align: 'left' | 'center' | 'right' }} TextItem */
/** @typedef {{ fills: Fill[], texts: TextItem[] }} HudExtras */
/** @typedef {{ viewport: Viewport, alpha: number, reducedMotion: boolean, muted: boolean, best: number }} HudOptions */
/** @typedef {{ shakeX: number, shakeY: number, hitFrame: boolean }} HudView */

const NEVER = -1e9;
const MARGIN_X = 24; // UX_SPEC.md 8.5
const TAPE_FROM_BOTTOM = 56;
const CROSSHAIR_RADIUS = 18; // a 36 px circle
const ARC_GAP = 0.25; // rad
const ARC_STEPS = 6;
const RING_RADIUS = 13;
const CHEVRON_INSET = 28;

/** @returns {HudMemory} */
export function createHudMemory() {
  return { hitAt: NEVER, enemyShotAt: NEVER, pointsUntil: NEVER, pointsText: '' };
}

/**
 * Remembers what the HUD needs from one step's events.
 * @param {HudMemory} memory @param {GameState} state @param {readonly GameEvent[]} events @param {Config} [config]
 */
export function noteEvents(memory, state, events, config = CONFIG) {
  for (const e of events) {
    if (e.type === 'player-hit') {
      memory.hitAt = e.tick;
      memory.pointsUntil = NEVER; // a newer banner replaces an older one (6.6)
    } else if (e.type === 'tank-hit') {
      memory.pointsText = `+${config.pointsPerKill}`;
      memory.pointsUntil = e.tick + ticks(config.pointsBannerSeconds, config);
    } else if (e.type === 'shot' && e.tankId !== state.playerId) {
      memory.enemyShotAt = e.tick;
    }
  }
}

/** @param {number} seconds @param {Config} config */
function ticks(seconds, config) {
  return Math.round(seconds / config.stepSeconds);
}

/**
 * Builds the HUD into `out` (stride 4) and `extras`, and returns the view
 * effects the renderer applies (the shake offset and the hit frame).
 * @param {GameState} state @param {HudMemory} memory @param {HudOptions} opts @param {Buckets} out @param {HudExtras} extras @param {Config} [config]
 * @returns {HudView}
 */
export function buildHud(state, memory, opts, out, extras, config = CONFIG) {
  const { viewport: vp } = opts;
  extras.fills.length = 0;
  extras.texts.length = 0;
  const now = state.tick;
  const player = state.tanks.find((t) => t.id === state.playerId);
  const cam = cameraFor(state, opts.alpha, config);

  // Score, lives, best score and key hints (UX_SPEC.md 5.2).
  text(extras, 'SCORE', MARGIN_X, 36, 14, 'hudDim', 'left');
  text(extras, String(state.score), MARGIN_X + 64, 36, 20, 'hud', 'left');
  text(extras, 'LIVES', MARGIN_X, 62, 14, 'hudDim', 'left');
  text(extras, String(state.lives), MARGIN_X + 64, 62, 20, 'hud', 'left');
  for (let i = 0; i < state.lives; i++) triangle(out, MARGIN_X + 96 + i * 20, 62);
  if (opts.best > 0) text(extras, `BEST ${opts.best}`, vp.width - MARGIN_X, 36, 14, 'hudDim', 'right');
  text(extras, `P PAUSE   M SOUND ${opts.muted ? 'OFF' : 'ON'}`, vp.width - MARGIN_X, 62, 14, 'hudDim', 'right');

  // Crosshair (6.3): ready, or dashed and dim with no dot when it cannot fire.
  const ready = player !== undefined && player.alive && player.reload <= 0 && !state.shells.some((s) => s.ownerId === state.playerId);
  crosshair(out, vp.width / 2, vp.height / 2, ready ? 'hud' : 'crosshairDim');
  if (ready) extras.fills.push({ kind: 'circle', x: vp.width / 2, y: vp.height / 2, r: 2.5, key: 'hud' });

  // Bearing tape (6.4) and edge chevron (6.5).
  const enemy = state.tanks.find((t) => t.side === 'enemy' && t.alive);
  const halfFov = horizontalFov(vp, config.fovVerticalDeg) / 2;
  const half = Math.min(480, 0.6 * vp.width) / 2;
  const cx = vp.width / 2;
  const base = vp.height - TAPE_FROM_BOTTOM;
  push2(out.hudDim, cx - half, base, cx + half, base);
  for (let deg = -180; deg <= 180; deg += 45) {
    const x = cx + (deg / 180) * half;
    push2(out.hudDim, x, base, x, base - (deg % 90 === 0 ? 20 : 12));
  }
  for (const side of [-1, 1]) {
    const x = cx + side * (halfFov / Math.PI) * half;
    push2(out.hud, x, base + 4, x, base - 24);
  }
  push2(out.hud, cx - 5, base + 12, cx, base + 6);
  push2(out.hud, cx, base + 6, cx + 5, base + 12);
  if (!enemy || !player) {
    text(extras, 'SCANNING', cx, base + 30, 14, 'hud', 'center');
  } else {
    const ex = lerp(enemy.prevPos.x, enemy.pos.x, opts.alpha);
    const ez = lerp(enemy.prevPos.z, enemy.pos.z, opts.alpha);
    const rel = relativeBearing(cam, ex, ez);
    const mx = cx + (rel / Math.PI) * half;
    const my = base - 10;
    extras.fills.push({ kind: 'poly', points: [mx, my - 9, mx + 7, my, mx, my + 9, mx - 7, my], key: 'enemy' });
    text(extras, `${Math.round(distance({ x: cam.x, z: cam.z }, { x: ex, z: ez }))} m`, cx, base + 30, 14, 'hud', 'center');
    const ai = enemy.control.type === 'ai' ? /** @type {{ state?: string }} */ (enemy.control.memory) : {};
    // The aiming ring pulses at 2 Hz, or stays steady under reduced motion (6.4).
    const pulseOn = opts.reducedMotion || Math.floor((now * config.stepSeconds) / (config.aimPulseSeconds / 2)) % 2 === 0;
    if (ai.state === 'aim' && pulseOn) ring(out.enemy, mx, my, RING_RADIUS);
    if (Math.abs(rel) > halfFov) {
      // Alert colour for K-30 after an enemy shot, once per shot (6.5, X6).
      const flash = now - memory.enemyShotAt < ticks(config.enemyShotFlashMs / 1000, config);
      chevron(out, vp, rel < 0 ? -1 : 1, flash ? 'chevronAlert' : 'chevron');
    }
  }

  // Banner (6.6): one at a time.
  let banner = null;
  if (state.screen === 'respawning') banner = { text: `HIT · ${state.lives} ${state.lives === 1 ? 'LIFE' : 'LIVES'} LEFT`, key: /** @type {PaletteKey} */ ('alert') };
  else if (state.screen === 'destroyed') banner = { text: 'DESTROYED', key: /** @type {PaletteKey} */ ('alert') };
  else if (now < memory.pointsUntil) banner = { text: memory.pointsText, key: /** @type {PaletteKey} */ ('hud') };
  if (banner) text(extras, banner.text, cx, Math.round(vp.height * 0.32), 28, banner.key, 'center');

  // Hit frame and shake (AC-14.1, AC-14.3).
  const sinceHit = now - memory.hitAt;
  const hitFrame = sinceHit >= 0 && sinceHit < ticks(config.hitFlashSeconds, config);
  if (hitFrame) {
    const i = 5;
    push2(out.alert, i, i, vp.width - i, i);
    push2(out.alert, vp.width - i, i, vp.width - i, vp.height - i);
    push2(out.alert, vp.width - i, vp.height - i, i, vp.height - i);
    push2(out.alert, i, vp.height - i, i, i);
  }
  const shakeTicks = ticks(config.shakeSeconds, config);
  let shakeX = 0;
  let shakeY = 0;
  if (!opts.reducedMotion && sinceHit >= 0 && sinceHit < shakeTicks) {
    const amp = config.shakeAmplitudePx * (1 - sinceHit / shakeTicks);
    shakeX = amp * Math.sin(sinceHit * 2.3);
    shakeY = amp * Math.cos(sinceHit * 3.1);
  }
  return { shakeX, shakeY, hitFrame };
}

/**
 * Bearing of a point relative to the camera's heading, in (-pi, pi]:
 * negative is to the left, +-pi is directly behind.
 * @param {{ x: number, z: number, heading: number }} cam @param {number} x @param {number} z
 */
export function relativeBearing(cam, x, z) {
  return wrapAngle(Math.atan2(x - cam.x, z - cam.z) - cam.heading);
}

/**
 * @param {HudExtras} extras @param {string} value @param {number} x @param {number} y @param {number} size
 * @param {PaletteKey} key @param {TextItem['align']} align
 */
function text(extras, value, x, y, size, key, align) {
  extras.texts.push({ text: value, x, y, size, key, align });
}

/**
 * One outline triangle for the lives row, 12 px wide, sitting on the baseline.
 * @param {Buckets} out @param {number} x @param {number} y
 */
function triangle(out, x, y) {
  push2(out.hud, x, y, x + 12, y);
  push2(out.hud, x + 12, y, x + 6, y - 14);
  push2(out.hud, x + 6, y - 14, x, y);
}

/**
 * Four arcs of a circle with gaps at 0, 90, 180 and 270 degrees (6.3).
 * @param {Buckets} out @param {number} cx @param {number} cy @param {PaletteKey} key
 */
function crosshair(out, cx, cy, key) {
  for (let q = 0; q < 4; q++) {
    const from = (q * Math.PI) / 2 + ARC_GAP / 2;
    const span = Math.PI / 2 - ARC_GAP;
    for (let i = 0; i < ARC_STEPS; i++) {
      const a = from + (span * i) / ARC_STEPS;
      const b = from + (span * (i + 1)) / ARC_STEPS;
      push2(out[key], cx + CROSSHAIR_RADIUS * Math.cos(a), cy + CROSSHAIR_RADIUS * Math.sin(a), cx + CROSSHAIR_RADIUS * Math.cos(b), cy + CROSSHAIR_RADIUS * Math.sin(b));
    }
  }
}

/**
 * A 16-sided ring.
 * @param {import('./palette.js').Bucket} b @param {number} cx @param {number} cy @param {number} r
 */
function ring(b, cx, cy, r) {
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    const c = ((i + 1) * Math.PI) / 8;
    push2(b, cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(c), cy + r * Math.sin(c));
  }
}

/**
 * The 14 x 44 px chevron 28 px in from the left or right edge, pointing out.
 * @param {Buckets} out @param {Viewport} vp @param {-1 | 1} side @param {PaletteKey} key
 */
function chevron(out, vp, side, key) {
  const tip = side < 0 ? CHEVRON_INSET : vp.width - CHEVRON_INSET;
  const back = tip - side * 14;
  const cy = vp.height / 2;
  push2(out[key], back, cy - 22, tip, cy);
  push2(out[key], tip, cy, back, cy + 22);
}
