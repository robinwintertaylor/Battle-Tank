// Smoke test for a served copy of site/: the deploy dry run and the live site
// after a deploy (docs/DEPLOY_RUNBOOK.md section 5).
// Usage: node scripts/smoke.js [base-url]   (default http://127.0.0.1:8080/Battle-Tank/)
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_IMPORT = /(?:import|export)\s[^'"]*?from\s*'(\.[^']+)'|import\s*'(\.[^']+)'/g;

/**
 * Fetch every page asset and check the basics. Returns a list of failures.
 * @param {string} base  Site root with a trailing slash.
 * @returns {Promise<string[]>}
 */
export async function smoke(base) {
  /** @type {string[]} */
  const failures = [];
  const fail = (/** @type {string} */ msg) => failures.push(msg);

  const home = await fetch(base);
  const html = await home.text();
  if (home.status !== 200) return [`GET ${base} returned ${home.status}`];
  if (!(home.headers.get('content-type') ?? '').startsWith('text/html')) fail('index is not served as text/html');
  if (!html.includes('<title>Wireframe Tanks</title>')) fail('title is not Wireframe Tanks');
  if (!html.includes('Content-Security-Policy')) fail('CSP meta tag is missing');
  if (/battlezone/i.test(html)) fail('index mentions the forbidden name (NFR-10)');
  if (/(?:src|href)="(?:https?:)?\/\//.test(html)) fail('index loads an external or protocol-relative URL');

  const queue = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('data:'));
  const seen = new Set();
  while (queue.length) {
    const rel = /** @type {string} */ (queue.shift());
    const url = new URL(rel, base).href;
    if (seen.has(url)) continue;
    seen.add(url);
    if (!url.startsWith(base)) {
      fail(`${rel} resolves outside the site`);
      continue;
    }
    const res = await fetch(url);
    if (res.status !== 200) {
      fail(`${url} returned ${res.status}`);
      continue;
    }
    const type = res.headers.get('content-type') ?? '';
    if (url.endsWith('.js')) {
      if (!type.includes('javascript')) fail(`${url} has content type ${type}`);
      for (const m of (await res.text()).matchAll(MODULE_IMPORT)) queue.push(new URL(m[1] ?? m[2], url).href);
    } else if (url.endsWith('.css') && !type.includes('text/css')) {
      fail(`${url} has content type ${type}`);
    }
  }

  const missing = await fetch(new URL('no-such-file.js', base));
  if (missing.status !== 404) fail(`a missing file returned ${missing.status}, not 404`);
  console.log(`${seen.size} assets fetched from ${base}`);
  return failures;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = process.argv[2] ?? 'http://127.0.0.1:8080/Battle-Tank/';
  const failures = await smoke(base.endsWith('/') ? base : `${base}/`);
  if (failures.length) {
    for (const f of failures) console.error(`FAIL ${f}`);
    process.exit(1);
  }
  console.log('Smoke test passed.');
}
