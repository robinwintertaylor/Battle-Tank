// T2: hosting, loading, window size and the overlays (TEST_STRATEGY.md 10.1:
// E2E-13, E2E-17, E2E-18, E2E-19, E2E-21, E2E-22, E2E-25).
import { expect, test } from '@playwright/test';
import { BASE } from '../../scripts/serve.js';
import { SEED, fitsWidth, focusedId, open, pauseClock, snap, startGame, visibleOverlays } from './support.js';

/**
 * Whether an element is at least 44 x 44 CSS px (A11Y-6).
 * @param {import('@playwright/test').Page} page @param {string} id
 */
async function bigEnough(page, id) {
  const box = await page.locator(`#${id}`).boundingBox();
  return [id, box !== null && box.width >= 44 && box.height >= 44];
}

test('E2E-13 sub-path hosting: every request stays under the sub-path, and none fails (NFR-07)', async ({ page }) => {
  const { requests, responses, errors } = await open(page);
  const origin = new URL(page.url()).origin;
  expect(page.url()).toBe(`${origin}${BASE}`);
  expect(requests.length).toBeGreaterThan(20); // index, styles and every module
  expect(requests.filter((u) => !u.startsWith(`${origin}${BASE}`))).toEqual([]);
  expect(responses.filter((r) => r.status >= 400)).toEqual([]);
  expect(errors).toEqual([]);
  // The same files are not served at the site root, so an absolute URL would have failed here.
  const root = await page.request.get(`${origin}/`, { maxRedirects: 0 });
  expect([root.status(), root.headers().location]).toEqual([301, BASE]);
  expect((await page.request.get(`${origin}/src/main.js`)).status()).toBe(404);
  expect((await page.request.get(`${origin}${BASE}src/main.js`)).status()).toBe(200);
  await startGame(page);
});

test('E2E-17 throttled load: the Start screen takes a key within 2 s (NFR-20)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Network throttling needs the Chromium DevTools protocol (TEST_STRATEGY 10.1).');
  await page.addInitScript((seed) => {
    /** @type {any} */ (window).__WT_TEST__ = { seed };
  }, SEED);
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await client.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: (10 * 1e6) / 8, uploadThroughput: (10 * 1e6) / 8 });
  const t0 = Date.now();
  await page.goto('./');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /** @type {any} */ (window).__WT_TEST__.snapshot?.().screen === 'playing', undefined, { timeout: 5000 });
  const ms = Date.now() - t0;
  test.info().annotations.push({ type: 'load-to-playing', description: `${ms} ms at 10 Mbit/s, 40 ms latency, empty cache` });
  expect(ms).toBeLessThan(2000);
});

test.describe('E2E-18 resize', () => {
  /**
   * Where the horizon is (the rows that are lit across the width), and the
   * extent of the crosshair (near-white pixels within 40 CSS px of the centre).
   * @param {import('@playwright/test').Page} page
   */
  const measure = (page) =>
    page.evaluate(() => {
      const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('wt-canvas'));
      const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
      const { width, height } = canvas;
      const scale = width / canvas.clientWidth;
      const px = ctx.getImageData(0, 0, width, height).data;
      // The horizon is the row (it can straddle two) with the most lit pixels, anything brighter than the background.
      const lit = (/** @type {number} */ i) => px[i] + px[i + 1] + px[i + 2] > 150;
      /** @type {number[]} */
      const rowCount = [];
      for (let y = 0; y < height; y++) {
        let count = 0;
        for (let x = 0; x < width; x++) if (lit((y * width + x) * 4)) count++;
        rowCount.push(count);
      }
      const top = Math.max(...rowCount);
      const rows = rowCount.flatMap((c, y) => (c > 0.8 * width ? [y] : []));
      const best = { y: rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : -1, count: top };
      const cx = width / 2;
      const cy = height / 2;
      const r = 40 * scale;
      let [x0, x1, y0, y1] = [width, 0, height, 0];
      for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(height, cy + r); y++) {
        for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(width, cx + r); x++) {
          const i = (y * width + x) * 4;
          if (px[i] > 170 && px[i + 1] > 190 && px[i + 2] > 190) {
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
        }
      }
      return {
        client: [canvas.clientWidth, canvas.clientHeight],
        inner: [innerWidth, innerHeight],
        backing: [width, height],
        scale,
        horizon: best,
        crosshair: x1 >= x0 ? { w: (x1 - x0 + 1) / scale, h: (y1 - y0 + 1) / scale } : null,
      };
    });

  test('the canvas fills the window, the horizon stays level and the crosshair stays round (AC-02.5)', async ({ page }) => {
    await open(page);
    await startGame(page);
    /** @type {string[]} */
    const seen = [];
    for (const [width, height] of [[1280, 720], [800, 900], [1400, 500], [640, 400]]) {
      await page.setViewportSize({ width, height });
      await page.clock.runFor(100);
      const m = await measure(page);
      const label = `${width}x${height}`;
      seen.push(label);
      expect(m.client, label).toEqual([width, height]);
      expect(m.backing, `${label} backing store`).toEqual([Math.round(width * m.scale), Math.round(height * m.scale)]);
      // Straight ahead and level: the horizon is a line across the middle of the screen.
      expect(m.horizon.count, `${label} horizon spans the width`).toBeGreaterThan(0.8 * m.backing[0]);
      expect(Math.abs(m.horizon.y / m.scale - height / 2), `${label} horizon row`).toBeLessThanOrEqual(3);
      // The 36 px crosshair circle is still a circle, not an ellipse.
      expect(m.crosshair, `${label} crosshair found`).not.toBeNull();
      expect(Math.abs((m.crosshair?.w ?? 0) - (m.crosshair?.h ?? 0)), `${label} crosshair aspect`).toBeLessThanOrEqual(2);
      expect(m.crosshair?.w).toBeGreaterThan(34);
      expect(m.crosshair?.w).toBeLessThan(42);
    }
    expect(seen).toHaveLength(4);
    expect((await snap(page)).screen).toBe('playing'); // 640 x 400 is still big enough
  });
});

test.describe('E2E-19 overlay focus and target size', () => {
  test('Start, Pause and back: focus lands on the primary control and returns to the game (A11Y-4, A11Y-6)', async ({ page }) => {
    await open(page);
    expect(await focusedId(page)).toBe('wt-start-button');
    expect(await bigEnough(page, 'wt-start-button')).toEqual(['wt-start-button', true]);
    await startGame(page);
    expect(await focusedId(page)).toBe('wt-game');

    // Pause by P: the dialog has focus, and focus returns to the game on resume.
    await page.keyboard.press('KeyP');
    await page.clock.runFor(100);
    expect(await focusedId(page)).toBe('wt-paused');
    for (const id of ['wt-resume', 'wt-quit']) expect(await bigEnough(page, id)).toEqual([id, true]);
    await page.keyboard.press('KeyP');
    await page.clock.runFor(100);
    expect(await focusedId(page)).toBe('wt-game');

    // Pause by Esc, then Resume with the button: focus returns to the game again.
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
    expect(await focusedId(page)).toBe('wt-paused');
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('wt-resume');
    // The focused control is visible, not hidden or off screen.
    expect(await page.evaluate(() => {
      const r = /** @type {Element} */ (document.activeElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight;
    })).toBe(true);
    await page.keyboard.press('Enter');
    await page.clock.runFor(100);
    expect(await focusedId(page)).toBe('wt-game');

    // Quit to title: focus is on Start again.
    await page.keyboard.press('KeyP');
    await page.clock.runFor(100);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.clock.runFor(100);
    expect(await visibleOverlays(page)).toEqual(['wt-start']);
    expect(await focusedId(page)).toBe('wt-start-button');
  });

  test.describe('touch-only device', () => {
    test.use({ hasTouch: true });
    test('Keyboard needed puts focus on Play anyway, 44 px or more (AC-19.1)', async ({ page }) => {
      await open(page);
      expect(await focusedId(page)).toBe('wt-keyboard-button');
      expect(await bigEnough(page, 'wt-keyboard-button')).toEqual(['wt-keyboard-button', true]);
    });
  });

  test('Error puts focus on Reload, 44 px or more (AC-20.1)', async ({ page }) => {
    await open(page);
    await startGame(page);
    await page.evaluate(() => {
      /** @type {any} */ (window).__wtBoom = true;
    });
    await page.clock.runFor(200);
    expect(await focusedId(page)).toBe('wt-reload');
    expect(await bigEnough(page, 'wt-reload')).toEqual(['wt-reload', true]);
  });
});

test.describe('E2E-21 reflow', () => {
  const sizes = /** @type {const} */ ([[320, 568], [640, 400]]);

  test('Start, Pause and Error fit at 320 px wide and at 640 px (200% zoom of a 1280 px window) (A11Y-15)', async ({ page }) => {
    await open(page);
    /** @param {string} id @param {string} what */
    const check = async (id, what) => {
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        await page.clock.runFor(100);
        const fit = await fitsWidth(page, id);
        expect(fit.wide, `${what} at ${width} px`).toEqual([]);
        expect(fit.pageOverflow, `${what} page overflow at ${width} px`).toBeLessThanOrEqual(0);
      }
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.clock.runFor(100);
    };
    await check('wt-start', 'Start');
    await startGame(page);
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
    await check('wt-paused', 'Pause');
    await page.keyboard.press('KeyP');
    await page.clock.runFor(100);
    await page.evaluate(() => {
      /** @type {any} */ (window).__wtBoom = true;
    });
    await page.clock.runFor(200);
    await check('wt-error', 'Error');
  });

  test.describe('narrow phone-sized window at load', () => {
    test.use({ viewport: { width: 320, height: 568 } });
    test('Keyboard needed fits at 320 px', async ({ page }) => {
      await open(page);
      expect(await visibleOverlays(page)).toEqual(['wt-keyboard']);
      const fit = await fitsWidth(page, 'wt-keyboard');
      expect(fit.wide).toEqual([]);
      expect(fit.pageOverflow).toBeLessThanOrEqual(0);
    });
  });
});

test('E2E-22 loading: Start is disabled and reads Loading while a module is held, and Enter and Space start nothing (AC-01.5)', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript((seed) => {
    /** @type {any} */ (window).__WT_TEST__ = { seed };
  }, SEED);
  /** @type {() => void} */
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = () => resolve(undefined);
  });
  await page.route('**/src/core/rules.js', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('./', { waitUntil: 'commit' });
  const button = page.locator('#wt-start-button');
  await expect(button).toBeDisabled();
  await expect(button).toHaveText('Loading…');
  for (const code of ['Enter', 'Space', 'KeyP']) {
    await page.keyboard.press(code);
    await page.clock.runFor(100);
    await expect(button).toBeDisabled();
    await expect(button).toHaveText('Loading…');
  }
  expect(await page.evaluate(() => typeof (/** @type {any} */ (window).__WT_TEST__).snapshot)).toBe('undefined'); // the game has not started

  release();
  await page.waitForLoadState('load');
  await pauseClock(page);
  await page.clock.runFor(300);
  await expect(button).toBeEnabled();
  await expect(button).toHaveText('Start game');
  expect(await focusedId(page)).toBe('wt-start-button');
  expect((await snap(page)).screen).toBe('start'); // the keys pressed while loading were not kept
});

test.describe('E2E-25 window too small', () => {
  test('under 640 x 400 the game pauses and cannot resume; at 640 x 400 it can, and stays paused (AC-10.9 to AC-10.11, BR-25)', async ({ page }) => {
    await open(page);
    await startGame(page);
    await page.setViewportSize({ width: 639, height: 400 });
    // The resize event reaches the page a little after setViewportSize returns on Linux CI,
    // so give the game a few ticks to see it instead of reading the screen once.
    await expect
      .poll(async () => {
        await page.clock.runFor(100);
        return (await snap(page)).screen;
      })
      .toBe('paused');
    await expect(page.locator('#wt-paused-small')).toBeVisible();
    await expect(page.locator('#wt-paused-small')).toHaveText('Make the window larger to keep playing.');
    await expect(page.locator('#wt-resume')).toBeDisabled();
    for (const code of ['KeyP', 'Escape', 'Enter', 'Space']) {
      await page.keyboard.press(code);
      await page.clock.runFor(100);
      expect((await snap(page)).screen, code).toBe('paused');
    }
    // 640 x 399 is too small as well (the other dimension).
    await page.setViewportSize({ width: 640, height: 399 });
    await page.clock.runFor(100);
    await expect(page.locator('#wt-resume')).toBeDisabled();
    for (const code of ['KeyP', 'Escape']) {
      await page.keyboard.press(code);
      await page.clock.runFor(100);
      expect((await snap(page)).screen, code).toBe('paused');
    }
    // Big enough again: Resume is enabled, but the game does not resume by itself.
    await page.setViewportSize({ width: 640, height: 400 });
    await page.clock.runFor(500);
    const s = await snap(page);
    expect(s.screen).toBe('paused');
    await expect(page.locator('#wt-resume')).toBeEnabled();
    await expect(page.locator('#wt-paused-small')).toBeHidden();
    await page.keyboard.press('KeyP');
    await page.clock.runFor(100);
    expect(['playing', 'respawning']).toContain((await snap(page)).screen);
  });
});
