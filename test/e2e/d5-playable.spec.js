// D5 first-playable end-to-end pass (TEST_STRATEGY.md 3.2). Covers the
// overlay flow Start → play → pause/resume → game over → Play again, plus
// the Error (E2E-24) and Keyboard needed (E2E-23) overlays, against the IDs
// in index.html. Game time is driven by page.clock.runFor (spike T1 rule 1).
import { expect, test } from '@playwright/test';
import { focusedId, open, runUntil, snap, visibleOverlays } from './support.js';

test.describe('D5 overlay flow', () => {
  test.setTimeout(240_000);

  test('Start → play → pause/resume → quit → game over → Play again → Title', async ({ page }) => {
    const { errors, lateRequests } = await open(page);
    await page.evaluate(() => {
      /** @type {any} */ (window).__noReload = true;
    });

    // Start screen (AC-01.1, AC-01.2, A11Y-4).
    expect(await visibleOverlays(page)).toEqual(['wt-start']);
    await expect(page.locator('#wt-start-button')).toBeEnabled();
    await expect(page.locator('#wt-start-button')).toHaveText('Start game');
    expect(await focusedId(page)).toBe('wt-start-button');
    let s = await snap(page);
    expect(s.screen).toBe('start');
    expect(s.page).toBe('ready');

    // A non-start key does nothing (AC-01.3).
    await page.keyboard.press('KeyW');
    await page.clock.runFor(200);
    expect((await snap(page)).screen).toBe('start');

    // Enter starts a game.
    await page.keyboard.press('Enter');
    await page.clock.runFor(200);
    s = await snap(page);
    expect(s.screen).toBe('playing');
    expect(s.score).toBe(0);
    expect(s.lives).toBe(3);
    expect(await visibleOverlays(page)).toEqual([]);
    expect(await focusedId(page)).toBe('wt-game');
    await expect(page.locator('#wt-live')).toHaveText('Game started. 3 lives.');

    // Drive and fire.
    const tickA = s.tick;
    await page.keyboard.down('KeyW');
    await page.clock.runFor(500);
    await page.keyboard.up('KeyW');
    await page.keyboard.press('Space');
    await page.clock.runFor(100);
    s = await snap(page);
    expect(s.tick).toBeGreaterThan(tickA);
    const events = await page.evaluate(() => /** @type {any} */ (window).__WT_TEST__.events());
    expect(events.some((/** @type {any} */ e) => e.type === 'shot')).toBe(true);

    // P pauses; time is frozen; dialog has focus (AC-10.1, AC-10.5, AC-10.7).
    await page.keyboard.press('KeyP');
    await page.clock.runFor(100);
    s = await snap(page);
    expect(s.screen).toBe('paused');
    expect(await visibleOverlays(page)).toEqual(['wt-paused']);
    expect(await focusedId(page)).toBe('wt-paused');
    await expect(page.locator('#wt-live')).toHaveText('Paused.');
    await expect(page.locator('#wt-paused-small')).toBeHidden();
    await expect(page.locator('#wt-resume')).toBeEnabled();
    const pausedTick = s.tick;
    await page.clock.runFor(2000);
    expect((await snap(page)).tick).toBe(pausedTick);

    // Game keys do nothing while paused (AC-10.6).
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await page.clock.runFor(100);
    expect((await snap(page)).screen).toBe('paused');

    // P resumes from the same state (AC-10.2).
    await page.keyboard.press('KeyP');
    await page.clock.runFor(100);
    s = await snap(page);
    expect(['playing', 'respawning']).toContain(s.screen);
    expect(s.tick).toBeGreaterThan(pausedTick);
    expect(await visibleOverlays(page)).toEqual([]);
    expect(await focusedId(page)).toBe('wt-game');

    // Esc pauses, the Resume button resumes.
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
    expect((await snap(page)).screen).toBe('paused');
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('wt-resume');
    await page.keyboard.press('Space');
    await page.clock.runFor(100);
    // An enemy hit during play can leave the player respawning, which is in play too.
    expect(['playing', 'respawning']).toContain((await snap(page)).screen);

    // Quit to title from the pause dialog (AC-10.8).
    await page.keyboard.press('KeyP');
    await page.clock.runFor(100);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('wt-quit');
    await page.keyboard.press('Space');
    await page.clock.runFor(100);
    expect((await snap(page)).screen).toBe('start');
    expect(await visibleOverlays(page)).toEqual(['wt-start']);
    expect(await focusedId(page)).toBe('wt-start-button');

    // Start again with the button, then sit idle until Game over.
    expect(await focusedId(page)).toBe('wt-start-button');
    await page.keyboard.press('Space');
    await page.clock.runFor(100);
    expect((await snap(page)).screen).toBe('playing');
    const idleMs = await runUntil(page, 'gameover', 60_000);
    test.info().annotations.push({ type: 'idle-to-gameover', description: `${idleMs} ms game time (sampled every 500 ms)` });

    // Game over: score shown, actions hidden during the 1 s lockout (AC-09.4, AC-09.5).
    s = await snap(page);
    expect(s.lives).toBe(0);
    expect(await visibleOverlays(page)).toEqual(['wt-gameover']);
    await expect(page.locator('#wt-over-score')).toHaveText(String(s.score));
    await expect(page.locator('#wt-live')).toHaveText(`Game over. Final score ${s.score}.`);
    const lockedNow = s.timers.lockoutUntil - s.tick > 10; // > 10 ticks left, so 50 ms cannot cross it
    if (lockedNow) {
      await expect(page.locator('#wt-over-actions')).toBeHidden();
      await page.keyboard.press('Enter');
      await page.clock.runFor(50);
      expect((await snap(page)).screen).toBe('gameover');
    }
    await page.clock.runFor(1100);
    await expect(page.locator('#wt-over-actions')).toBeVisible();
    expect(await focusedId(page)).toBe('wt-again');

    // Play again restarts with score and lives reset, no reload (AC-09.6).
    await page.keyboard.press('Space');
    await page.clock.runFor(100);
    s = await snap(page);
    expect(s.screen).toBe('playing');
    expect(s.score).toBe(0);
    expect(s.lives).toBe(3);
    expect(await page.evaluate(() => /** @type {any} */ (window).__noReload)).toBe(true);
    await expect(page.locator('#wt-live')).toHaveText('Game started. 3 lives.');

    // Second game over, then the Title screen button (AC-09.8).
    await runUntil(page, 'gameover', 60_000);
    await page.clock.runFor(1100);
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('wt-title');
    await page.keyboard.press('Space');
    await page.clock.runFor(100);
    expect((await snap(page)).screen).toBe('start');
    expect(await visibleOverlays(page)).toEqual(['wt-start']);

    // Enter on Game over restarts; Esc on Game over goes to title.
    await page.keyboard.press('Enter');
    await page.clock.runFor(100);
    await runUntil(page, 'gameover', 60_000);
    await page.clock.runFor(1100);
    await page.keyboard.press('Enter');
    await page.clock.runFor(100);
    expect((await snap(page)).screen).toBe('playing');
    await runUntil(page, 'gameover', 60_000);
    await page.clock.runFor(1100);
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
    expect((await snap(page)).screen).toBe('start');

    // E2E-09, E2E-11.
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => /** @type {any} */ (window).__cspViolations)).toEqual([]);
    expect(lateRequests).toEqual([]);
  });

  test('E2E-24 Error overlay: a frame error stops the loop and Reload reloads', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter');
    await page.clock.runFor(200);
    expect((await snap(page)).screen).toBe('playing');

    await page.evaluate(() => {
      /** @type {any} */ (window).__wtBoom = true;
    });
    await page.clock.runFor(200);

    expect(await visibleOverlays(page)).toEqual(['wt-error']);
    await expect(page.locator('#wt-error-title')).toHaveText('Something went wrong');
    await expect(page.locator('#wt-error-body')).toHaveText('The game stopped unexpectedly. Reload the page to play again.');
    expect(await focusedId(page)).toBe('wt-reload');
    // The detail reaches the console. Firefox prints an Error object as just "Error".
    expect(errors.length).toBeGreaterThan(0);

    // No stack trace or file path on screen.
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/E2E-24 injected|\.js|at \w+ \(|https?:\/\//);

    // The loop has stopped: the hook's snapshot no longer advances.
    const tick = (await snap(page)).tick;
    await page.evaluate(() => {
      /** @type {any} */ (window).__wtBoom = false;
    });
    await page.clock.runFor(1000);
    expect((await snap(page)).tick).toBe(tick);

    // Game keys are ignored on the Error page. (Enter and Space would
    // activate the focused Reload button, which is correct.)
    await page.keyboard.press('KeyP');
    await page.keyboard.press('Escape');
    await page.keyboard.press('KeyW');
    await page.clock.runFor(100);
    expect((await snap(page)).tick).toBe(tick);
    expect(await visibleOverlays(page)).toEqual(['wt-error']);

    // Reload reloads the page.
    await page.evaluate(() => {
      /** @type {any} */ (window).__beforeReload = true;
    });
    await Promise.all([page.waitForEvent('load'), page.keyboard.press('Space')]);
    await page.clock.runFor(200);
    expect(await page.evaluate(() => /** @type {any} */ (window).__beforeReload ?? false)).toBe(false);
    expect(await visibleOverlays(page)).toEqual(['wt-start']);
  });
});

test.describe('E2E-23 Keyboard needed overlay', () => {
  /** @param {import('@playwright/test').Page} page */
  async function expectKeyboardThenStart(page) {
    expect(await visibleOverlays(page)).toEqual(['wt-keyboard']);
    expect(await focusedId(page)).toBe('wt-keyboard-button');
    expect((await snap(page)).page).toBe('keyboard');
    // Enter does not start a game behind the overlay.
    await page.keyboard.press('KeyW');
    await page.clock.runFor(100);
    expect((await snap(page)).screen).toBe('start');
    await page.keyboard.press('Enter'); // activates the focused Play anyway button
    await page.clock.runFor(200);
    expect(await visibleOverlays(page)).toEqual(['wt-start']);
    await expect(page.locator('#wt-start-button')).toBeEnabled();
    expect(await focusedId(page)).toBe('wt-start-button');
    expect((await snap(page)).screen).toBe('start');
  }

  test.describe('touch-only device', () => {
    test.use({ hasTouch: true });
    test('shows Keyboard needed, Play anyway shows Start', async ({ page }) => {
      const { errors } = await open(page);
      await expectKeyboardThenStart(page);
      expect(errors).toEqual([]);
    });
  });

  test.describe('600 × 380 window', () => {
    test.use({ viewport: { width: 600, height: 380 } });
    test('shows Keyboard needed, Play anyway shows Start', async ({ page }) => {
      const { errors } = await open(page);
      await expectKeyboardThenStart(page);
      expect(errors).toEqual([]);
    });
  });

  test('never shows with a fine pointer and a large window', async ({ page }) => {
    await open(page);
    expect(await visibleOverlays(page)).toEqual(['wt-start']);
    expect((await snap(page)).page).toBe('ready');
  });
});

test('E2E-12 test hook is inert without __WT_TEST__, frozen with it', async ({ page }) => {
  await open(page, { hook: false });
  expect(await page.evaluate(() => typeof (/** @type {any} */ (window).__WT_TEST__))).toBe('undefined');
  const page2 = await page.context().newPage();
  await open(page2);
  const frozen = await page2.evaluate(() => {
    const s = /** @type {any} */ (window).__WT_TEST__.snapshot();
    let threw = false;
    try {
      'use strict';
      s.score = 999;
    } catch {
      threw = true;
    }
    return { frozen: Object.isFrozen(s), score: s.score, threw };
  });
  expect(frozen.frozen).toBe(true);
  expect(frozen.score).toBe(0);
});
