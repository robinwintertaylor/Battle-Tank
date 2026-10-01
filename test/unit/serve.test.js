import assert from 'node:assert/strict';
import { once } from 'node:events';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { createSiteServer, resolvePath } from '../../scripts/serve.js';

const root = resolve('site-root');

test('resolvePath maps the Pages base path into the site folder', () => {
  assert.equal(resolvePath('/wireframe-tanks/', root), join(root, 'index.html'));
  assert.equal(resolvePath('/wireframe-tanks/src/main.js', root), join(root, 'src', 'main.js'));
});

test('resolvePath refuses paths outside the base or the site folder', () => {
  assert.equal(resolvePath('/index.html', root), null);
  assert.equal(resolvePath('/wireframe-tanks/../package.json', root), null);
  assert.equal(resolvePath('/wireframe-tanks/%2e%2e/package.json', root), null);
  assert.equal(resolvePath('/wireframe-tanks/%E0%A4%A', root), null);
});

/** @type {import('node:http').Server} */
let server;
let base = '';
before(async () => {
  server = createSiteServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  base = `http://127.0.0.1:${address.port}`;
});
after(() => server.close());

test('serves index.html with an HTML content type', async () => {
  const res = await fetch(`${base}/wireframe-tanks/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^text\/html/);
  assert.match(await res.text(), /Content-Security-Policy/);
});

test('serves modules with a JavaScript content type', async () => {
  const res = await fetch(`${base}/wireframe-tanks/src/main.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^text\/javascript/);
});

test('redirects the bare paths to the base path', async () => {
  for (const path of ['/', '/wireframe-tanks']) {
    const res = await fetch(`${base}${path}`, { redirect: 'manual' });
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), '/wireframe-tanks/');
  }
});

test('returns 404 for missing files and 405 for other methods', async () => {
  assert.equal((await fetch(`${base}/wireframe-tanks/nope.js`)).status, 404);
  assert.equal((await fetch(`${base}/wireframe-tanks/`, { method: 'POST' })).status, 405);
});
