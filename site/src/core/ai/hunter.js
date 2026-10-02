// The hunter: the MVP's one enemy kind (REQUIREMENTS.md 8.3, research §7).
// A state machine of Spawn, Approach, Aim and Evade, with seek and obstacle
// avoidance for steering. It only produces an intent; sim.js moves and fires
// every tank under the same rules, and tryFire enforces grace, reload and aim
// tolerance itself, so the hunter cannot cheat by asking (ADR 0004).

import { isClear, sweepShell } from '../collision.js';
import { clamp, degToRad, distance, forward, wrapAngle } from '../math.js';

/** @typedef {import('../math.js').Vec2} Vec2 */
/** @typedef {import('../world.js').Tank} Tank */
/** @typedef {import('../sim.js').Intent} Intent */
/** @typedef {import('../sim.js').AiView} AiView */
/** @typedef {'spawn' | 'approach' | 'aim' | 'evade'} HunterState */
/** @typedef {{
 *   state: HunterState, ticks: number, evadeTurn: number, evadeCooldown: number,
 *   avoidSide: number, recover: number, progressTicks: number, anchor: Vec2 | null
 * }} HunterMemory */

/** Candidate heading offsets for obstacle avoidance, in degrees, nearest first. */
const OFFSETS_DEG = [20, 40, 60, 80, 100, 120, 140, 160, 180];

/** @returns {HunterMemory} */
export function createMemory() {
  return { state: 'spawn', ticks: 0, evadeTurn: 1, evadeCooldown: 0, avoidSide: 1, recover: 0, progressTicks: 0, anchor: null };
}

/**
 * One step of thinking for one hunter. Reads the world through `view`, keeps
 * its own state in `memory`, and draws any randomness from `random`, which
 * returns a seeded float in [0, 1).
 * @param {HunterMemory} memory @param {Tank} tank @param {AiView} view @param {() => number} random
 * @returns {Intent}
 */
export function think(memory, tank, view, random) {
  const h = view.config.hunter;
  const ticks = (/** @type {number} */ seconds) => Math.round(seconds / view.config.stepSeconds);
  memory.ticks += 1;
  if (memory.evadeCooldown > 0) memory.evadeCooldown -= 1;
  const player = view.player;
  if (!player) return { throttle: 0, turn: 0, fire: false };

  const range = distance(tank.pos, player.pos);
  const bearing = Math.atan2(player.pos.x - tank.pos.x, player.pos.z - tank.pos.z);
  const sight = lineOfSight(tank.pos, player.pos, view);
  const fromPlayer = Math.atan2(tank.pos.x - player.pos.x, tank.pos.z - player.pos.z);
  const playerAiming = sight && range <= view.config.shellRange && Math.abs(wrapAngle(fromPlayer - player.heading)) <= degToRad(h.playerAimDeg);

  /** @param {HunterState} next */
  const enter = (next) => {
    memory.state = next;
    memory.ticks = 0;
    if (next === 'evade') {
      memory.evadeTurn = random() < 0.5 ? -1 : 1;
      memory.evadeCooldown = ticks(h.evadeCooldownSeconds);
    }
  };

  if (memory.state === 'spawn') enter('approach');
  if (memory.state === 'aim') {
    if (view.ownShellInFlight) enter('evade'); // it has just fired
    else if (!sight || range > h.fireRange * h.aimHysteresis) enter('approach');
  } else if (memory.state === 'evade') {
    if (memory.ticks >= ticks(h.evadeSeconds)) enter('approach');
  }
  if (memory.state === 'approach') {
    if (playerAiming && memory.evadeCooldown === 0) enter('evade');
    else if (sight && range <= h.fireRange) enter('aim');
  }

  if (memory.state === 'aim') {
    const error = wrapAngle(bearing - tank.heading);
    const tolerance = degToRad(tank.tuning ? tank.tuning.aimToleranceDeg : 0);
    return { throttle: 0, turn: turnFor(error, tank, view), fire: Math.abs(error) <= tolerance };
  }

  const recovering = checkProgress(memory, tank, view, ticks);
  if (recovering) return { throttle: -1, turn: memory.avoidSide, fire: false };
  const goal = memory.state === 'evade' ? bearing + memory.evadeTurn * (Math.PI / 2) : bearing;
  const reach = memory.state === 'evade' ? h.lookAhead : Math.min(h.lookAhead, range);
  return steer(memory, tank, view, goal, reach);
}

/**
 * Turns towards a clear heading as near to `goal` as it can find, and drives
 * when it is roughly facing it (seek with obstacle avoidance).
 * @param {HunterMemory} memory @param {Tank} tank @param {AiView} view @param {number} goal @param {number} reach
 * @returns {Intent}
 */
function steer(memory, tank, view, goal, reach) {
  let heading = goal;
  if (!clearAhead(tank.pos, goal, reach, view)) {
    let found = false;
    for (const deg of OFFSETS_DEG) {
      for (const side of [memory.avoidSide, -memory.avoidSide]) {
        const candidate = goal + side * degToRad(deg);
        if (clearAhead(tank.pos, candidate, reach, view)) {
          heading = candidate;
          memory.avoidSide = side;
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (!found) return { throttle: -1, turn: memory.avoidSide, fire: false };
  }
  const error = wrapAngle(heading - tank.heading);
  const off = Math.abs(error);
  const throttle = off < Math.PI / 4 ? 1 : off < Math.PI / 2 ? 0.5 : 0;
  return { throttle, turn: turnFor(error, tank, view), fire: false };
}

/**
 * Every `stuckSeconds`, checks the tank has moved `stuckDistance`. If not, it
 * reverses for `recoverSeconds` and tries the other side next time.
 * @param {HunterMemory} memory @param {Tank} tank @param {AiView} view @param {(s: number) => number} ticks
 */
function checkProgress(memory, tank, view, ticks) {
  const h = view.config.hunter;
  if (memory.recover > 0) {
    memory.recover -= 1;
    return true;
  }
  memory.progressTicks += 1;
  if (memory.progressTicks < ticks(h.stuckSeconds)) return false;
  memory.progressTicks = 0;
  const stuck = memory.anchor !== null && distance(memory.anchor, tank.pos) < h.stuckDistance;
  memory.anchor = { x: tank.pos.x, z: tank.pos.z };
  if (!stuck) return false;
  memory.avoidSide = -memory.avoidSide;
  memory.recover = ticks(h.recoverSeconds) - 1;
  return true;
}

/**
 * Turn input that lands on the target heading without overshooting it.
 * @param {number} error @param {Tank} tank @param {AiView} view
 */
function turnFor(error, tank, view) {
  const rate = degToRad(tank.tuning ? tank.tuning.turnRateDeg : view.config.difficulty[0].turnRateDeg) * view.config.stepSeconds;
  return clamp(error / rate, -1, 1);
}

/**
 * True if probe points along `heading`, out to `reach`, all leave the tank clear.
 * @param {Vec2} from @param {number} heading @param {number} reach @param {AiView} view
 */
function clearAhead(from, heading, reach, view) {
  const h = view.config.hunter;
  const dir = forward(heading);
  const radius = view.config.tankRadius + h.probeMargin;
  for (let d = h.probeStep; d <= reach; d += h.probeStep) {
    const p = { x: from.x + dir.x * d, z: from.z + dir.z * d };
    if (!isClear(p, radius, view.obstacles, view.config.arenaHalfSize)) return false;
  }
  return true;
}

/**
 * True if no obstacle lies on the straight line between two points.
 * @param {Vec2} from @param {Vec2} to @param {AiView} view
 */
function lineOfSight(from, to, view) {
  return sweepShell(from, to, view.obstacles, view.config.arenaHalfSize, [], 0) === null;
}
