// Every tunable number in one frozen object (ARCHITECTURE.md 4.1).
// K-numbers are the constants of REQUIREMENTS.md section 3, which owns the
// values. A change here updates that table in the same commit.

/** @typedef {{ type: 'circle', radius: number } | { type: 'rect', halfLength: number, halfWidth: number }} Footprint */
/** @typedef {'pillar' | 'wall' | 'hedgehog'} ObstacleModel */
/** @typedef {{ model: ObstacleModel, x: number, z: number, yawDeg: number }} ObstaclePlacement */
/** @typedef {{ level: number, scoreFrom: number, turnRateDeg: number, aimToleranceDeg: number, reloadSeconds: number }} DifficultyRow */

/**
 * @template T
 * @param {T} value
 * @returns {Readonly<T>}
 */
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const stepSeconds = 1 / 60; // K-15
const maxFrameSeconds = 0.25; // K-16

export const CONFIG = deepFreeze({
  // Arena and movement
  arenaHalfSize: 250, // K-01, u; the arena is 500 x 500 u, centred on the origin
  playerForwardSpeed: 12, // K-02, u/s
  playerReverseSpeed: 6, // K-03, u/s
  playerTurnRateDeg: 90, // K-04, degrees/s
  tankRadius: 3, // K-07, u; hit and collision radius
  enemyDriveSpeed: 8, // K-20, u/s
  playerSpawn: { x: 0, z: 0, headingDeg: 0 }, // K-21
  spawnClearRadius: 20, // K-22, u

  // Shells
  shellSpeed: 80, // K-05, u/s
  shellRange: 200, // K-06, u
  playerReloadSeconds: 0.5, // K-26
  muzzleDistance: 3.5, // u from the tank centre, outside K-07 (BR-07)

  // Score, lives and enemies
  startingLives: 3, // K-08
  pointsPerKill: 100, // K-09
  enemySpawnDistanceMin: 80, // K-10, u
  enemySpawnDistanceMax: 140, // K-11, u
  enemyGraceSeconds: 2, // K-12
  playerRespawnSeconds: 2, // K-13
  enemyRespawnSeconds: 1.5, // K-14
  restartLockoutSeconds: 1, // K-17
  pointsPerLevel: 500, // K-18
  maxLevel: 5, // K-19
  maxEnemies: 1, // K-25; Phase 2 raises it (ADR 0004)
  gameOverDelaySeconds: 1.5, // K-27

  // Timing (ADR 0003)
  stepSeconds, // K-15
  stepMs: 1000 * stepSeconds,
  maxFrameSeconds, // K-16
  maxFrameMs: 1000 * maxFrameSeconds,
  maxStepsPerFrame: 5,

  // Feedback and screen
  hitFlashSeconds: 0.4, // K-23
  shakeSeconds: 0.25, // K-28
  shakeAmplitudePx: 6, // K-28
  minWindowWidth: 640, // K-29, CSS px
  minWindowHeight: 400, // K-29, CSS px
  enemyShotFlashMs: 300, // K-30
  pointsBannerSeconds: 1.0, // UX_SPEC.md 8.6 pointsBannerMs
  aimPulseSeconds: 0.5, // UX_SPEC.md 8.6 aimPulseMs: the aiming ring's full period
  nearPlane: 0.1, // u: segments are clipped here before projection (ARCHITECTURE.md 5.1)
  farDistance: 500, // u: objects further than this are culled before projection
  fovVerticalDeg: 40, // UX-D6
  eyeHeight: 2.2, // u, UX_SPEC.md 7.1
  shellHeight: 1.6, // u, UX_SPEC.md 7.1
  fencePostSpacing: 25, // u, UX_SPEC.md 7.4

  /** Enemy difficulty table (S3, BR-17). Each column only gets harder. */
  difficulty: /** @type {DifficultyRow[]} */ ([
    { level: 1, scoreFrom: 0, turnRateDeg: 45, aimToleranceDeg: 8, reloadSeconds: 4.0 },
    { level: 2, scoreFrom: 500, turnRateDeg: 55, aimToleranceDeg: 6.5, reloadSeconds: 3.5 },
    { level: 3, scoreFrom: 1000, turnRateDeg: 65, aimToleranceDeg: 5, reloadSeconds: 3.0 },
    { level: 4, scoreFrom: 1500, turnRateDeg: 75, aimToleranceDeg: 3.5, reloadSeconds: 2.5 },
    { level: 5, scoreFrom: 2000, turnRateDeg: 90, aimToleranceDeg: 2, reloadSeconds: 2.0 },
  ]),

  /** Hunter AI tuning (REQUIREMENTS.md 8.3 leaves these to the Developer). */
  hunter: {
    fireRange: 110, // u: Approach becomes Aim within this, with a clear line of sight
    aimHysteresis: 1.15, // Aim drops back to Approach beyond fireRange times this
    evadeSeconds: 1.0, // time spent in Evade
    evadeCooldownSeconds: 3.0, // no new Evade for this long after one starts
    playerAimDeg: 4, // the player counts as aiming at the enemy within this
    lookAhead: 16, // u: obstacle probes reach this far along a candidate heading
    probeStep: 4, // u between probe points
    probeMargin: 0.5, // u of extra clearance the probes ask for
    stuckSeconds: 1.0, // progress is checked this often
    stuckDistance: 2, // u: less movement than this in one check counts as stuck
    recoverSeconds: 0.6, // time spent reversing when stuck
  },

  /** Obstacle footprints on the ground (UX_SPEC.md 7.3). A wall's length runs along its model x axis. */
  footprints: /** @type {Record<ObstacleModel, Footprint>} */ ({
    pillar: { type: 'circle', radius: 2.5 },
    hedgehog: { type: 'circle', radius: 1.9 },
    wall: { type: 'rect', halfLength: 6, halfWidth: 0.5 },
  }),

  obstacleCount: 12, // K-24
  /** The fixed obstacle layout (BR-06, UX_SPEC.md 7.5). Yaw in degrees clockwise from above. */
  obstacleLayout: /** @type {ObstaclePlacement[]} */ ([
    { model: 'pillar', x: 0, z: 45, yawDeg: 0 },
    { model: 'hedgehog', x: -30, z: 25, yawDeg: 20 },
    { model: 'wall', x: 40, z: 20, yawDeg: 60 },
    { model: 'hedgehog', x: 25, z: -40, yawDeg: 45 },
    { model: 'pillar', x: -55, z: -30, yawDeg: 0 },
    { model: 'wall', x: -20, z: -70, yawDeg: 0 },
    { model: 'pillar', x: 80, z: 90, yawDeg: 0 },
    { model: 'hedgehog', x: -90, z: 80, yawDeg: 10 },
    { model: 'wall', x: 110, z: -60, yawDeg: 90 },
    { model: 'pillar', x: -120, z: -110, yawDeg: 0 },
    { model: 'wall', x: -140, z: 20, yawDeg: 30 },
    { model: 'hedgehog', x: 150, z: 160, yawDeg: 70 },
  ]),
});

/** @typedef {typeof CONFIG} Config */
