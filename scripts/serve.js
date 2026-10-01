// Tiny static server for site/, used by Playwright and for local play.
// It serves the site under /Battle-Tank/, the same path GitHub Pages
// uses for this project site, so absolute URLs break here as they would live.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = '/Battle-Tank/';
const ROOT = resolve(fileURLToPath(new URL('../site', import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Map a request path to a file under root, or null if it is outside the site.
 * @param {string} urlPath
 * @param {string} [root]
 */
export function resolvePath(urlPath, root = ROOT) {
  if (!urlPath.startsWith(BASE)) return null;
  let rel;
  try {
    rel = decodeURIComponent(urlPath.slice(BASE.length));
  } catch {
    return null;
  }
  if (rel.includes('\0')) return null;
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = resolve(join(root, normalize(rel)));
  if (file !== root && !file.startsWith(root + sep)) return null;
  return file;
}

/** @param {string} [root] */
export function createSiteServer(root = ROOT) {
  return createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    if (path === '/' || path === BASE.slice(0, -1)) {
      res.writeHead(301, { Location: BASE }).end();
      return;
    }
    const file = resolvePath(path, root);
    const info = file ? await stat(file).catch(() => null) : null;
    if (!file || !info?.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[/** @type {keyof typeof TYPES} */ (extname(file))] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? '127.0.0.1';
  createSiteServer().listen(port, host, () => {
    console.log(`Serving site/ at http://${host}:${port}${BASE}`);
  });
}
