// T2: A11Y-AXE (TEST_STRATEGY.md 3.4 and 10.6). axe-core runs on every HTML
// screen: Start, the game view, Pause, Game over, Keyboard needed and Error.
// The bar is zero serious or critical violations, on the WCAG 2.2 AA rules.
// axe uses timers, so the fake clock runs in real time while it works.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { inRealTime, open, runUntil, snap, startGame, visibleOverlays } from './support.js';

/**
 * Runs axe on the page as it is, and returns its violations, plus a count of
 * checks axe could not decide (reported, not failed).
 * @param {import('@playwright/test').Page} page
 */
async function axe(page) {
  const results = await inRealTime(page, () =>
    new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze(),
  );
  const summary = (/** @type {any[]} */ list) => list.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((/** @type {any} */ n) => n.target.join(' ')).join('; ')}`);
  test.info().annotations.push({ type: 'axe', description: `${results.passes.length} rules passed, ${results.incomplete.length} incomplete (${results.incomplete.map((v) => v.id).join(', ')})` });
  return { all: summary(results.violations), blocking: summary(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')) };
}

test.describe('A11Y-AXE', () => {
  test.setTimeout(240_000);

  test('Start, game view, Pause, Game over and Error have no serious or critical violations (A11Y-1, A11Y-2, A11Y-5, A11Y-14)', async ({ page }) => {
    await open(page);
    const found = /** @type {Record<string, { all: string[], blocking: string[] }>} */ ({});

    expect(await visibleOverlays(page)).toEqual(['wt-start']);
    found.start = await axe(page);

    await startGame(page);
    found.game = await axe(page);

    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
    expect(await visibleOverlays(page)).toEqual(['wt-paused']);
    found.paused = await axe(page);
    await page.keyboard.press('KeyP');
    await page.clock.runFor(100);

    // Game over: idle until the third hit, then past the lockout so the buttons are shown.
    await runUntil(page, 'gameover', 60_000);
    await page.clock.runFor(1100);
    expect(await visibleOverlays(page)).toEqual(['wt-gameover']);
    await expect(page.locator('#wt-over-actions')).toBeVisible();
    found.gameover = await axe(page);
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
    await startGame(page);

    await page.evaluate(() => {
      /** @type {any} */ (window).__wtBoom = true;
    });
    await page.clock.runFor(200);
    expect(await visibleOverlays(page)).toEqual(['wt-error']);
    found.error = await axe(page);

    expect(Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.blocking]))).toEqual({ start: [], game: [], paused: [], gameover: [], error: [] });
    // Anything below serious is listed, so a reviewer sees it, but does not fail the build.
    const minor = Object.entries(found).flatMap(([k, v]) => v.all.filter((x) => !v.blocking.includes(x)).map((x) => `${k}: ${x}`));
    if (minor.length) test.info().annotations.push({ type: 'axe-minor', description: minor.join(' | ') });
    expect((await snap(page)).screen).toBe('playing');
  });

  test.describe('touch-only device', () => {
    test.use({ hasTouch: true });
    test('Keyboard needed has no serious or critical violations (A11Y-1)', async ({ page }) => {
      await open(page);
      expect(await visibleOverlays(page)).toEqual(['wt-keyboard']);
      const found = await axe(page);
      expect(found.blocking).toEqual([]);
      if (found.all.length) test.info().annotations.push({ type: 'axe-minor', description: found.all.join(' | ') });
    });
  });
});
