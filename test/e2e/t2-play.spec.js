// T2: whole-game scenarios on a fixed seed (TEST_STRATEGY.md 10.1: E2E-05,
// E2E-06, E2E-09, E2E-11, E2E-14, E2E-15, E2E-16, E2E-20, E2E-21, E2E-26).
// The enemy is deterministic for a seed, so these runs repeat exactly; a
// scripted player (support.js killEnemy) shoots with the keyboard only.
import { expect, test } from '@playwright/test';
import { aimAt, events, fitsWidth, focusedId, killEnemy, lastFrame, liveText, open, snap, startGame, visibleOverlays } from './support.js';

const BEST_KEY = 'wireframe-tanks:best-score';
const KILL_SEED = 3; // the first kill comes after about 12 s of play (probed)
const TWO_KILLS_SEED = 2; // 100 points after about 13 s of play and 200 after about 21 s (probed)
const BEHIND_SEED = 3; // idle, the enemy's first shot (tick 120) comes from 101 degrees to the left: out of view
const AHEAD_SEED = 12345; // idle, the enemy's first shot comes from 7 degrees to the left: in view

/** @param {any} s */
const me = (s) => s.tanks.find((/** @type {any} */ t) => t.side === 'player');

/**
 * Runs one frame at a time until the predicate holds on the snapshot.
 * @param {import('@playwright/test').Page} page @param {(s: any) => boolean} done @param {number} maxFrames
 * @param {(s: any) => void | Promise<void>} [each]
 */
async function frames(page, done, maxFrames, each) {
  for (let i = 0; i < maxFrames; i++) {
    await page.clock.runFor(16);
    const s = await snap(page);
    if (each) await each(s);
    if (done(s)) return s;
  }
  throw new Error(`condition not met in ${maxFrames} frames; screen ${(await snap(page)).screen}, tick ${(await snap(page)).tick}`);
}

/**
 * Runs game time in bigger slices until the predicate holds.
 * @param {import('@playwright/test').Page} page @param {(s: any) => boolean} done @param {number} maxMs
 */
async function runWhile(page, done, maxMs) {
  for (let t = 0; t < maxMs; t += 100) {
    await page.clock.runFor(100);
    const s = await snap(page);
    if (done(s)) return s;
  }
  throw new Error(`condition not met in ${maxMs} ms; screen ${(await snap(page)).screen}`);
}

test.describe('seeded kill run, muted', () => {
  test.setTimeout(240_000);

  test('E2E-05 kill, score, new enemy; E2E-15 visual pairs with sound off; E2E-20 live region; E2E-09, E2E-11', async ({ page }) => {
    const { errors, lateRequests } = await open(page, { seed: KILL_SEED });
    // E2E-20: every text the live region is given, in order.
    await page.evaluate(() => {
      const w = /** @type {any} */ (window);
      w.__announced = [];
      new MutationObserver(() => w.__announced.push(document.getElementById('wt-live')?.textContent)).observe(
        /** @type {Node} */ (document.getElementById('wt-live')),
        { childList: true, characterData: true, subtree: true },
      );
    });

    // E2E-15: mute before starting, then play.
    await page.keyboard.press('KeyM');
    await page.clock.runFor(100);
    expect((await snap(page)).muted).toBe(true);
    await startGame(page);

    const tally = { spawn: 0, playerShot: 0, enemyShotOut: 0, enemyShotIn: 0, tankHit: 0, playerHit: 0 };
    let seen = 0;
    const strokeAlert = '10||#ff6b81';
    /** @param {any} s */
    const watch = async (s) => {
      const log = await events(page);
      const fresh = log.slice(seen);
      seen = log.length;
      if (fresh.length === 0) return;
      const frame = await lastFrame(page);
      const a = aimAt(s);
      for (const e of fresh) {
        if (e.type === 'enemy-spawned' && a && s.screen === 'playing') {
          // The marker and range appear, and SCANNING clears.
          expect(frame.texts.some((/** @type {string} */ t) => /^\d+ m$/.test(t)), 'spawn: range text').toBe(true);
          expect(frame.texts, 'spawn: SCANNING cleared').not.toContain('SCANNING');
          tally.spawn++;
        } else if (e.type === 'shot' && e.tankId === s.playerId) {
          // The crosshair goes to "cannot fire": dashed and dim, with no centre dot.
          expect(frame.strokes.some((/** @type {string} */ t) => t.startsWith('2|3,5|')), 'player shot: dashed crosshair').toBe(true);
          expect(frame.arcs, 'player shot: no ready dot').not.toContain(2.5);
          tally.playerShot++;
        } else if (e.type === 'shot' && a && s.screen === 'playing') {
          // Out of view: the edge chevron turns to the alert colour at 8 px (X6, AC-08.5).
          if (Math.abs(a.relDeg) > 40) {
            expect(frame.strokes, 'enemy shot out of view: chevron alert').toContain('8||#ff6b81');
            tally.enemyShotOut++;
          } else if (Math.abs(a.relDeg) < 25) {
            tally.enemyShotIn++; // in view: the shell itself is the cue, drawn with the enemy's line
          }
        } else if (e.type === 'tank-hit') {
          expect(frame.texts, 'kill: +100 banner').toContain('+100');
          expect(frame.texts, 'kill: enemy gone from the tape').toContain('SCANNING');
          tally.tankHit++;
        } else if (e.type === 'player-hit') {
          expect(s.view.hitFrame, 'hit: frame flag in the same snapshot').toBe(true);
          expect(frame.strokes, 'hit: alert frame drawn').toContain(strokeAlert);
          expect(frame.texts.some((/** @type {string} */ t) => t.startsWith('HIT') || t === 'DESTROYED'), 'hit: banner').toBe(true);
          tally.playerHit++;
        }
      }
    };

    const used = await killEnemy(page, { maxMs: 40_000, onSlice: watch });
    expect(used, 'the scripted player got a kill').not.toBeNull();
    let s = await snap(page);
    const killTick = s.tick;
    // AC-09.2, AC-07.1.
    expect(s.score).toBe(100);
    const kill = (await events(page)).find((/** @type {any} */ e) => e.type === 'tank-hit');
    expect(kill).toBeDefined();

    // AC-07.4: a new enemy appears 1.5 s (90 ticks) after the kill.
    await frames(page, (t) => t.tanks.some((/** @type {any} */ k) => k.side === 'enemy' && k.alive), 200, watch);
    const respawn = (await events(page)).filter((/** @type {any} */ e) => e.type === 'enemy-spawned' && e.tick >= kill.tick).at(0);
    expect(respawn.tick - kill.tick).toBeGreaterThanOrEqual(88);
    expect(respawn.tick - kill.tick).toBeLessThanOrEqual(92);
    s = await snap(page);
    expect(s.score).toBe(100);
    expect(s.tick).toBeGreaterThan(killTick);

    // The cues the run exercised (so a pass cannot hide a cue that never happened).
    test.info().annotations.push({ type: 'cues', description: JSON.stringify(tally) });
    expect(tally.spawn).toBeGreaterThanOrEqual(1);
    expect(tally.playerShot).toBeGreaterThanOrEqual(1);
    expect(tally.tankHit).toBe(1);
    expect(tally.playerHit).toBeGreaterThanOrEqual(1);

    // E2E-20: the live region held only the A11Y-13 strings, one per change of state.
    const announced = await page.evaluate(() => /** @type {any} */ (window).__announced);
    expect(announced[0]).toBe('Game started. 3 lives.');
    for (const text of announced) expect(text).toMatch(/^(Game started\. 3 lives\.|Hit\. \d lives? left\.|Enemy destroyed\. Score \d+\.|Game over\. Final score \d+\.|Paused\.)$/);
    const hits = (await events(page)).filter((/** @type {any} */ e) => e.type === 'player-hit').length;
    const kills = (await events(page)).filter((/** @type {any} */ e) => e.type === 'tank-hit').length;
    expect(announced.length).toBe(1 + hits + kills); // never per frame
    expect(announced.at(-1)).toBe('Enemy destroyed. Score 100.');
    expect(await liveText(page)).toBe('Enemy destroyed. Score 100.');

    // NFR-17: it was playable muted, and muted means no sound at all.
    expect((await snap(page)).muted).toBe(true);
    expect(await page.evaluate(() => /** @type {any} */ (window).__audio.sources)).toBe(0);

    // E2E-09, E2E-11.
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => /** @type {any} */ (window).__cspViolations)).toEqual([]);
    expect(lateRequests).toEqual([]);
  });
});

test.describe('E2E-15 the enemy fires (AC-08.5, X6)', () => {
  /**
   * Plays idle, muted, one frame at a time, until 30 ticks after the enemy's first shot.
   * @param {import('@playwright/test').Page} page @param {number} seed
   */
  async function firstEnemyShot(page, seed) {
    await open(page, { seed });
    await page.keyboard.press('KeyM');
    await startGame(page);
    /** @type {{ tick: number, strokes: string[], texts: string[] }[]} */
    const rows = [];
    /** @type {any} */
    let shot = null;
    await frames(
      page,
      (s) => shot !== null && s.tick > shot.tick + 30,
      400,
      async (s) => {
        if (!shot) shot = (await events(page)).find((/** @type {any} */ e) => e.type === 'shot' && e.tankId !== s.playerId) ?? null;
        const frame = await lastFrame(page);
        rows.push({ tick: s.tick, strokes: frame.strokes, texts: frame.texts });
      },
    );
    expect((await snap(page)).muted).toBe(true);
    return { rows, shot };
  }

  test('out of view: the edge chevron flashes alert-coloured at 8 px for 0.3 s, then returns', async ({ page }) => {
    const { rows, shot } = await firstEnemyShot(page, BEHIND_SEED);
    // The step that fires at tick T ends with the world at T + 1, which is the first frame to show the shot.
    const at = (/** @type {number} */ offset) => rows.find((r) => r.tick === shot.tick + 1 + offset);
    expect(rows.find((r) => r.tick === shot.tick - 5)?.strokes, 'chevron before the shot').toContain('4||#ffb547');
    for (const offset of [0, 1, 8, 16]) expect(at(offset)?.strokes, `tick +${offset}`).toContain('8||#ff6b81');
    for (const offset of [19, 22, 28]) {
      const row = at(offset);
      expect(row?.strokes, `tick +${offset}`).not.toContain('8||#ff6b81');
      expect(row?.strokes, `tick +${offset} chevron back to normal`).toContain('4||#ffb547');
    }
  });

  test('in view: no chevron, and the enemy shell is drawn in the enemy line (AC-08.5)', async ({ page }) => {
    const { rows, shot } = await firstEnemyShot(page, AHEAD_SEED);
    for (const r of rows.filter((row) => row.tick > shot.tick && row.tick <= shot.tick + 8)) {
      expect(r.strokes, `tick ${r.tick}`).not.toContain('8||#ff6b81');
      expect(r.strokes, `tick ${r.tick}`).not.toContain('4||#ffb547');
      expect(r.strokes, `tick ${r.tick}`).toContain('2||#ffb547');
    }
  });
});

test.describe('E2E-14 reduced motion', () => {
  test.setTimeout(120_000);
  /** @param {import('@playwright/test').Page} page */
  async function firstHit(page) {
    await open(page);
    await startGame(page);
    /** @type {{ tick: number, shake: number, hitFrame: boolean, alert: boolean }[]} */
    const rows = [];
    /** @type {number | null} */
    let hitTick = null;
    await frames(
      page,
      (s) => hitTick !== null && s.tick > hitTick + 40,
      600,
      async (s) => {
        if (hitTick === null) {
          const hit = (await events(page)).find((/** @type {any} */ e) => e.type === 'player-hit');
          if (hit) hitTick = hit.tick;
        }
        const frame = await lastFrame(page);
        rows.push({ tick: s.tick, shake: Math.hypot(s.view.shakeX, s.view.shakeY), hitFrame: s.view.hitFrame, alert: frame.strokes.includes('10||#ff6b81') });
      },
    );
    return { rows, hitTick: Number(hitTick) };
  }

  test.describe('with the setting', () => {
    test.use({ reducedMotion: 'reduce' });
    test('the hit shows the static frame and banner, and no shake (AC-14.3, NFR-16)', async ({ page }) => {
      const { rows, hitTick } = await firstHit(page);
      expect(rows.filter((r) => r.hitFrame).length).toBeGreaterThan(10);
      expect(rows.filter((r) => r.shake > 0)).toEqual([]);
      for (const r of rows) expect(r.alert, `tick ${r.tick}`).toBe(r.hitFrame);
      expect(hitTick).toBeGreaterThan(0);
    });
  });

  test.describe('without the setting', () => {
    test.use({ reducedMotion: 'no-preference' });
    test('the same hit shakes for 0.25 s at up to 6 px, and the frame lasts 0.4 s (AC-14.1, so the check above can fail)', async ({ page }) => {
      const { rows, hitTick } = await firstHit(page);
      const shaking = rows.filter((r) => r.shake > 0);
      expect(shaking.length).toBeGreaterThan(5);
      expect(Math.max(...rows.map((r) => r.shake))).toBeLessThanOrEqual(6 * Math.SQRT2 + 0.01);
      expect(Math.max(...rows.map((r) => r.shake))).toBeGreaterThan(1);
      expect(shaking.every((r) => r.tick >= hitTick && r.tick < hitTick + 15)).toBe(true); // K-28: 15 ticks
      const flagged = rows.filter((r) => r.hitFrame);
      expect(flagged.every((r) => r.tick >= hitTick && r.tick < hitTick + 24)).toBe(true); // K-23: 24 ticks
      expect(flagged.at(-1)?.tick).toBeGreaterThanOrEqual(hitTick + 22);
      for (const r of rows) expect(r.alert, `tick ${r.tick}`).toBe(r.hitFrame);
    });
  });
});

test.describe('idle game to Game over, best score 100', () => {
  test.setTimeout(240_000);

  test('E2E-06 respawn, destroyed, lockout, restart; E2E-16 privacy; E2E-21 reflow; E2E-09, E2E-11', async ({ page, context }) => {
    const { errors, lateRequests, requests } = await open(page, { best: 100 });
    await startGame(page);
    const pid = (await snap(page)).playerId;

    // First hit: respawn after 2.0 s, with the HIT banner for the whole delay (AC-09.3, AC-14.4).
    const hit = await frames(page, (s) => s.screen === 'respawning', 700);
    const hit1 = (await events(page)).filter((/** @type {any} */ e) => e.type === 'player-hit')[0];
    expect(hit.lives).toBe(2);
    expect(hit.timers.respawnAt - hit1.tick).toBe(120);
    await expect(page.locator('#wt-live')).toHaveText('Hit. 2 lives left.');
    let bannerFrames = 0;
    const back = await frames(page, (s) => s.screen === 'playing', 200, async (s) => {
      if (s.screen === 'respawning') {
        expect((await lastFrame(page)).texts, `tick ${s.tick}`).toContain('HIT · 2 LIVES LEFT');
        bannerFrames++;
      }
    });
    expect(bannerFrames).toBeGreaterThan(100);
    expect(Math.abs(back.tick - (hit1.tick + 120))).toBeLessThanOrEqual(1);
    expect(me(back).alive).toBe(true);
    expect(me(back).pos).toEqual({ x: 0, z: 0 }); // respawns at the start point (K-21)

    // Run on to the last hit: DESTROYED for 1.5 s, then Game over (AC-09.4, AC-14.5).
    await runWhile(page, (s) => s.lives === 1 && s.screen === 'respawning', 60_000);
    await runWhile(page, (s) => s.screen === 'playing', 10_000);
    await runWhile(page, (s) => s.screen === 'destroyed', 60_000);
    const hits = (await events(page)).filter((/** @type {any} */ e) => e.type === 'player-hit');
    expect(hits).toHaveLength(3);
    const destroyed = await snap(page);
    expect((await lastFrame(page)).texts).toContain('DESTROYED');
    const over = await frames(page, (s) => s.screen === 'gameover', 200, async (s) => {
      if (s.screen === 'destroyed') expect((await lastFrame(page)).texts).toContain('DESTROYED');
    });
    const gameOver = (await events(page)).find((/** @type {any} */ e) => e.type === 'game-over');
    expect(gameOver.tick - hits[2].tick).toBe(90); // K-27
    expect(destroyed.lives).toBe(0);

    // The Game over screen: score, best, and the 1 s lockout (AC-09.5, AC-15.2).
    expect(await visibleOverlays(page)).toEqual(['wt-gameover']);
    await expect(page.locator('#wt-over-score')).toHaveText(String(over.score));
    await expect(page.locator('#wt-over-best')).toHaveText('Best 100');
    await expect(page.locator('#wt-live')).toHaveText(`Game over. Final score ${over.score}.`);
    expect(over.timers.lockoutUntil - over.tick).toBeGreaterThanOrEqual(58);
    await expect(page.locator('#wt-over-actions')).toBeHidden();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.clock.runFor(500);
    expect((await snap(page)).screen).toBe('gameover'); // both ignored during the lockout
    await page.clock.runFor(600);
    await expect(page.locator('#wt-over-actions')).toBeVisible();
    expect(await focusedId(page)).toBe('wt-again');
    for (const id of ['wt-again', 'wt-title']) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect([id, box && box.width >= 44 && box.height >= 44]).toEqual([id, true]); // A11Y-6
    }
    // A score below the stored best does not change it (BR-26, AC-15.1).
    expect(await page.evaluate((k) => localStorage.getItem(k), BEST_KEY)).toBe('100');

    // E2E-21: no horizontal scrolling at 320 px wide, and at 640 px (200% zoom of a 1280 px window).
    for (const [width, height] of [[320, 568], [640, 400]]) {
      await page.setViewportSize({ width, height });
      await page.clock.runFor(100);
      const fit = await fitsWidth(page, 'wt-gameover');
      expect(fit.wide, `elements outside the window at ${width} px`).toEqual([]);
      expect(fit.pageOverflow, `page overflows at ${width} px`).toBeLessThanOrEqual(0);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.clock.runFor(100);

    // Esc goes to Start, which shows the stored best (AC-09.8, AC-15.2).
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
    expect(await visibleOverlays(page)).toEqual(['wt-start']);
    await expect(page.locator('#wt-start-best')).toHaveText('Best score 100');
    await page.keyboard.press('Enter');
    await page.clock.runFor(100);
    const fresh = await snap(page);
    expect([fresh.screen, fresh.score, fresh.lives]).toEqual(['playing', 0, 3]);
    expect(fresh.playerId).toBe(pid);

    // E2E-16 privacy and storage (NFR-19, SEC-21).
    expect(await context.cookies()).toEqual([]);
    const stored = await page.evaluate(async () => ({
      cookie: document.cookie,
      local: Object.keys(localStorage),
      session: sessionStorage.length,
      databases: indexedDB.databases ? (await indexedDB.databases()).length : 0,
      caches: typeof caches === 'undefined' ? 0 : (await caches.keys()).length,
      workers: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    }));
    expect(stored).toEqual({ cookie: '', local: [BEST_KEY], session: 0, databases: 0, caches: 0, workers: 0 });

    // E2E-09, E2E-11, E2E-13: nothing after load, nothing outside the sub-path, nothing failing.
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => /** @type {any} */ (window).__cspViolations)).toEqual([]);
    expect(lateRequests).toEqual([]);
    expect(requests.length).toBeGreaterThan(5);
  });
});

test.describe('E2E-26 Quit to title', () => {
  test.setTimeout(300_000);
  test('with a best of 100, a game that reaches 200 and is quit leaves the best at 100 (AC-10.8, BR-26)', async ({ page }) => {
    await open(page, { seed: TWO_KILLS_SEED, best: 100 });
    await startGame(page);
    expect(await killEnemy(page, { maxMs: 60_000 })).not.toBeNull();
    await page.clock.runFor(2000); // let the next enemy arrive
    expect(await killEnemy(page, { maxMs: 60_000 })).not.toBeNull();
    const s = await snap(page);
    expect(s.score).toBe(200);
    expect(['playing', 'respawning']).toContain(s.screen);

    await page.keyboard.press('KeyP');
    await page.clock.runFor(100);
    expect((await snap(page)).screen).toBe('paused');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('wt-quit');
    await page.keyboard.press('Space');
    await page.clock.runFor(100);
    expect(await visibleOverlays(page)).toEqual(['wt-start']);
    expect(await page.evaluate((k) => localStorage.getItem(k), BEST_KEY)).toBe('100');
    await expect(page.locator('#wt-start-best')).toHaveText('Best score 100');
    expect((await snap(page)).score).toBe(0);
  });
});
