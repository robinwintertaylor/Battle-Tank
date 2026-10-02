// One fixed step of the whole game (ARCHITECTURE.md 4.3, ADR 0003). Pure:
// no clock, no browser, no Math.random. Each call is one 1/60 s step.
//
// Order (REQUIREMENTS.md 8.2, ARCHITECTURE.md 4.3): commands, copy previous
// positions, intents (player from input, each enemy from its AI kind), move
// every tank, fire, move shells and resolve hits, screen timers, spawn, tank
// timers. Screens that do not simulate hold every object still, so the
// renderer's interpolation shows a frozen scene.

import { AI } from './ai/registry.js';
import { resolveTankMove, sweepShell } from './collision.js';
import { CONFIG } from './config.js';
import { handleCommand } from './game.js';
import { clamp, degToRad, forward, wrapAngle } from './math.js';
import { nextFloat } from './rng.js';
import { advanceScreen, applyHit, spawnEnemies, ticksFor } from './rules.js';

/** @typedef {import('./world.js').GameState} GameState */
/** @typedef {import('./world.js').Tank} Tank */
/** @typedef {import('./config.js').Config} Config */
/** @typedef {'start' | 'pause' | 'resume' | 'mute' | 'restart' | 'quit-to-title' | 'debug'} Command */
/** @typedef {{ throttle: number, turn: number, firePressed: boolean, commands: Command[] }} InputSnapshot */
/** @typedef {{ throttle: number, turn: number, fire: boolean }} Intent */
/** @typedef {{ forwardSpeed: number, reverseSpeed: number, turnRateDeg: number }} Drive */
/** What an AI may read: the live player (or null), the obstacles, whether its own shell is in flight, and the config.
 * @typedef {{ player: { pos: Vec2, heading: number } | null, obstacles: readonly Obstacle[], ownShellInFlight: boolean, config: Config }} AiView */
/** @typedef {import('./math.js').Vec2} Vec2 */
/** @typedef {import('./world.js').Obstacle} Obstacle */

/** Screens on which the world simulates. Destroyed keeps running for effects (BR-13). */
const SIMULATED = new Set(['playing', 'respawning', 'destroyed']);

/**
 * @param {GameState} state
 * @param {InputSnapshot} input
 * @param {Config} [config]
 */
export function step(state, input, config = CONFIG) {
  state.events.length = 0;
  for (const command of input.commands) handleCommand(state, command, config);
  if (!SIMULATED.has(state.screen)) {
    holdStill(state);
    // On Game over only the restart lockout runs (BR-20).
    if (state.screen === 'gameover') state.tick += 1;
    return;
  }

  for (const tank of state.tanks) {
    tank.prevPos = { x: tank.pos.x, z: tank.pos.z };
    tank.prevHeading = tank.heading;
  }

  const player = state.tanks.find((t) => t.id === state.playerId);
  // While dead, all player input but pause and mute is ignored (BR-13).
  const playerActs = player !== undefined && player.alive && state.screen === 'playing';
  /** @type {{ tank: Tank, intent: Intent, drive: Drive }[]} */
  const moves = [];
  if (playerActs) {
    const drive = { forwardSpeed: config.playerForwardSpeed, reverseSpeed: config.playerReverseSpeed, turnRateDeg: config.playerTurnRateDeg };
    moves.push({ tank: player, intent: { throttle: input.throttle, turn: input.turn, fire: input.firePressed }, drive });
  }
  for (const tank of state.tanks) {
    const intent = tank.alive && tank !== player ? think(state, tank, config) : null;
    if (!intent) continue;
    const turnRateDeg = tank.tuning ? tank.tuning.turnRateDeg : config.difficulty[0].turnRateDeg;
    moves.push({ tank, intent, drive: { forwardSpeed: config.enemyDriveSpeed, reverseSpeed: config.enemyDriveSpeed, turnRateDeg } });
  }
  for (const m of moves) moveTank(state, m.tank, m.intent, m.drive, config);
  for (const m of moves) tryFire(state, m.tank, m.intent.fire, config);

  moveShells(state, config);
  // A death removes every shell in flight, and none is fired while dead (BR-13).
  if (player && !player.alive) state.shells.length = 0;

  advanceScreen(state, config);
  spawnEnemies(state, config);
  for (const tank of state.tanks) {
    if (tank.reload > 0) tank.reload -= 1;
    if (tank.graceTicks > 0) tank.graceTicks -= 1;
  }
  state.tick += 1;
}

/**
 * Asks an enemy's AI kind for its intent, and emits `enemy-aiming` when the
 * AI moves into its `aim` state (ARCHITECTURE.md 4.2). A tank with no AI, or
 * of an unregistered kind, has no intent: it stands still and holds fire.
 * @param {GameState} state @param {Tank} tank @param {Config} config
 * @returns {Intent | null}
 */
function think(state, tank, config) {
  const control = tank.control;
  // Own keys only, so a kind such as 'constructor' cannot reach Object.prototype.
  const ai = control.type === 'ai' && Object.hasOwn(AI, tank.kind) ? AI[tank.kind] : undefined;
  if (!ai || control.type !== 'ai') return null;
  const memory = /** @type {{ state?: string }} */ (control.memory);
  const before = memory.state;
  // The AI gets a random source, not the state, so it can read but never write the world.
  const intent = ai.think(memory, tank, aiView(state, tank, config), () => nextFloat(state));
  if (memory.state === 'aim' && before !== 'aim') state.events.push({ type: 'enemy-aiming', tick: state.tick, tankId: tank.id });
  return intent;
}

/**
 * The read-only summary of the world an AI decides from (ARCHITECTURE.md 9).
 * @param {GameState} state @param {Tank} tank @param {Config} [config]
 * @returns {AiView}
 */
export function aiView(state, tank, config = CONFIG) {
  const player = state.tanks.find((t) => t.id === state.playerId && t.alive);
  return {
    player: player ? { pos: { x: player.pos.x, z: player.pos.z }, heading: player.heading } : null,
    obstacles: state.obstacles,
    ownShellInFlight: state.shells.some((s) => s.ownerId === tank.id),
    config,
  };
}

/**
 * Sets every tank's and shell's previous position to its current one, so a
 * scene that is not simulating renders still at any `alpha`.
 * @param {GameState} state
 */
function holdStill(state) {
  for (const tank of state.tanks) {
    tank.prevPos = { x: tank.pos.x, z: tank.pos.z };
    tank.prevHeading = tank.heading;
  }
  for (const shell of state.shells) shell.prevPos = { x: shell.pos.x, z: shell.pos.z };
}

/**
 * Turns, then drives, one tank for one step. The same rules for every tank,
 * so only the source of the intent differs between player and AI (ADR 0004).
 * A non-finite throttle or turn counts as 0.
 * @param {GameState} state @param {Tank} tank @param {Intent} intent @param {Drive} drive @param {Config} config
 */
export function moveTank(state, tank, intent, drive, config) {
  const dt = config.stepSeconds;
  const turn = Number.isFinite(intent.turn) ? clamp(intent.turn, -1, 1) : 0;
  const throttle = Number.isFinite(intent.throttle) ? clamp(intent.throttle, -1, 1) : 0;
  tank.heading = wrapAngle(tank.heading + turn * degToRad(drive.turnRateDeg) * dt);
  if (throttle === 0) return;
  const speed = (throttle > 0 ? drive.forwardSpeed : drive.reverseSpeed) * throttle * dt;
  const dir = forward(tank.heading);
  const to = { x: tank.pos.x + dir.x * speed, z: tank.pos.z + dir.z * speed };
  const others = state.tanks.filter((t) => t !== tank && t.alive).map((t) => t.pos);
  tank.pos = resolveTankMove(tank.pos, to, config.tankRadius, state.obstacles, config.arenaHalfSize, others);
}

/**
 * Fires a shell from the tank's muzzle if the rules allow it, and says
 * whether it did. Every tank needs: a fire request, to be alive, its reload
 * done and no shell in flight (BR-07, BR-08). An enemy also needs its grace
 * period over, a live player during Playing, and the player within its aim
 * tolerance (BR-13, BR-15, BR-16), so no AI can cheat by asking.
 * @param {GameState} state @param {Tank} tank @param {boolean} wantsFire @param {Config} [config]
 */
export function tryFire(state, tank, wantsFire, config = CONFIG) {
  if (!wantsFire || !tank.alive || tank.reload > 0) return false;
  if (state.shells.some((s) => s.ownerId === tank.id)) return false;
  let reload = ticksFor(config.playerReloadSeconds, config);
  if (tank.side === 'enemy') {
    const target = state.tanks.find((t) => t.id === state.playerId);
    if (!tank.tuning || tank.graceTicks > 0 || state.screen !== 'playing' || !target || !target.alive) return false;
    const bearing = Math.atan2(target.pos.x - tank.pos.x, target.pos.z - tank.pos.z);
    if (Math.abs(wrapAngle(bearing - tank.heading)) > degToRad(tank.tuning.aimToleranceDeg)) return false;
    reload = tank.tuning.reloadTicks;
  }
  const dir = forward(tank.heading);
  const muzzle = { x: tank.pos.x + dir.x * config.muzzleDistance, z: tank.pos.z + dir.z * config.muzzleDistance };
  const shell = {
    id: state.nextId++,
    ownerId: tank.id,
    side: tank.side,
    pos: muzzle,
    prevPos: { x: muzzle.x, z: muzzle.z },
    vel: { x: dir.x * config.shellSpeed, z: dir.z * config.shellSpeed },
    ticksLeft: ticksFor(config.shellRange / config.shellSpeed, config),
  };
  state.shells.push(shell);
  tank.reload = reload;
  state.events.push({ type: 'shot', tick: state.tick, tankId: tank.id, shellId: shell.id });
  return true;
}

/**
 * Moves every shell one step and sweeps it for the first thing on its path
 * (BR-09). A shell hits only the other side's live tanks. It is removed when
 * it hits anything, or when it has travelled K-06 (BR-08).
 * @param {GameState} state @param {Config} config
 */
function moveShells(state, config) {
  const dt = config.stepSeconds;
  const flying = state.shells;
  state.shells = [];
  for (const shell of flying) {
    shell.prevPos = shell.pos;
    shell.pos = { x: shell.pos.x + shell.vel.x * dt, z: shell.pos.z + shell.vel.z * dt };
    const targets = state.tanks.filter((t) => t.alive && t.side !== shell.side);
    const hit = sweepShell(shell.prevPos, shell.pos, state.obstacles, config.arenaHalfSize, targets, config.tankRadius);
    if (hit && hit.kind === 'tank') {
      const target = /** @type {Tank} */ (targets.find((t) => t.id === hit.id));
      applyHit(state, target, config);
    } else if (hit) {
      const at = { x: shell.prevPos.x + (shell.pos.x - shell.prevPos.x) * hit.t, z: shell.prevPos.z + (shell.pos.z - shell.prevPos.z) * hit.t };
      state.events.push({ type: 'shell-blocked', tick: state.tick, shellId: shell.id, ownerId: shell.ownerId, pos: at });
    } else if (--shell.ticksLeft > 0) {
      state.shells.push(shell);
    }
  }
}
