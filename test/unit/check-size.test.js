import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { folderSize, LIMIT_BYTES } from '../../scripts/check-size.js';

test('folderSize adds up files in nested folders', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'wt-size-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'src', 'core'), { recursive: true });
  await writeFile(join(dir, 'index.html'), 'x'.repeat(100));
  await writeFile(join(dir, 'src', 'core', 'a.js'), 'y'.repeat(250));
  assert.equal(await folderSize(dir), 350);
});

test('the page-weight limit is 500 KB', () => {
  assert.equal(LIMIT_BYTES, 500_000);
});
