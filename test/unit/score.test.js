// UT-SCORE: score, lives, respawn timers, game over and the new-game reset.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../../site/src/core/config.js';
import { distance } from '../../site/src/core/math.js';
import { applyHit, newGame } from '../../site/src/core/rules.js';
import { step } from '../../site/src/core/sim.js';
import { createWorld } from '../../site/src/core/world.js';
import { enemies, eventsOf, input, player, playing, run, shellAtPlayer, stepsFor } from './support.js';

const idle = input();

test('AC-09.1 BR-19 a new game has score 0, lives K-08, level 1, the player at K-21, no shells and one enemy', () => {
  const { state } = playing();
  // Dirty every field a game changes, then start again.
  state.score = 700;
  state.lives = 1;
  state.level = 2;
  player(state).pos = { x: 30, z: -10 };
  player(state).heading = 1;
  player(state).alive = false;
  player(state).reload = 9;
  shellAtPlayer(state);
  state.events.length = 0;
  newGame(state, CONFIG);
  assert.equal(state.screen, 'playing');
  assert.equal(state.score, 0);
  assert.equal(state.lives, CONFIG.startingLives);
  assert.equal(state.level, 1);
  const p = player(state);
  assert.deepEqual(p.pos, { x: CONFIG.playerSpawn.x, z: CONFIG.playerSpawn.z });
  assert.deepEqual(p.prevPos, p.pos);
  assert.equal(p.heading, 0);
  assert.equal(p.alive, true);
  assert.equal(p.reload, 0);
  assert.deepEqual(state.shells, []);
  assert.equal(enemies(state).length, 1);
  assert.equal(eventsOf(state, 'enemy-spawned').length, 1);
});

test('AC-09.2 BR-11 a kill adds exactly K-09 points in the same step', () => {
  const { state, enemy } = playing();
  applyHit(state, enemy, CONFIG);
  assert.equal(state.score, CONFIG.pointsPerKill);
  assert.equal(enemies(state).length, 0);
});

test('BR-11 a death never takes points away', () => {
  const { state, enemy } = playing();
  applyHit(state, enemy, CONFIG);
  shellAtPlayer(state);
  step(state, idle);
  assert.equal(state.score, CONFIG.pointsPerKill);
});

test('BR-12 each death removes one life, and lives never go below 0', () => {
  const { state } = playing();
  applyHit(state, player(state), CONFIG);
  assert.equal(state.lives, CONFIG.startingLives - 1);
  player(state).alive = true;
  state.lives = 0;
  applyHit(state, player(state), CONFIG);
  assert.equal(state.lives, 0);
});

test('AC-09.3 BR-13 a death with lives left shows Respawning for K-13, then the player is back at K-21 with a new enemy', () => {
  const { state, enemy } = playing();
  player(state).pos = { x: 20, z: -20 };
  player(state).heading = 2;
  shellAtPlayer(state);
  step(state, idle);
  assert.equal(state.screen, 'respawning');
  assert.equal(state.lives, CONFIG.startingLives - 1);
  assert.deepEqual(eventsOf(state, 'player-hit').map((e) => e.livesLeft), [CONFIG.startingLives - 1]);
  run(state, idle, stepsFor(CONFIG.playerRespawnSeconds) - 1);
  assert.equal(state.screen, 'respawning');
  assert.equal(player(state).alive, false);
  step(state, idle);
  assert.equal(state.screen, 'playing');
  const p = player(state);
  assert.equal(p.alive, true);
  assert.deepEqual(p.pos, { x: 0, z: 0 });
  assert.deepEqual(p.prevPos, p.pos, 'no interpolation streak from the death spot');
  assert.equal(p.heading, 0);
  assert.equal(p.prevHeading, 0);
  const now = enemies(state);
  assert.equal(now.length, 1);
  assert.notEqual(now[0].id, enemy.id, 'the old enemy is removed and a new one spawned');
  const d = distance(now[0].pos, p.pos);
  assert.ok(d >= CONFIG.enemySpawnDistanceMin && d <= CONFIG.enemySpawnDistanceMax, `spawned ${d} u away`);
});

test('BR-13 while Respawning, player input other than pause and mute is ignored', () => {
  const { state } = playing();
  shellAtPlayer(state);
  step(state, idle);
  run(state, input({ throttle: 1, turn: 1, firePressed: true }), 30);
  assert.deepEqual(player(state).pos, { x: 0, z: 0 });
  assert.deepEqual(state.shells, []);
});

test('AC-09.4 BR-13 losing the last life shows Destroyed for K-27, then Game over with the final score', () => {
  const { state, enemy } = playing();
  applyHit(state, enemy, CONFIG);
  state.lives = 1;
  shellAtPlayer(state);
  step(state, idle);
  assert.equal(state.screen, 'destroyed');
  assert.equal(state.lives, 0);
  const destroyedSteps = stepsFor(CONFIG.gameOverDelaySeconds);
  run(state, idle, destroyedSteps - 1);
  assert.equal(state.screen, 'destroyed');
  step(state, idle);
  assert.equal(state.screen, 'gameover');
  assert.deepEqual(eventsOf(state, 'game-over').map((e) => e.score), [CONFIG.pointsPerKill]);
});

test('BR-13 no enemy spawns while the player is dead', () => {
  const { state, enemy } = playing();
  applyHit(state, enemy, CONFIG);
  shellAtPlayer(state);
  step(state, idle);
  run(state, idle, stepsFor(CONFIG.playerRespawnSeconds) - 1);
  assert.equal(enemies(state).length, 0, 'the K-14 delay ended during Respawning, but nothing spawned');
});

test('a game with no screen to run does not step: the Start screen holds still', () => {
  const state = createWorld(1, CONFIG);
  run(state, input({ throttle: 1, firePressed: true }), 10);
  assert.equal(state.tick, 0);
  assert.deepEqual(player(state).pos, { x: 0, z: 0 });
  assert.deepEqual(state.shells, []);
});
