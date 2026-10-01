// Builds a new game state (ARCHITECTURE.md 4.1 and 4.2). The state is one
// plain, serialisable object: no classes, no closures, no DOM references.

import { degToRad } from './math.js';
import { normaliseSeed } from './rng.js';

/** @typedef {import('./math.js').Vec2} Vec2 */
/** @typedef {import('./config.js').Config} Config */
/** @typedef {import('./config.js').Footprint} Footprint */
/** @typedef {import('./config.js').ObstacleModel} ObstacleModel */

/** @typedef {{ id: number, model: ObstacleModel, pos: Vec2, yaw: number, footprint: Footprint }} Obstacle */
/** @typedef {{
 *   id: number, side: 'player' | 'enemy', kind: string,
 *   pos: Vec2, prevPos: Vec2, heading: number, prevHeading: number,
 *   alive: boolean, reload: number, graceTicks: number,
 *   control: { type: 'player' } | { type: 'ai', memory: object }
 * }} Tank */
/** @typedef {{ id: number, ownerId: number, pos: Vec2, prevPos: Vec2, vel: Vec2, ticksLeft: number }} Shell */
/** @typedef {{ type: string, tick: number, [detail: string]: unknown }} GameEvent */
/** @typedef {{
 *   screen: 'start' | 'playing' | 'paused' | 'gameover',
 *   tick: number, rng: number, nextId: number,
 *   tanks: Tank[], shells: Shell[], obstacles: Obstacle[],
 *   playerId: number, score: number, lives: number, level: number,
 *   events: GameEvent[]
 * }} GameState */

/**
 * @param {number} seed
 * @param {Config} config
 * @returns {GameState}
 */
export function createWorld(seed, config) {
  let nextId = 1;
  const obstacles = config.obstacleLayout.map((o) => ({
    id: nextId++,
    model: o.model,
    pos: { x: o.x, z: o.z },
    yaw: degToRad(o.yawDeg),
    footprint: { ...config.footprints[o.model] },
  }));
  const spawn = config.playerSpawn;
  const heading = degToRad(spawn.headingDeg);
  /** @type {Tank} */
  const player = {
    id: nextId++,
    side: 'player',
    kind: 'player',
    pos: { x: spawn.x, z: spawn.z },
    prevPos: { x: spawn.x, z: spawn.z },
    heading,
    prevHeading: heading,
    alive: true,
    reload: 0,
    graceTicks: 0,
    control: { type: 'player' },
  };
  return {
    screen: 'start',
    tick: 0,
    rng: normaliseSeed(seed),
    nextId,
    tanks: [player],
    shells: [],
    obstacles,
    playerId: player.id,
    score: 0,
    lives: config.startingLives,
    level: 1,
    events: [],
  };
}

/**
 * Radius of the smallest circle round a footprint, centred on the obstacle.
 * @param {Footprint} footprint
 */
export function footprintRadius(footprint) {
  return footprint.type === 'circle' ? footprint.radius : Math.hypot(footprint.halfLength, footprint.halfWidth);
}

/**
 * Fence posts along the boundary at +-halfSize, in order round the arena, so
 * the rail joins each post to the next (UX_SPEC.md 7.4). Posts are evenly
 * spaced at the spacing nearest to `spacing` that divides a side exactly.
 * @param {number} halfSize
 * @param {number} [spacing]
 * @returns {Vec2[]}
 */
export function fencePosts(halfSize, spacing = 25) {
  const side = 2 * halfSize;
  const gaps = Math.max(1, Math.round(side / spacing));
  const s = side / gaps;
  /** @type {Vec2[]} */
  const posts = [];
  for (let i = 0; i < gaps; i++) posts.push({ x: -halfSize + i * s, z: -halfSize });
  for (let i = 0; i < gaps; i++) posts.push({ x: halfSize, z: -halfSize + i * s });
  for (let i = 0; i < gaps; i++) posts.push({ x: halfSize - i * s, z: halfSize });
  for (let i = 0; i < gaps; i++) posts.push({ x: -halfSize, z: halfSize - i * s });
  return posts;
}
