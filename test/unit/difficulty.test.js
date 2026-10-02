// UT-DIFF: the level formula and the difficulty values an enemy gets at spawn.
// The table itself is checked in config.test.js.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../../site/src/core/config.js';
import { applyHit, difficultyFor, levelFor } from '../../site/src/core/rules.js';
import { step } from '../../site/src/core/sim.js';
import { enemies, eventsOf, input, playing, run, stepsFor } from './support.js';

test('BR-17 AC-13.1 AC-13.2 AC-13.3 level = min(K-19, 1 + floor(score / K-18))', () => {
  const cases = [[0, 1], [499, 1], [500, 2], [999, 2], [1000, 3], [1500, 4], [2000, 5], [2500, 5], [1_000_000, 5]];
  for (const [score, level] of cases) assert.equal(levelFor(score, CONFIG), level, `score ${score}`);
});

test('BR-17 difficultyFor returns the table row for the level', () => {
  for (const row of CONFIG.difficulty) assert.equal(difficultyFor(row.scoreFrom, CONFIG), row);
});

test('AC-13.1 a first enemy gets the level 1 turn rate, aim tolerance and reload', () => {
  const { enemy } = playing();
  const row = CONFIG.difficulty[0];
  assert.deepEqual(enemy.tuning, { level: 1, turnRateDeg: row.turnRateDeg, aimToleranceDeg: row.aimToleranceDeg, reloadTicks: stepsFor(row.reloadSeconds) });
});

test('AC-13.2 the kill that reaches 500 raises the level, and the next enemy uses level 2', () => {
  const { state, enemy } = playing();
  state.score = 400;
  applyHit(state, enemy, CONFIG);
  assert.equal(state.level, 2);
  assert.deepEqual(eventsOf(state, 'level-up').map((e) => e.level), [2]);
  run(state, input(), stepsFor(CONFIG.enemyRespawnSeconds) + 1);
  assert.equal(enemies(state)[0].tuning?.level, 2);
});

test('AC-13.4 BR-17 an enemy keeps its spawn-time values when the level changes', () => {
  const { state, enemy } = playing();
  const before = { ...enemy.tuning };
  state.score = 1500;
  step(state, input());
  assert.deepEqual(enemy.tuning, before);
});

test('a kill that does not cross a level boundary raises no level-up event', () => {
  const { state, enemy } = playing();
  applyHit(state, enemy, CONFIG);
  assert.equal(state.level, 1);
  assert.equal(eventsOf(state, 'level-up').length, 0);
});
