// One-way mirror from the Buzz relay (origin) to GitHub (SEC-12, SEC-13).
//
//   node scripts/mirror.js                 push origin/main to GitHub main
//   node scripts/mirror.js <branch> ...    also push PR branches so CI runs on them
//
// Only what is on the relay is pushed, never a local branch. Each ref is
// scanned with gitleaks first (SEC-14), and main is never force-pushed.
// The token is read by git's credential helper from a file outside the
// repo and is never printed. See docs/DEPLOY_RUNBOOK.md.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const url = process.env.WT_MIRROR_URL ?? 'https://github.com/robinwintertaylor/Battle-Tank.git';
const tokenFile = process.env.WT_MIRROR_TOKEN_FILE
  ?? join(homedir(), '.config', 'wireframe-tanks', 'github-mirror-token');
const branches = process.argv.slice(2);
if (!branches.includes('main')) branches.unshift('main');

/** @param {string} cmd @param {string[]} args @param {object} [env] */
function run(cmd, args, env) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`Stopped: ${cmd} ${args[0]} exited with ${result.status}.`);
    process.exit(1);
  }
}

if (!existsSync(tokenFile)) {
  console.error(`No token file at ${tokenFile}. See docs/DEPLOY_RUNBOOK.md.`);
  process.exit(1);
}

run('git', ['fetch', '--prune', 'origin']);

const refspecs = branches.map((branch) => {
  const source = `refs/remotes/origin/${branch}`;
  run('git', ['rev-parse', '--verify', '--quiet', source]);
  run('gitleaks', ['git', '--redact', '--no-banner', '--exit-code', '1', `--log-opts=${source}`, '.']);
  return branch === 'main' ? `${source}:refs/heads/main` : `+${source}:refs/heads/${branch}`;
});

const helper = '!f() { test "$1" = get || exit 0; echo username=x-access-token; printf "password=%s\n" "$(tr -d "\r\n" < "$WT_TOKEN_FILE")"; }; f';
run('git', ['-c', 'credential.helper=', '-c', `credential.helper=${helper}`, 'push', url, ...refspecs],
  // Git runs the helper in sh, which eats the backslashes in C:\Users\...
  { WT_TOKEN_FILE: tokenFile.replaceAll('\\', '/'), GIT_TERMINAL_PROMPT: '0' });
console.log(`Mirrored ${branches.join(', ')} to ${url}`);
