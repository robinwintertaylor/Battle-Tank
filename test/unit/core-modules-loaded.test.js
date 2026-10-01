// Node's coverage only counts files that a test loads, so a core module
// with no test at all would slip past the 90% gate. Loading every module
// here makes an untested one show up as uncovered (TEST_STRATEGY.md 3.1).
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const core = fileURLToPath(new URL('../../site/src/core/', import.meta.url));

test('every core module loads in Node without the browser', async () => {
  const files = (await readdir(core, { recursive: true })).filter((name) => name.endsWith('.js'));
  for (const name of files) {
    await import(pathToFileURL(join(core, name)).href);
  }
});
