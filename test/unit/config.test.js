// UT-CONFIG: the constants of REQUIREMENTS.md section 3 and the obstacle
// layout of UX_SPEC.md section 7.5.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../../site/src/core/config.js';

test('K-01 to K-30 have the REQUIREMENTS.md section 3 defaults', () => {
  const expected = {
    arenaHalfSize: 250, // K-01
    playerForwardSpeed: 12, // K-02
    playerReverseSpeed: 6, // K-03
    playerTurnRateDeg: 90, // K-04
    shellSpeed: 80, // K-05
    shellRange: 200, // K-06
    tankRadius: 3, // K-07
    startingLives: 3, // K-08
    pointsPerKill: 100, // K-09
    enemySpawnDistanceMin: 80, // K-10
    enemySpawnDistanceMax: 140, // K-11
    enemyGraceSeconds: 2, // K-12
    playerRespawnSeconds: 2, // K-13
    enemyRespawnSeconds: 1.5, // K-14
    stepSeconds: 1 / 60, // K-15
    maxFrameSeconds: 0.25, // K-16
    restartLockoutSeconds: 1, // K-17
    pointsPerLevel: 500, // K-18
    maxLevel: 5, // K-19
    enemyDriveSpeed: 8, // K-20
    spawnClearRadius: 20, // K-22
    hitFlashSeconds: 0.4, // K-23
    obstacleCount: 12, // K-24
    maxEnemies: 1, // K-25
    playerReloadSeconds: 0.5, // K-26
    gameOverDelaySeconds: 1.5, // K-27
    shakeSeconds: 0.25, // K-28
    shakeAmplitudePx: 6, // K-28
    minWindowWidth: 640, // K-29
    minWindowHeight: 400, // K-29
    enemyShotFlashMs: 300, // K-30
  };
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(CONFIG[/** @type {keyof typeof CONFIG} */ (key)], value, key);
  }
  assert.deepEqual(CONFIG.playerSpawn, { x: 0, z: 0, headingDeg: 0 }); // K-21
});

test('the loop limits follow ADR 0003 and the camera follows UX-D6', () => {
  assert.equal(CONFIG.stepMs, 1000 / 60);
  assert.equal(CONFIG.maxFrameMs, 250);
  assert.equal(CONFIG.maxStepsPerFrame, 5);
  assert.equal(CONFIG.fovVerticalDeg, 40);
});

test('UT-DIFF the difficulty table matches REQUIREMENTS.md section 3', () => {
  assert.deepEqual(
    CONFIG.difficulty.map((row) => [row.level, row.scoreFrom, row.turnRateDeg, row.aimToleranceDeg, row.reloadSeconds]),
    [
      [1, 0, 45, 8, 4.0],
      [2, 500, 55, 6.5, 3.5],
      [3, 1000, 65, 5, 3.0],
      [4, 1500, 75, 3.5, 2.5],
      [5, 2000, 90, 2, 2.0],
    ],
  );
  assert.equal(CONFIG.difficulty.length, CONFIG.maxLevel);
});

test('UT-DIFF every difficulty column gets harder or stays the same, never easier', () => {
  const rows = CONFIG.difficulty;
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].turnRateDeg >= rows[i - 1].turnRateDeg, `turn rate at level ${i + 1}`);
    assert.ok(rows[i].aimToleranceDeg <= rows[i - 1].aimToleranceDeg, `aim tolerance at level ${i + 1}`);
    assert.ok(rows[i].reloadSeconds <= rows[i - 1].reloadSeconds, `reload at level ${i + 1}`);
    assert.equal(rows[i].scoreFrom, rows[i - 1].scoreFrom + CONFIG.pointsPerLevel);
  }
});

test('the footprints follow UX_SPEC.md section 7.3', () => {
  assert.deepEqual(CONFIG.footprints, {
    pillar: { type: 'circle', radius: 2.5 },
    hedgehog: { type: 'circle', radius: 1.9 },
    wall: { type: 'rect', halfLength: 6, halfWidth: 0.5 },
  });
});

test('the obstacle layout is UX_SPEC.md section 7.5 exactly', () => {
  assert.deepEqual(
    CONFIG.obstacleLayout.map((o) => [o.model, o.x, o.z, o.yawDeg]),
    [
      ['pillar', 0, 45, 0],
      ['hedgehog', -30, 25, 20],
      ['wall', 40, 20, 60],
      ['hedgehog', 25, -40, 45],
      ['pillar', -55, -30, 0],
      ['wall', -20, -70, 0],
      ['pillar', 80, 90, 0],
      ['hedgehog', -90, 80, 10],
      ['wall', 110, -60, 90],
      ['pillar', -120, -110, 0],
      ['wall', -140, 20, 30],
      ['hedgehog', 150, 160, 70],
    ],
  );
  assert.equal(CONFIG.obstacleLayout.length, CONFIG.obstacleCount);
});

test('CONFIG is deeply frozen', () => {
  assert.ok(Object.isFrozen(CONFIG));
  assert.ok(Object.isFrozen(CONFIG.difficulty));
  assert.ok(Object.isFrozen(CONFIG.difficulty[0]));
  assert.ok(Object.isFrozen(CONFIG.obstacleLayout[0]));
  assert.ok(Object.isFrozen(CONFIG.footprints.wall));
  assert.ok(Object.isFrozen(CONFIG.playerSpawn));
  assert.throws(() => {
    'use strict';
    /** @type {any} */ (CONFIG).arenaHalfSize = 1;
  }, TypeError);
});
