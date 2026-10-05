// T2: page load, start, controls, firing, pause and audio (TEST_STRATEGY.md
// 10.1: E2E-01 to E2E-04, E2E-07, E2E-08, E2E-10). Short scenarios: each
// stays inside the enemy's 2 s grace period unless it says otherwise, so the
// player is never hit while the test is measuring.
import { expect, test } from '@playwright/test';
import { focusedId, lastFrame, open, pageStrings, snap, startGame, visibleOverlays } from './support.js';

/** @param {any} s */
const player = (s) => s.tanks.find((/** @type {any} */ t) => t.side === 'player');
const DEG = 180 / Math.PI;

test.describe('E2E-01 page load and Start screen', () => {
  test('title, language, canvas label, controls listed, no errors (AC-01.1, A11Y-2, A11Y-14, AC-19.4)', async ({ page }) => {
    const { errors } = await open(page);
    await expect(page).toHaveTitle('Wireframe Tanks');
    expect(await page.locator('html').getAttribute('lang')).toBe('en-GB');
    await expect(page.locator('#wt-canvas')).toHaveAttribute('role', 'img');
    expect(await page.locator('#wt-canvas').getAttribute('aria-label')).toBeTruthy();
    expect(await visibleOverlays(page)).toEqual(['wt-start']);
    await expect(page.locator('#wt-start h1')).toHaveText('Wireframe Tanks');
    const keys = (await page.locator('.wt-keys').innerText()).replace(/\s+/g, ' ');
    for (const k of ['W', 'S', 'A', 'D', '↑', '↓', '←', '→', 'Space', 'P', 'Esc', 'M']) expect(keys).toContain(k);
    for (const word of ['Drive', 'Turn', 'Fire', 'Pause', 'Sound']) expect(keys).toContain(word);
    await expect(page.locator('#wt-start-button')).toBeEnabled();
    expect((await snap(page)).page).toBe('ready');
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => /** @type {any} */ (window).__cspViolations)).toEqual([]);
  });

  test('E2E-10 no "battlezone" in the title, meta tags, URL or any screen text (NFR-10)', async ({ page }) => {
    await open(page);
    expect(await pageStrings(page)).not.toMatch(/battlezone/i);
    await startGame(page);
    await page.keyboard.press('KeyP');
    await page.clock.runFor(100);
    expect(await pageStrings(page)).not.toMatch(/battlezone/i);
  });
});

test.describe('E2E-02 start a game', () => {
  test('Enter starts; the canvas draws the view and the HUD (AC-01.2, AC-02.1, AC-09.1, AC-08.1)', async ({ page }) => {
    await open(page);
    const before = await lastFrame(page);
    expect(before.texts).not.toContain('SCORE'); // no HUD behind the Start overlay (UX_SPEC 5.1)
    await startGame(page);
    const s = await snap(page);
    expect([s.score, s.lives]).toEqual([0, 3]);
    const frame = await lastFrame(page);
    expect(frame.texts).toEqual(expect.arrayContaining(['SCORE', 'LIVES', '0', '3']));
    const horizonColour = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--wt-color-horizon').trim());
    expect(frame.strokes).toContain(`1.5||${horizonColour}`);
    // The locator shows the range to the enemy, rounded (AC-08.1).
    const enemy = s.tanks.find((/** @type {any} */ t) => t.side === 'enemy');
    const range = Math.hypot(enemy.pos.x - player(s).pos.x, enemy.pos.z - player(s).pos.z);
    const shown = frame.texts.find((/** @type {string} */ t) => /^\d+ m$/.test(t));
    expect(shown).toBeDefined();
    expect(Math.abs(Number.parseInt(/** @type {string} */ (shown), 10) - range)).toBeLessThanOrEqual(1.5);
  });

  test('Space on the focused Start button starts; other keys and Tab do not (AC-01.2, AC-01.3)', async ({ page }) => {
    await open(page);
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'KeyP', 'Escape', 'KeyM', 'Tab', 'ShiftLeft']) {
      await page.keyboard.press(code);
      await page.clock.runFor(50);
      expect((await snap(page)).screen, code).toBe('start');
    }
    await page.locator('#wt-start-button').focus();
    await page.keyboard.press('Space');
    await page.clock.runFor(200);
    expect((await snap(page)).screen).toBe('playing');
  });
});

test.describe('E2E-03 drive and turn', () => {
  /** @type {[string, string, (d: { dz: number, dx: number, dh: number, dt: number }) => void][]} */
  const cases = [
    ['KeyW', 'forward at 12 u/s', ({ dz, dt }) => expect(dz).toBeCloseTo(12 * dt, 0)],
    ['ArrowUp', 'forward at 12 u/s', ({ dz, dt }) => expect(dz).toBeCloseTo(12 * dt, 0)],
    ['KeyS', 'reverse at 6 u/s', ({ dz, dt }) => expect(dz).toBeCloseTo(-6 * dt, 0)],
    ['ArrowDown', 'reverse at 6 u/s', ({ dz, dt }) => expect(dz).toBeCloseTo(-6 * dt, 0)],
    ['KeyD', 'turn right at 90 deg/s', ({ dh, dt }) => expect(dh).toBeCloseTo(90 * dt, 0)],
    ['ArrowRight', 'turn right at 90 deg/s', ({ dh, dt }) => expect(dh).toBeCloseTo(90 * dt, 0)],
    ['KeyA', 'turn left at 90 deg/s', ({ dh, dt }) => expect(dh).toBeCloseTo(-90 * dt, 0)],
    ['ArrowLeft', 'turn left at 90 deg/s', ({ dh, dt }) => expect(dh).toBeCloseTo(-90 * dt, 0)],
  ];
  for (const [code, name, check] of cases) {
    test(`${code}: ${name} (AC-03.1 to AC-03.3)`, async ({ page }) => {
      await open(page);
      await startGame(page);
      const a = await snap(page);
      await page.keyboard.down(code);
      await page.clock.runFor(500);
      await page.keyboard.up(code);
      const b = await snap(page);
      const dt = (b.tick - a.tick) / 60;
      check({ dz: player(b).pos.z - player(a).pos.z, dx: player(b).pos.x - player(a).pos.x, dh: (player(b).heading - player(a).heading) * DEG, dt });
    });
  }

  test('drive and turn together, and opposite keys cancel (AC-03.4, AC-03.5)', async ({ page }) => {
    await open(page);
    await startGame(page);
    let a = await snap(page);
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    await page.clock.runFor(500);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyD');
    let b = await snap(page);
    expect(player(b).heading).toBeGreaterThan(player(a).heading + 0.5);
    expect(player(b).pos.z).toBeGreaterThan(player(a).pos.z + 2);
    expect(player(b).pos.x).toBeGreaterThan(player(a).pos.x + 0.2); // it curved towards +x while driving

    a = await snap(page);
    for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) await page.keyboard.down(code);
    await page.clock.runFor(300);
    for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) await page.keyboard.up(code);
    b = await snap(page);
    expect(player(b).pos).toEqual(player(a).pos);
    expect(player(b).heading).toBe(player(a).heading);
  });

  test('keys are read by physical position, not by the character they type (AC-03.6)', async ({ page }) => {
    await open(page);
    await startGame(page);
    const a = await snap(page);
    // An AZERTY layout: the key in the QWERTY W position types "z". Playwright's
    // keyboard cannot change the layout, so the events are dispatched by hand.
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'z' })));
    await page.clock.runFor(300);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'z' })));
    const b = await snap(page);
    expect(player(b).pos.z).toBeGreaterThan(player(a).pos.z + 2);
    // The character "w" on another physical key does nothing.
    const c = await snap(page);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'w' })));
    await page.clock.runFor(300);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ', key: 'w' })));
    expect(player(await snap(page)).pos).toEqual(player(c).pos);
  });

  test('the game keys never scroll or otherwise act on the page (AC-03.7)', async ({ page }) => {
    await open(page);
    await startGame(page);
    await page.evaluate(() => {
      const w = /** @type {any} */ (window);
      w.__prevented = {};
      // Added after the game's own listener on window, so it runs after it.
      addEventListener('keydown', (e) => {
        w.__prevented[e.code] = e.defaultPrevented;
      });
    });
    for (const code of ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW']) {
      await page.keyboard.down(code);
      await page.keyboard.up(code);
    }
    const prevented = await page.evaluate(() => /** @type {any} */ (window).__prevented);
    expect(prevented).toEqual({ Space: true, ArrowUp: true, ArrowDown: true, ArrowLeft: true, ArrowRight: true, KeyW: true });
    expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
  });
});

test.describe('E2E-04 fire', () => {
  test('a shell leaves at 80 u/s, and holding or mashing Space never puts a second shell up (AC-04.1 to AC-04.3, AC-04.5)', async ({ page }) => {
    await open(page);
    await startGame(page);
    /** @param {any} s */
    const mine = (s) => s.shells.filter((/** @type {any} */ sh) => sh.side === 'player');
    // Face a clear lane first: the pillar straight ahead would stop the shell at once.
    await page.keyboard.down('KeyD');
    await page.clock.runFor(1000);
    await page.keyboard.up('KeyD');
    const turned = await snap(page);
    expect(player(turned).heading * DEG).toBeGreaterThan(80);

    await page.keyboard.press('Space');
    await page.clock.runFor(34);
    const a = await snap(page);
    expect(mine(a)).toHaveLength(1);
    await page.clock.runFor(100);
    const b = await snap(page);
    expect(mine(b)).toHaveLength(1);
    const shell = mine(b)[0];
    const prev = mine(a)[0];
    expect(shell.id).toBe(prev.id);
    const speed = Math.hypot(shell.pos.x - prev.pos.x, shell.pos.z - prev.pos.z) / ((b.tick - a.tick) / 60);
    expect(speed).toBeCloseTo(80, 0);

    // Mash: many presses in one tick and one per frame. Never more than one shell in flight.
    const shotsBefore = (await page.evaluate(() => /** @type {any} */ (window).__WT_TEST__.events())).filter((/** @type {any} */ e) => e.type === 'shot' && e.tankId === player(b).id).length;
    let maxInFlight = 0;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Space');
      await page.keyboard.press('Space');
      await page.clock.runFor(16);
      maxInFlight = Math.max(maxInFlight, mine(await snap(page)).length);
    }
    expect(maxInFlight).toBe(1);
    const ev = await page.evaluate(() => /** @type {any} */ (window).__WT_TEST__.events());
    const shots = ev.filter((/** @type {any} */ e) => e.type === 'shot' && e.tankId === player(b).id);
    // 40 frames is about 0.65 s: the 0.5 s reload allows at most one more.
    expect(shots.length - shotsBefore).toBeLessThanOrEqual(1);
    for (let i = 1; i < shots.length; i++) expect(shots[i].tick - shots[i - 1].tick).toBeGreaterThanOrEqual(30); // K-26, 0.5 s
  });

  test('holding Space fires once, however long it is held (AC-04.3)', async ({ page }) => {
    await open(page);
    await startGame(page);
    const pid = (await snap(page)).playerId;
    await page.keyboard.down('Space');
    for (let i = 0; i < 5; i++) await page.keyboard.down('Space'); // auto-repeat: repeat=true
    await page.clock.runFor(1500);
    await page.keyboard.up('Space');
    const ev = await page.evaluate(() => /** @type {any} */ (window).__WT_TEST__.events());
    expect(ev.filter((/** @type {any} */ e) => e.type === 'shot' && e.tankId === pid).length).toBe(1);
    await page.keyboard.press('Space');
    await page.clock.runFor(50);
    const again = await page.evaluate(() => /** @type {any} */ (window).__WT_TEST__.events());
    expect(again.filter((/** @type {any} */ e) => e.type === 'shot' && e.tankId === pid).length).toBe(2);
  });
});

test.describe('E2E-07 pause, auto-pause and held keys', () => {
  test('blur and a hidden tab pause the game, and nothing resumes it by itself (AC-10.3, AC-10.4, AC-03.8)', async ({ page }) => {
    await open(page);
    await startGame(page);
    const start = await snap(page);
    // A held key is released when the window loses focus (AC-03.8).
    await page.keyboard.down('KeyW');
    await page.clock.runFor(100);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.clock.runFor(100);
    let s = await snap(page);
    expect(s.screen).toBe('paused');
    expect(player(s).pos.z).toBeGreaterThan(player(start).pos.z);
    await page.clock.runFor(1000);
    expect((await snap(page)).tick).toBe(s.tick);
    // The focus comes back (a focus event), and the game stays paused.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.clock.runFor(500);
    expect((await snap(page)).screen).toBe('paused');
    // P resumes. W is still physically held by the test, but the game released it at blur.
    const z = player(await snap(page)).pos.z;
    await page.keyboard.press('KeyP');
    await page.clock.runFor(500);
    s = await snap(page);
    expect(['playing', 'respawning']).toContain(s.screen);
    expect(player(s).pos.z).toBe(z);
    await page.keyboard.up('KeyW');

    // A hidden tab pauses too.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(100);
    expect((await snap(page)).screen).toBe('paused');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(500);
    expect((await snap(page)).screen).toBe('paused');
  });

  test('a held Space does not resume, and the Pause dialog has focus and says how to resume (AC-10.5, AC-10.7)', async ({ page }) => {
    await open(page);
    await startGame(page);
    await page.keyboard.down('Space');
    await page.clock.runFor(50);
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
    expect((await snap(page)).screen).toBe('paused');
    expect(await focusedId(page)).toBe('wt-paused');
    await expect(page.locator('#wt-paused')).toContainText('P');
    await expect(page.locator('#wt-paused')).toContainText('Esc');
    await expect(page.locator('#wt-paused')).toContainText('resume');
    await page.keyboard.down('Space'); // auto-repeat while the dialog is open
    await page.clock.runFor(500);
    await page.keyboard.up('Space');
    await page.clock.runFor(100);
    expect((await snap(page)).screen).toBe('paused');
  });

  test('pause is available while respawning, and time stays frozen (AC-10.1, AC-10.2)', async ({ page }) => {
    await open(page);
    await startGame(page);
    // Idle until the first hit: the player is respawning.
    for (let i = 0; i < 40 && (await snap(page)).screen !== 'respawning'; i++) await page.clock.runFor(100);
    expect((await snap(page)).screen).toBe('respawning');
    await page.keyboard.press('KeyP');
    await page.clock.runFor(100);
    const s = await snap(page);
    expect(s.screen).toBe('paused');
    await page.clock.runFor(3000);
    const t = await snap(page);
    expect(t.tick).toBe(s.tick);
    expect(t.timers).toEqual(s.timers);
    expect(t.tanks).toEqual(s.tanks);
    await page.keyboard.press('KeyP');
    await page.clock.runFor(100);
    expect((await snap(page)).screen).toBe('respawning'); // back to where it was
  });
});

test.describe('E2E-08 audio and mute', () => {
  test('no audio before the first key; sound plays after it; M silences and restores (AC-01.4, AC-11.1 to AC-11.3, AC-12.1 to AC-12.3, BR-23)', async ({ page, browserName }) => {
    // The ubuntu runner has no audio device, so headless Firefox leaves the AudioContext
    // suspended for good (CI runs 37141233387 and 37228074324). Chromium covers it in CI; Firefox still runs it locally.
    test.skip(browserName === 'firefox' && Boolean(process.env.CI), 'No audio device on the CI runner: Firefox cannot resume the AudioContext.');
    await open(page);
    test.skip(await page.evaluate(() => typeof AudioContext === 'undefined'), 'No Web Audio in this engine build (TEST_STRATEGY 3.2.1 rule 4); Linux CI runs it.');
    /** @param {number} ms */
    const idle = async (ms) => {
      await page.clock.runFor(ms);
    };
    const audio = () => page.evaluate(() => ({ contexts: /** @type {any} */ (window).__audio.contexts, sources: /** @type {any} */ (window).__audio.sources, state: /** @type {any} */ (window).__audio.ctx?.state ?? null }));
    await idle(1000);
    expect((await audio()).contexts).toBe(0);

    await startGame(page); // the first key press
    // resume() is asynchronous and headless Firefox on Linux is slow to start its audio stream.
    await expect
      .poll(async () => {
        await idle(100);
        return (await audio()).state;
      }, { timeout: 10_000 })
      .toBe('running');
    let a = await audio();
    expect(a.contexts).toBe(1);

    // A shot makes a sound.
    const s0 = a.sources;
    await page.keyboard.press('Space');
    await idle(100);
    expect((await audio()).sources).toBeGreaterThan(s0);

    // M mutes: the HUD says so, and the next shot makes no sound.
    await page.keyboard.press('KeyM');
    await idle(700); // past the reload
    expect((await snap(page)).muted).toBe(true);
    expect((await lastFrame(page)).texts).toContain('P PAUSE   M SOUND OFF');
    a = await audio();
    await page.keyboard.press('Space');
    await idle(100);
    expect((await audio()).sources).toBe(a.sources);

    // M again restores it.
    await page.keyboard.press('KeyM');
    await idle(700);
    expect((await snap(page)).muted).toBe(false);
    expect((await lastFrame(page)).texts).toContain('P PAUSE   M SOUND ON');
    a = await audio();
    await page.keyboard.press('Space');
    await idle(100);
    expect((await audio()).sources).toBeGreaterThan(a.sources);
  });

  test('mute works on the Start screen and is not stored (AC-12.2, BR-23)', async ({ page }) => {
    await open(page);
    await page.keyboard.press('KeyM');
    await page.clock.runFor(100);
    expect((await snap(page)).muted).toBe(true);
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
    await page.keyboard.press('Enter');
    await page.clock.runFor(100);
    expect((await snap(page)).muted).toBe(true);
    await page.reload();
    await page.clock.runFor(200);
    expect((await snap(page)).muted).toBe(false); // a new session starts unmuted
  });

  test('the game plays on, with no errors, when Web Audio is missing (US-11, ADR 0006)', async ({ page }) => {
    const { errors } = await open(page, { noAudio: true });
    expect(await page.evaluate(() => typeof AudioContext)).toBe('undefined');
    await startGame(page);
    await page.keyboard.press('Space');
    await page.clock.runFor(500);
    expect((await snap(page)).tick).toBeGreaterThan(20);
    expect(errors).toEqual([]);
  });
});
