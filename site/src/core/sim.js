// One fixed step of the whole game (ARCHITECTURE.md 4.3, ADR 0003). Pure:
// no clock, no browser, no Math.random. Each call is one 1/60 s step.
//
// D1 skeleton: copy previous positions, clear events, move the player from
// its input under the shared movement and collision rules, advance the tick.
// Enemy intents (D3), firing, shells and rules (D2) slot in between.

import { resolveTankMove } from './collision.js';
import { CONFIG } from './config.js';
import { clamp, degToRad, forward, wrapAngle } from './math.js';

/** @typedef {import('./world.js').GameState} GameState */
/** @typedef {import('./world.js').Tank} Tank */
/** @typedef {import('./config.js').Config} Config */
/** @typedef {'start' | 'pause' | 'resume' | 'mute' | 'restart' | 'quit-to-title' | 'debug'} Command */
/** @typedef {{ throttle: number, turn: number, firePressed: boolean, commands: Command[] }} InputSnapshot */
/** @typedef {{ throttle: number, turn: number, fire: boolean }} Intent */
/** @typedef {{ forwardSpeed: number, reverseSpeed: number, turnRateDeg: number }} Drive */

/**
 * @param {GameState} state
 * @param {InputSnapshot} input
 * @param {Config} [config]
 */
export function step(state, input, config = CONFIG) {
  state.events.length = 0;
  for (const tank of state.tanks) {
    tank.prevPos = { x: tank.pos.x, z: tank.pos.z };
    tank.prevHeading = tank.heading;
  }

  const player = state.tanks.find((t) => t.id === state.playerId);
  if (player && player.alive) {
    const drive = { forwardSpeed: config.playerForwardSpeed, reverseSpeed: config.playerReverseSpeed, turnRateDeg: config.playerTurnRateDeg };
    moveTank(state, player, { throttle: input.throttle, turn: input.turn, fire: input.firePressed }, drive, config);
  }

  state.tick += 1;
}

/**
 * Turns, then drives, one tank for one step. The same rules for every tank,
 * so only the source of the intent differs between player and AI (ADR 0004).
 * @param {GameState} state @param {Tank} tank @param {Intent} intent @param {Drive} drive @param {Config} config
 */
export function moveTank(state, tank, intent, drive, config) {
  const dt = config.stepSeconds;
  const turn = clamp(intent.turn, -1, 1);
  const throttle = clamp(intent.throttle, -1, 1);
  tank.heading = wrapAngle(tank.heading + turn * degToRad(drive.turnRateDeg) * dt);
  if (throttle === 0) return;
  const speed = (throttle > 0 ? drive.forwardSpeed : drive.reverseSpeed) * throttle * dt;
  const dir = forward(tank.heading);
  const to = { x: tank.pos.x + dir.x * speed, z: tank.pos.z + dir.z * speed };
  const others = state.tanks.filter((t) => t !== tank && t.alive).map((t) => t.pos);
  tank.pos = resolveTankMove(tank.pos, to, config.tankRadius, state.obstacles, config.arenaHalfSize, others);
}
