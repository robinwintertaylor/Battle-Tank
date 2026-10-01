const { test, expect } = require('@playwright/test');

function watchCsp(page) {
  const msgs = [];
  page.on('console', m => { if (/content.security.policy|CSP|refused/i.test(m.text())) msgs.push(m.text()); });
  return msgs;
}

test('(a) init script runs under shipped CSP, no bypassCSP', async ({ page, browserName }) => {
  const csp = watchCsp(page);
  await page.addInitScript(() => {
    window.__WT_TEST__ = { seed: 42 };
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', e => window.__violations.push(e.violatedDirective));
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => typeof window.__WT_TEST__.snapshot)).toBe('function');
  const snap = await page.evaluate(() => window.__WT_TEST__.snapshot());
  const meta = await page.evaluate(() => document.head.firstElementChild.getAttribute('http-equiv'));
  const spike = await page.evaluate(() => window.__SPIKE__);
  const violations = await page.evaluate(() => window.__violations);
  console.log(`[${browserName}] (a) seed seen at module start=${JSON.stringify(snap.seenAtModuleStart)} meta=${meta} evalBlocked=${spike.evalBlocked} violations=${JSON.stringify(violations)} cspConsole=${csp.length}`);
  expect(meta).toBe('Content-Security-Policy');
  expect(snap.seenAtModuleStart).toEqual({ seed: 42 });
  expect(spike.evalBlocked).toBe(true); // proves the CSP is actually enforced
  expect(await page.evaluate(() => Object.isFrozen(window.__WT_TEST__.snapshot()))).toBe(true);
});

test('(a2) init script can wrap AudioContext and canvas under CSP', async ({ page, browserName }) => {
  console.log('['+browserName+'] (a2) AudioContext present: ' + await (await page.context().newPage()).evaluate(() => typeof (window.AudioContext || window.webkitAudioContext)));
  await page.addInitScript(() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    window.__audioStarts = 0;
    if (AC) {
      const orig = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function (...a) {
        const o = orig.apply(this, a); const s = o.start.bind(o);
        o.start = (...b) => { window.__audioStarts++; return s(...b); }; return o;
      };
    }
    const stroke = CanvasRenderingContext2D.prototype.stroke;
    window.__strokes = 0;
    CanvasRenderingContext2D.prototype.stroke = function (...a) { window.__strokes++; return stroke.apply(this, a); };
  });
  await page.goto('/');
  const r = await page.evaluate(() => {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    ac.createOscillator().start();
    const ctx = document.getElementById('c').getContext('2d');
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 10); ctx.stroke();
    return { audio: window.__audioStarts, strokes: window.__strokes };
  });
  console.log(`[${browserName}] (a2) wrapped audio starts=${r.audio} strokes=${r.strokes}`);
  expect(r).toEqual({ audio: 1, strokes: 1 });
});

test('(b) page.clock drives requestAnimationFrame', async ({ page, browserName }) => {
  test.setTimeout(180_000);
  await page.clock.install({ time: 0 });
  await page.addInitScript(() => { window.__WT_TEST__ = { seed: 1 }; });
  await page.goto('/');
  await page.clock.pauseAt(1000);
  await page.clock.runFor(16 * 3); // let the loop start
  const a = await page.evaluate(() => window.__WT_TEST__.snapshot());
  await page.clock.runFor(10_000);
  const b = await page.evaluate(() => window.__WT_TEST__.snapshot());
  await page.clock.runFor(10_000);
  const c = await page.evaluate(() => window.__WT_TEST__.snapshot());
  // While paused, real time must not move the loop.
  await page.waitForTimeout(500);
  const d = await page.evaluate(() => window.__WT_TEST__.snapshot());
  const t0 = Date.now();
  await page.clock.runFor(60_000); // 1 game minute
  const wall = Date.now() - t0;
  const e = await page.evaluate(() => window.__WT_TEST__.snapshot());
  console.log(`[${browserName}] (b) 10s: frames=${b.frames - a.frames} ticks=${b.ticks - a.ticks}; next 10s ticks=${c.ticks - b.ticks}; paused 500ms real: ticks moved=${d.ticks - c.ticks}; 1 min: ticks=${e.ticks - d.ticks} in ${wall} ms wall`);
  expect(b.ticks - a.ticks).toBeGreaterThanOrEqual(595);
  expect(b.ticks - a.ticks).toBeLessThanOrEqual(605);
  expect(c.ticks - b.ticks).toBe(b.ticks - a.ticks);
  expect(d.ticks).toBe(c.ticks);
  expect(e.ticks - d.ticks).toBeGreaterThanOrEqual(3_595);
});

test('(c) headless pointer media queries', async ({ page, browserName }) => {
  await page.goto('/');
  const q = await page.evaluate(() => Object.fromEntries(
    ['(any-pointer: fine)', '(pointer: fine)', '(any-pointer: coarse)', '(any-pointer: none)', '(hover: hover)', '(any-hover: hover)']
      .map(m => [m, matchMedia(m).matches])));
  console.log(`[${browserName}] (c) ${JSON.stringify(q)}`);
  expect(q['(any-pointer: fine)']).toBe(true);
});

test('(d1) touch-only emulation via context options', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'isMobile is not supported in Firefox');
  const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/');
  const v = await page.evaluate(() => [matchMedia('(any-pointer: fine)').matches, matchMedia('(any-pointer: coarse)').matches]);
  console.log(`[${browserName}] (d1) isMobile+hasTouch: any-pointer fine=${v[0]} coarse=${v[1]}`);
  await ctx.close();
});

test('(d1b) hasTouch only (desktop)', async ({ browser, browserName }) => {
  const ctx = await browser.newContext({ hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/');
  const v = await page.evaluate(() => [matchMedia('(any-pointer: fine)').matches, matchMedia('(any-pointer: coarse)').matches]);
  console.log(`[${browserName}] (d1b) hasTouch: any-pointer fine=${v[0]} coarse=${v[1]}`);
  await ctx.close();
});

test('(d2) init script answers the one matchMedia query', async ({ page, browserName }) => {
  page.on('pageerror', e => console.log('['+browserName+'] (d2) pageerror: ' + e.message));
  await page.addInitScript(() => {
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (q) => {
      const r = orig(q);
      if (q.replace(/\s/g, '') === '(any-pointer:fine)') {
        return new Proxy(r, { get: (t, k) => k === 'matches' ? false : (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
      }
      return r;
    };
    window.__WT_TEST__ = { seed: 7 };
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => typeof window.__WT_TEST__.snapshot)).toBe('function');
  const snap = await page.evaluate(() => window.__WT_TEST__.snapshot());
  const other = await page.evaluate(() => matchMedia('(pointer: fine)').matches);
  console.log(`[${browserName}] (d2) game sees anyPointerFine=${snap.anyPointerFine}; other query untouched pointer:fine=${other}`);
  expect(snap.anyPointerFine).toBe(false);
});
