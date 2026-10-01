// Pipeline smoke test from the scaffold. Tester owns test/e2e and may
// replace this with the full suite (TEST_STRATEGY.md section 3.2).
import { expect, test } from '@playwright/test';

test('the page loads with its CSP and no console errors or extra requests', async ({ page }) => {
  /** @type {string[]} */
  const problems = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(msg.text());
  });
  page.on('pageerror', (err) => problems.push(err.message));
  /** @type {string[]} */
  const requests = [];
  page.on('request', (req) => requests.push(new URL(req.url()).pathname));

  await page.goto('./');
  await expect(page).toHaveTitle('Wireframe Tanks');

  const firstHeadChild = await page.evaluate(() => {
    const el = document.head.firstElementChild;
    return el ? el.getAttribute('http-equiv') : null;
  });
  expect(firstHeadChild).toBe('Content-Security-Policy');

  expect(problems).toEqual([]);
  expect(requests).not.toContain('/favicon.ico');
});
