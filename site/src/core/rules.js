// Scoring, lives, respawn, enemy spawning and difficulty (ARCHITECTURE.md 4.1,
// REQUIREMENTS.md BR-11 to BR-17 and BR-19). Pure, like the rest of core/.
// Screen timers are deadlines in ticks, so a paused game, whose tick does not
// move, holds every one of them (BR-22).

import { AI } from './ai/registry.js';
import { isClear } from './collision.js';
import { CONFIG } from './config.js';
import { degToRad, distance } from './math.js';
import { nextRange } from './rng.js';

/** @typedef {import('./math.js').Vec2} Vec2 */
/** @typedef {import('./config.js').Config} Config */
/** @typedef {import('./world.js').GameState} GameState */
/** @typedef {import('./world.js').Tank} Tank */

export const SPAWN_ATTEMPTS = 50;

/**
 * Where an enemy spawns when 50 random attempts find no valid point (BR-14):
 * the furthest clear one from the player. All are clear of the fixed layout
 * (unit test). Corners first, so a tie goes to a corner.
 * @type {readonly Readonly<Vec2>[]}
 */
export const SPAWN_FALLBACK = Object.freeze([
  { x: -200, z: -200 }, { x: 200, z: -200 }, { x: 200, z: 200 }, { x: -200, z: 200 },
  { x: 0, z: -200 }, { x: 200, z: 0 }, { x: 0, z: 200 }, { x: -200, z: 0 },
].map((p) => Object.freeze(p)));

/**
 * Whole steps in a duration.
 * @param {number} seconds @param {Config} config
 */
export function ticksFor(seconds, config) {
  return Math.round(seconds / config.stepSeconds);
}

/**
 * Level = min(K-19, 1 + floor(score / K-18)) (BR-17).
 * @param {number} score @param {Config} [config]
 */
export function levelFor(score, config = CONFIG) {
  return Math.min(config.maxLevel, 1 + Math.floor(score / config.pointsPerLevel));
}

/**
 * The difficulty table row for a score (BR-17).
 * @param {number} score @param {Config} [config]
 */
export function difficultyFor(score, config = CONFIG) {
  return config.difficulty[levelFor(score, config) - 1];
}

/** @param {GameState} state @returns {Tank} */
function playerOf(state) {
  return /** @type {Tank} */ (state.tanks.find((t) => t.id === state.playerId));
}

/**
 * Clears the game back to its starting values, with the player at K-21 and
 * no enemy. The generator and ids carry on, so the next game differs.
 * @param {GameState} state @param {Config} config
 */
export function resetGame(state, config) {
  const player = playerOf(state);
  state.tanks = [player];
  state.shells.length = 0;
  state.score = 0;
  state.lives = config.startingLives;
  state.level = 1;
  state.resumeTo = 'playing';
  state.timers = { respawnAt: 0, gameOverAt: 0, enemySpawnAt: state.tick, lockoutUntil: 0 };
  placePlayer(player, config);
}

/**
 * Starts a new game on the Playing screen with its first enemy (BR-19).
 * @param {GameState} state @param {Config} [config]
 */
export function newGame(state, config = CONFIG) {
  resetGame(state, config);
  state.screen = 'playing';
  spawnEnemies(state, config);
}

/** @param {Tank} player @param {Config} config */
function placePlayer(player, config) {
  const spawn = config.playerSpawn;
  const heading = degToRad(spawn.headingDeg);
  player.pos = { x: spawn.x, z: spawn.z };
  player.prevPos = { x: spawn.x, z: spawn.z };
  player.heading = heading;
  player.prevHeading = heading;
  player.alive = true;
  player.reload = 0;
}

/**
 * A tank hit by a shell is destroyed (BR-10). An enemy kill scores and starts
 * the K-14 delay (BR-11, BR-14). A player death costs a life and goes to
 * Respawning, or to Destroyed on the last life (BR-12, BR-13).
 * @param {GameState} state @param {Tank} tank @param {Config} [config]
 */
export function applyHit(state, tank, config = CONFIG) {
  if (!tank.alive) return;
  tank.alive = false;
  const pos = { x: tank.pos.x, z: tank.pos.z };
  if (tank.side === 'enemy') {
    state.tanks = state.tanks.filter((t) => t !== tank);
    state.events.push({ type: 'tank-hit', tick: state.tick, tankId: tank.id, pos });
    state.score += config.pointsPerKill;
    const level = levelFor(state.score, config);
    if (level > state.level) {
      state.level = level;
      state.events.push({ type: 'level-up', tick: state.tick, level });
    }
    state.timers.enemySpawnAt = state.tick + ticksFor(config.enemyRespawnSeconds, config);
    return;
  }
  state.lives = Math.max(0, state.lives - 1);
  state.events.push({ type: 'player-hit', tick: state.tick, tankId: tank.id, livesLeft: state.lives, pos });
  if (state.lives > 0) {
    state.screen = 'respawning';
    state.timers.respawnAt = state.tick + ticksFor(config.playerRespawnSeconds, config);
  } else {
    state.screen = 'destroyed';
    state.timers.gameOverAt = state.tick + ticksFor(config.gameOverDelaySeconds, config);
  }
}

/**
 * Moves Respawning on to Playing after K-13, and Destroyed on to Game over
 * after K-27 (BR-13). A respawn puts the player back at K-21 and replaces
 * the enemy, so the player is never shot on the spot.
 * @param {GameState} state @param {Config} [config]
 */
export function advanceScreen(state, config = CONFIG) {
  if (state.screen === 'respawning' && state.tick >= state.timers.respawnAt) {
    placePlayer(playerOf(state), config);
    state.tanks = state.tanks.filter((t) => t.side === 'player');
    state.timers.enemySpawnAt = state.tick;
    state.screen = 'playing';
  } else if (state.screen === 'destroyed' && state.tick >= state.timers.gameOverAt) {
    state.screen = 'gameover';
    // Counted from the first step the Game over screen is shown (BR-20).
    state.timers.lockoutUntil = state.tick + 1 + ticksFor(config.restartLockoutSeconds, config);
    state.events.push({ type: 'game-over', tick: state.tick, score: state.score });
  }
}

/**
 * Tops the enemies up to `maxEnemies` once the K-14 delay is over, and only
 * during Playing (BR-14).
 * @param {GameState} state @param {Config} [config]
 */
export function spawnEnemies(state, config = CONFIG) {
  if (state.screen !== 'playing' || state.tick < state.timers.enemySpawnAt) return;
  const player = playerOf(state);
  while (state.tanks.filter((t) => t.side === 'enemy').length < config.maxEnemies) spawnEnemy(state, player.pos, config);
}

/** @param {GameState} state @param {Vec2} target @param {Config} config */
function spawnEnemy(state, target, config) {
  const pos = pickSpawnPoint(state, target, config);
  const heading = Math.atan2(target.x - pos.x, target.z - pos.z);
  const row = difficultyFor(state.score, config);
  /** @type {Tank} */
  const enemy = {
    id: state.nextId++,
    side: 'enemy',
    kind: 'hunter',
    pos,
    prevPos: { x: pos.x, z: pos.z },
    heading,
    prevHeading: heading,
    alive: true,
    reload: 0,
    graceTicks: ticksFor(config.enemyGraceSeconds, config),
    control: { type: 'ai', memory: AI.hunter.createMemory() },
    tuning: { level: row.level, turnRateDeg: row.turnRateDeg, aimToleranceDeg: row.aimToleranceDeg, reloadTicks: ticksFor(row.reloadSeconds, config) },
  };
  state.tanks.push(enemy);
  state.events.push({ type: 'enemy-spawned', tick: state.tick, tankId: enemy.id, pos: { x: pos.x, z: pos.z } });
}

/**
 * A spawn point K-10 to K-11 from `from`, inside the boundary and clear of
 * every obstacle and live tank, from up to 50 seeded attempts. Failing that,
 * the furthest clear point on the fallback list (BR-14).
 * @param {GameState} state @param {Vec2} from @param {Config} [config]
 * @returns {Vec2}
 */
export function pickSpawnPoint(state, from, config = CONFIG) {
  const r = config.tankRadius;
  const others = state.tanks.filter((t) => t.alive).map((t) => t.pos);
  /** @param {Vec2} p */
  const valid = (p) => isClear(p, r, state.obstacles, config.arenaHalfSize) && others.every((o) => distance(o, p) >= 2 * r);
  for (let i = 0; i < SPAWN_ATTEMPTS; i++) {
    const angle = nextRange(state, 0, 2 * Math.PI);
    const d = nextRange(state, config.enemySpawnDistanceMin, config.enemySpawnDistanceMax);
    const p = { x: from.x + Math.sin(angle) * d, z: from.z + Math.cos(angle) * d };
    if (valid(p)) return p;
  }
  let best = SPAWN_FALLBACK[0];
  let bestDistance = -1;
  for (const p of SPAWN_FALLBACK) {
    const d = distance(p, from);
    if (d > bestDistance && valid(p)) {
      best = p;
      bestDistance = d;
    }
  }
  return { x: best.x, z: best.z };
}
