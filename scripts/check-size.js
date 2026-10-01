// Fails if the published folder, site/, is over the page-weight budget
// (M12, ARCHITECTURE.md section 6.3).
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIMIT_BYTES = 500 * 1000;

/**
 * Total size in bytes of every file under dir.
 * @param {string} dir
 * @returns {Promise<number>}
 */
export async function folderSize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += await folderSize(path);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const site = fileURLToPath(new URL('../site', import.meta.url));
  const bytes = await folderSize(site);
  const kb = (bytes / 1000).toFixed(1);
  if (bytes > LIMIT_BYTES) {
    console.error(`site/ is ${kb} KB, over the ${LIMIT_BYTES / 1000} KB limit.`);
    process.exit(1);
  }
  console.log(`site/ is ${kb} KB, within the ${LIMIT_BYTES / 1000} KB limit.`);
}
