const { test } = require('@playwright/test');
test('wk clock probe', async ({ page, browserName }) => {
  test.setTimeout(180_000);
  await page.clock.install({ time: 0 });
  await page.addInitScript(() => { window.__WT_TEST__ = { seed: 1 }; });
  await page.goto('/');
  await page.clock.pauseAt(1000);
  for (const ms of [48, 1000, 10_000]) {
    const t0 = Date.now();
    await page.clock.runFor(ms);
    const s = await page.evaluate(() => window.__WT_TEST__.snapshot());
    console.log(`[${browserName}] runFor(${ms}) wall=${Date.now() - t0}ms frames=${s.frames} ticks=${s.ticks}`);
  }
  const t1 = Date.now();
  await page.clock.fastForward(10_000);
  await page.clock.runFor(16);
  const f = await page.evaluate(() => window.__WT_TEST__.snapshot());
  console.log(`[${browserName}] fastForward(10000) wall=${Date.now() - t1}ms frames=${f.frames} ticks=${f.ticks}`);
});
