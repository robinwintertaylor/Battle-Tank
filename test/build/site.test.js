// BUILD-01 to BUILD-04 (TEST_STRATEGY.md section 10.1): checks on the files
// GitHub Pages will serve, which is everything under site/ (the deploy
// workflow uploads that folder as the artifact).
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('../../site', import.meta.url));

/** @param {string} dir @returns {Promise<string[]>} paths relative to SITE, with / separators */
async function list(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await list(path)));
    else out.push(relative(SITE, path).split(sep).join('/'));
  }
  return out.sort();
}

const files = await list(SITE);
/** @type {Map<string, string>} */
const text = new Map();
for (const f of files) text.set(f, await readFile(join(SITE, f), 'utf8'));
const html = /** @type {string} */ (text.get('index.html'));

test('BUILD-01 the artifact holds only runtime files', () => {
  assert.ok(files.length > 0, 'site/ is empty');
  const allowed = new Set(['.html', '.css', '.js']);
  const bad = files.filter((f) => !allowed.has(extname(f)) || f.split('/').some((p) => p.startsWith('.')));
  assert.deepEqual(bad, [], 'files that are not .html, .css or .js, or are dotfiles');
  const dev = files.filter((f) => /(^|\/)(package(-lock)?\.json|[^/]*\.(map|test\.js|spec\.js)|[^/]*\.config\.[cm]?js|[jt]sconfig[^/]*|docs|test|tests|node_modules)(\/|$)/.test(f));
  assert.deepEqual(dev, [], 'development files in the artifact');
  assert.ok(files.includes('index.html'));
});

test('BUILD-01 no local path in any shipped file', () => {
  const pattern = /[a-z]:[\\/]+Users[\\/]|\/home\/|\/Users\//i;
  const hits = files.filter((f) => pattern.test(/** @type {string} */ (text.get(f))));
  assert.deepEqual(hits, []);
});

test('BUILD-02 no URL to another origin in any shipped file', () => {
  const hits = [];
  for (const [f, body] of text) for (const m of body.matchAll(/\b(?:https?|wss?|ftp):\/\/[^\s"'`)<>]+/gi)) hits.push(`${f}: ${m[0]}`);
  assert.deepEqual(hits, []);
});

test('BUILD-02 the HTML has no inline script, style or event handler', () => {
  const inlineScripts = [...html.matchAll(/<script\b([^>]*)>/gi)].filter((m) => !/\bsrc\s*=/.test(m[1]));
  assert.equal(inlineScripts.length, 0, 'a <script> without src');
  assert.doesNotMatch(html, /<style\b/i, 'a <style> element');
  assert.doesNotMatch(html, /<[a-z][^>]*\sstyle\s*=/i, 'a style attribute');
  assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+\s*=/i, 'an on…= handler');
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//i, 'a script from another origin');
});

test('BUILD-02 no audio, font or image files, and the CSS pulls in nothing external', () => {
  const media = files.filter((f) => /\.(mp3|ogg|wav|m4a|aac|flac|woff2?|ttf|otf|eot|png|jpe?g|gif|webp|svg|ico)$/i.test(f));
  assert.deepEqual(media, []);
  for (const [f, body] of text) {
    if (!f.endsWith('.css')) continue;
    assert.doesNotMatch(body, /@import|@font-face/i, `${f} imports or declares a font`);
    for (const m of body.matchAll(/url\(\s*["']?([^"')]+)/gi)) assert.match(m[1], /^data:/, `${f} url(${m[1]})`);
  }
});

/** SEC-17 baseline, as REQUIREMENTS.md gives it. */
const BASELINE = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
};

test('BUILD-03 the CSP meta tag is the first child of <head> and at least as strict as SEC-17', () => {
  const head = /** @type {string} */ (html.match(/<head>([\s\S]*?)<\/head>/i)?.[1]);
  assert.ok(head, 'no <head>');
  const first = head.trim().match(/^<(\w+)([^>]*)>/);
  assert.equal(first?.[1], 'meta', 'first child of <head> is not a <meta>');
  assert.match(first?.[2] ?? '', /http-equiv\s*=\s*"Content-Security-Policy"/i, 'first child is not the CSP');
  const content = first?.[2].match(/content\s*=\s*"([^"]*)"/i)?.[1] ?? '';
  const policy = new Map(content.split(';').map((d) => d.trim().split(/\s+/)).filter((p) => p[0]).map(([name, ...src]) => [name, src]));
  for (const [name, sources] of Object.entries(BASELINE)) {
    const got = policy.get(name);
    assert.ok(got, `directive ${name} is missing`);
    for (const s of got) assert.ok(sources.includes(s), `${name} allows ${s}, which the baseline does not`);
  }
  for (const [name, src] of policy) {
    assert.ok(name in BASELINE, `unexpected directive ${name}`);
    assert.ok(!src.some((s) => /unsafe|\*|^https?:/.test(s)), `${name} is relaxed`);
  }
  // The CSP must come before every script and stylesheet.
  assert.ok(html.indexOf('Content-Security-Policy') < html.search(/<script|<link/i));
});

test('BUILD-03 the referrer policy is no-referrer', () => {
  assert.match(html, /<meta\s+name="referrer"\s+content="no-referrer"\s*>/i);
});

test('BUILD-04 no "battlezone" anywhere in the artifact, in a file name or its contents', () => {
  const hits = files.filter((f) => /battlezone/i.test(f) || /battlezone/i.test(/** @type {string} */ (text.get(f))));
  assert.deepEqual(hits, []);
});
